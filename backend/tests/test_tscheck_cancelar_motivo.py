"""Criterion: cancelar pedido exige motivo válido e libera a mesa."""
import random

from tests.helpers import auth_headers


def test_cancelar_exige_motivo_e_libera_mesa(client):
    headers = auth_headers("atendente")
    numero_mesa = random.randint(9000, 9999)

    r_mesa = client.post("/mesas", json={"numero": numero_mesa, "capacidade": 4}, headers=headers)
    assert r_mesa.status_code == 201, r_mesa.text
    mesa_id = r_mesa.json()["id"]

    produto_id = client.get("/produtos", headers=headers).json()[0]["id"]
    r_pedido = client.post(
        "/pedidos",
        json={
            "clienteNome": "tscheck-cancelar",
            "mesaId": mesa_id,
            "itens": [{"produtoId": produto_id, "quantidade": 1}],
        },
        headers=headers,
    )
    assert r_pedido.status_code == 201, r_pedido.text
    pedido_id = r_pedido.json()["id"]

    # motivo vazio/curto é rejeitado (400 na regra de negócio ou 422 na validação Pydantic)
    r_vazio = client.patch(f"/pedidos/{pedido_id}/cancelar", json={"motivo": ""}, headers=headers)
    assert r_vazio.status_code in (400, 422), r_vazio.text

    motivo = "tscheck motivo de cancelamento valido"
    r_ok = client.patch(f"/pedidos/{pedido_id}/cancelar", json={"motivo": motivo}, headers=headers)
    assert r_ok.status_code == 200, f"PATCH cancelar -> {r_ok.status_code} {r_ok.text}"
    body = r_ok.json()
    assert body["status"] == "CANCELADO"
    assert body["canceladoMotivo"] == motivo

    mesas = client.get("/mesas", headers=headers).json()
    mesa_atual = next(m for m in mesas if m["id"] == mesa_id)
    assert mesa_atual["status"] == "LIVRE", f"mesa não liberada: {mesa_atual}"
