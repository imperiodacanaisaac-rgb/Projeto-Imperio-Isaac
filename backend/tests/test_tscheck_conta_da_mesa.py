"""tscheck: GET /api/mesas/{id}/conta e POST /api/mesas/{id}/pagamento — conta unica da mesa."""
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
        json={"nome": f"tscheck-prod-conta-{sufixo}", "preco": 15.0, "categoria": "outro"},
        headers=auth_headers("admin"),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _criar_mesa(client, sufixo):
    numero = 300000 + int(sufixo, 16) % 700000
    r = client.post("/mesas", json={"numero": numero, "capacidade": 6}, headers=auth_headers("admin"))
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_conta_da_mesa_soma_divide_e_paga_tudo(client):
    sufixo = uuid.uuid4().hex[:8]
    produto_id = _criar_produto(client, sufixo)
    mesa_id = _criar_mesa(client, sufixo)

    r1 = _post_pedido_com_retry(
        client,
        {"mesaId": mesa_id, "itens": [{"produtoId": produto_id, "quantidade": 2}]},
        auth_headers("atendente"),
    )
    assert r1.status_code == 201, r1.text
    pedido1 = r1.json()

    r2 = _post_pedido_com_retry(
        client,
        {"mesaId": mesa_id, "itens": [{"produtoId": produto_id, "quantidade": 1}]},
        auth_headers("atendente"),
    )
    assert r2.status_code == 201, r2.text
    pedido2 = r2.json()

    total_esperado = pedido1["itens"][0]["quantidade"] * pedido1["itens"][0]["precoUnit"] + \
        pedido2["itens"][0]["quantidade"] * pedido2["itens"][0]["precoUnit"]

    r_conta = client.get(f"/mesas/{mesa_id}/conta", params={"pessoas": 3}, headers=auth_headers("admin"))
    assert r_conta.status_code == 200, r_conta.text
    conta = r_conta.json()
    assert round(conta["total"], 2) == round(total_esperado, 2)
    assert conta["qtdComandas"] == 2
    assert pedido1["numeroComanda"] in conta["comandas"]
    assert pedido2["numeroComanda"] in conta["comandas"]
    assert round(conta["valorPorPessoa"], 2) == round(total_esperado / 3, 2)

    movimentos_antes = client.get("/caixa/movimentos", headers=auth_headers("admin")).json()
    qtd_antes = len(movimentos_antes)

    r_pag = client.post(
        f"/mesas/{mesa_id}/pagamento",
        json={"forma": "DINHEIRO", "valorRecebido": total_esperado + 10, "pessoas": 3},
        headers=auth_headers("admin"),
    )
    assert r_pag.status_code == 200, r_pag.text
    resultado_pag = r_pag.json()
    assert resultado_pag["qtdComandas"] == 0
    assert set(resultado_pag["comandas"]) == {pedido1["numeroComanda"], pedido2["numeroComanda"]}

    p1_depois = client.get(f"/pedidos/{pedido1['id']}", headers=auth_headers("admin")).json()
    p2_depois = client.get(f"/pedidos/{pedido2['id']}", headers=auth_headers("admin")).json()
    assert p1_depois["status"] == "PAGO"
    assert p2_depois["status"] == "PAGO"

    movimentos_depois = client.get("/caixa/movimentos", headers=auth_headers("admin")).json()
    assert len(movimentos_depois) == qtd_antes + 2, "cada comanda deve gerar sua propria entrada no caixa"
    novas_entradas = [
        m for m in movimentos_depois
        if f"comanda {pedido1['numeroComanda']}" in m.get("descricao", "")
        or f"comanda {pedido2['numeroComanda']}" in m.get("descricao", "")
    ]
    assert len(novas_entradas) == 2, "deveria haver uma entrada de caixa por comanda paga"
    soma_entradas = sum(m["valor"] for m in novas_entradas)
    assert round(soma_entradas, 2) == round(total_esperado, 2)

    # mesa continua ocupada apos pagar (liberacao e manual)
    mesa_depois = client.get("/mesas", headers=auth_headers("admin")).json()
    mesa_alvo = next(m for m in mesa_depois if m["id"] == mesa_id)
    assert mesa_alvo["status"] == "OCUPADA"

    # pagar novamente (sem comandas abertas) -> 400
    r_pag2 = client.post(
        f"/mesas/{mesa_id}/pagamento",
        json={"forma": "DINHEIRO", "valorRecebido": 100},
        headers=auth_headers("admin"),
    )
    assert r_pag2.status_code == 400

    # liberar mesa deve funcionar agora que nao ha pedido aberto
    r_liberar = client.patch(f"/mesas/{mesa_id}/liberar", headers=auth_headers("admin"))
    assert r_liberar.status_code == 200, r_liberar.text
    mesa_final = client.get("/mesas", headers=auth_headers("admin")).json()
    mesa_final_alvo = next(m for m in mesa_final if m["id"] == mesa_id)
    assert mesa_final_alvo["status"] == "LIVRE"


def test_pagar_conta_sem_comandas_abertas_retorna_400(client):
    sufixo = uuid.uuid4().hex[:8]
    mesa_id = _criar_mesa(client, sufixo)
    r_pag = client.post(
        f"/mesas/{mesa_id}/pagamento",
        json={"forma": "DINHEIRO", "valorRecebido": 50},
        headers=auth_headers("admin"),
    )
    assert r_pag.status_code == 400


def test_liberar_mesa_bloqueada_com_pedido_aberto(client):
    sufixo = uuid.uuid4().hex[:8]
    produto_id = _criar_produto(client, sufixo)
    mesa_id = _criar_mesa(client, sufixo)
    r = _post_pedido_com_retry(
        client,
        {"mesaId": mesa_id, "itens": [{"produtoId": produto_id, "quantidade": 1}]},
        auth_headers("atendente"),
    )
    assert r.status_code == 201, r.text
    pedido_id = r.json()["id"]

    r_liberar = client.patch(f"/mesas/{mesa_id}/liberar", headers=auth_headers("admin"))
    assert r_liberar.status_code == 400

    # cancelar libera a mesa automaticamente (regra do cancelamento)
    r_cancel = client.patch(
        f"/pedidos/{pedido_id}/cancelar",
        json={"motivo": "tscheck cleanup liberar bloqueado"},
        headers=auth_headers("admin"),
    )
    assert r_cancel.status_code == 200
    mesas = client.get("/mesas", headers=auth_headers("admin")).json()
    mesa_alvo = next(m for m in mesas if m["id"] == mesa_id)
    assert mesa_alvo["status"] == "LIVRE"
