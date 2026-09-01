"""Criterion: pagamento NAO libera a mesa; liberacao e manual via PATCH /mesas/{id}/liberar,
bloqueada com pedido ABERTO na mesa; historico de pedidos continua consultavel apos liberar."""
import random

from tests.helpers import auth_headers


def _criar_pedido(client, headers, mesa_id, produto_id, cliente):
    r = client.post(
        "/pedidos",
        json={
            "clienteNome": cliente,
            "mesaId": mesa_id,
            "itens": [{"produtoId": produto_id, "quantidade": 1}],
        },
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_liberar_mesa_manual_apos_pagamento(client):
    headers_at = auth_headers("atendente")
    numero_mesa = random.randint(20000, 29999)

    r_mesa = client.post("/mesas", json={"numero": numero_mesa, "capacidade": 4}, headers=headers_at)
    assert r_mesa.status_code == 201, r_mesa.text
    mesa_id = r_mesa.json()["id"]

    produto = client.get("/produtos", headers=headers_at).json()[0]

    pedido1 = _criar_pedido(client, headers_at, mesa_id, produto["id"], "tscheck-liberar-1")

    # mesa OCUPADA apos pedido
    mesas = client.get("/mesas", headers=headers_at).json()
    assert next(m for m in mesas if m["id"] == mesa_id)["status"] == "OCUPADA"

    # liberar bloqueado com pedido ABERTO
    r_bloq = client.patch(f"/mesas/{mesa_id}/liberar", headers=headers_at)
    assert r_bloq.status_code == 400, r_bloq.text
    assert "aberto" in r_bloq.json()["detail"].lower()

    # pagar pedido
    total = pedido1["total"]
    r_pag = client.post(
        f"/pedidos/{pedido1['id']}/pagamento",
        json={"forma": "PIX", "valorRecebido": total},
        headers=headers_at,
    )
    assert r_pag.status_code == 200, r_pag.text
    assert r_pag.json()["status"] == "PAGO"

    # mesa continua OCUPADA apos pagamento
    mesas = client.get("/mesas", headers=headers_at).json()
    assert next(m for m in mesas if m["id"] == mesa_id)["status"] == "OCUPADA"

    # novo pedido na mesma mesa (ainda OCUPADA) e permitido
    pedido2 = _criar_pedido(client, headers_at, mesa_id, produto["id"], "tscheck-liberar-2")

    # paga o segundo pedido tambem, agora sem ABERTOs
    r_pag2 = client.post(
        f"/pedidos/{pedido2['id']}/pagamento",
        json={"forma": "PIX", "valorRecebido": pedido2["total"]},
        headers=headers_at,
    )
    assert r_pag2.status_code == 200, r_pag2.text

    # liberar agora funciona
    r_lib = client.patch(f"/mesas/{mesa_id}/liberar", headers=headers_at)
    assert r_lib.status_code == 200, r_lib.text
    assert r_lib.json()["status"] == "LIVRE"

    # historico de pedidos da mesa continua consultavel
    hist = client.get("/pedidos", params={"mesaId": mesa_id}, headers=headers_at)
    assert hist.status_code == 200, hist.text
    ids_hist = {p["id"] for p in hist.json()}
    assert pedido1["id"] in ids_hist and pedido2["id"] in ids_hist
