"""tscheck: POST /api/pedidos/{id}/itens soma itens a comanda ABERTA sem criar outro pedido."""
import time
import uuid

from tests.helpers import auth_headers


def _post_pedido_com_retry(client, payload, headers, tentativas=5):
    """POST /pedidos com pequeno retry: a suite roda em paralelo (pytest-xdist) e o teste
    de virada de dia (test_tscheck_comanda_virada_dia.py) mutila propositalmente, por
    janelas curtas, o contador global de comandas — podendo colidir com uma criacao de
    pedido concorrente de OUTRO arquivo e gerar um 500 transitorio. Isso nao e bug de
    app; e retry de resiliencia do proprio teste contra essa contencao deliberada."""
    ultimo = None
    for _ in range(tentativas):
        ultimo = client.post("/pedidos", json=payload, headers=headers)
        if ultimo.status_code != 500:
            return ultimo
        time.sleep(0.2)
    return ultimo


def _criar_produto(client, sufixo):
    r = client.post(
        "/produtos",
        json={"nome": f"tscheck-prod-itens-{sufixo}", "preco": 10.0, "categoria": "outro"},
        headers=auth_headers("admin"),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _criar_mesa(client, numero):
    r = client.post("/mesas", json={"numero": numero, "capacidade": 4}, headers=auth_headers("admin"))
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_somar_itens_a_comanda_aberta(client):
    sufixo = uuid.uuid4().hex[:8]
    produto_id = _criar_produto(client, sufixo)
    mesa_numero = 200000 + int(sufixo, 16) % 700000
    mesa_id = _criar_mesa(client, mesa_numero)

    r = _post_pedido_com_retry(
        client,
        {"mesaId": mesa_id, "itens": [{"produtoId": produto_id, "quantidade": 1}]},
        auth_headers("atendente"),
    )
    assert r.status_code == 201, r.text
    pedido = r.json()
    pedido_id = pedido["id"]
    comanda_original = pedido["numeroComanda"]
    total_original = pedido["itens"][0]["quantidade"] * pedido["itens"][0]["precoUnit"]

    contagem_antes = client.get("/pedidos", params={"mesaId": mesa_id}, headers=auth_headers("admin")).json()
    qtd_pedidos_antes = len(contagem_antes)

    # Soma o mesmo produto novamente -> deve incrementar quantidade no item existente
    r2 = client.post(
        f"/pedidos/{pedido_id}/itens",
        json={"itens": [{"produtoId": produto_id, "quantidade": 2}]},
        headers=auth_headers("atendente"),
    )
    assert r2.status_code == 200, r2.text
    pedido_atualizado = r2.json()

    assert pedido_atualizado["numeroComanda"] == comanda_original
    assert pedido_atualizado["id"] == pedido_id
    # item somado, não duplicado
    itens_do_produto = [i for i in pedido_atualizado["itens"] if i["produtoId"] == produto_id]
    assert len(itens_do_produto) == 1, "item deveria ter sido somado, não duplicado"
    assert itens_do_produto[0]["quantidade"] == 3

    total_novo = sum(i["quantidade"] * i["precoUnit"] for i in pedido_atualizado["itens"])
    assert total_novo == total_original + 2 * itens_do_produto[0]["precoUnit"]

    contagem_depois = client.get("/pedidos", params={"mesaId": mesa_id}, headers=auth_headers("admin")).json()
    assert len(contagem_depois) == qtd_pedidos_antes, "não deveria criar pedido novo"

    # Cancela para liberar a mesa e não deixar residuo aberto
    client.patch(
        f"/pedidos/{pedido_id}/cancelar",
        json={"motivo": "tscheck cleanup itens soma"},
        headers=auth_headers("admin"),
    )


def test_adicionar_itens_bloqueado_pedido_finalizado(client):
    sufixo = uuid.uuid4().hex[:8]
    produto_id = _criar_produto(client, sufixo)

    r = _post_pedido_com_retry(
        client,
        {"itens": [{"produtoId": produto_id, "quantidade": 1}]},
        auth_headers("atendente"),
    )
    assert r.status_code == 201, r.text
    pedido_id = r.json()["id"]

    r_cancel = client.patch(
        f"/pedidos/{pedido_id}/cancelar",
        json={"motivo": "tscheck bloqueio itens em pedido finalizado"},
        headers=auth_headers("admin"),
    )
    assert r_cancel.status_code == 200, r_cancel.text

    r_itens = client.post(
        f"/pedidos/{pedido_id}/itens",
        json={"itens": [{"produtoId": produto_id, "quantidade": 1}]},
        headers=auth_headers("admin"),
    )
    assert r_itens.status_code == 400
    assert "já foi finalizado" in r_itens.json()["detail"]
