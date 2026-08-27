"""Criterion: confirmar pagamento calcula troco, libera mesa, lança entrada no caixa;
pagamento duplicado é bloqueado."""
import random

from tests.helpers import auth_headers


def test_pagamento_troco_libera_mesa_e_lanca_caixa(client):
    headers_at = auth_headers("atendente")
    headers_admin = auth_headers("admin")
    numero_mesa = random.randint(9000, 9999)

    r_mesa = client.post("/mesas", json={"numero": numero_mesa, "capacidade": 4}, headers=headers_at)
    assert r_mesa.status_code == 201, r_mesa.text
    mesa_id = r_mesa.json()["id"]

    produtos = client.get("/produtos", headers=headers_at).json()
    produto = produtos[0]

    r_pedido = client.post(
        "/pedidos",
        json={
            "clienteNome": "tscheck-pagamento",
            "mesaId": mesa_id,
            "itens": [{"produtoId": produto["id"], "quantidade": 1}],
        },
        headers=headers_at,
    )
    assert r_pedido.status_code == 201, r_pedido.text
    pedido = r_pedido.json()
    total = pedido["total"]
    assert total == produto["preco"]

    recebido = round(total + 5, 2)
    r_pag = client.post(
        f"/pedidos/{pedido['id']}/pagamento",
        json={"forma": "DINHEIRO", "valorRecebido": recebido},
        headers=headers_at,
    )
    assert r_pag.status_code == 200, f"POST pagamento -> {r_pag.status_code} {r_pag.text}"
    pago = r_pag.json()
    assert pago["status"] == "PAGO", pago["status"]
    assert pago["pagamento"]["troco"] == round(recebido - total, 2)

    # mesa liberada
    mesas = client.get("/mesas", headers=headers_at).json()
    mesa_atual = next(m for m in mesas if m["id"] == mesa_id)
    assert mesa_atual["status"] == "LIVRE", f"mesa não liberada: {mesa_atual}"

    # entrada aparece no caixa (admin)
    movimentos = client.get("/caixa/movimentos", headers=headers_admin)
    assert movimentos.status_code == 200, movimentos.text
    descricoes = [m["descricao"] for m in movimentos.json()]
    assert any(pedido["numeroComanda"] in d for d in descricoes), (
        f"comanda {pedido['numeroComanda']} não encontrada nas entradas do caixa"
    )

    # pagamento duplicado bloqueado
    r_pag2 = client.post(
        f"/pedidos/{pedido['id']}/pagamento",
        json={"forma": "DINHEIRO", "valorRecebido": recebido},
        headers=headers_at,
    )
    assert r_pag2.status_code == 400, r_pag2.text
    assert "já foi" in r_pag2.json()["detail"].lower()
