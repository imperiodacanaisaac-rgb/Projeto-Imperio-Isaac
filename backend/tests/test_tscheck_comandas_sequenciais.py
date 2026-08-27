"""Criterion: comandas sequenciais + mesa vinculada fica OCUPADA."""
import random

from tests.helpers import auth_headers


def test_comandas_sequenciais_e_mesa_ocupada(client):
    headers = auth_headers("atendente")
    numero_mesa = random.randint(9000, 9999)

    r_mesa = client.post("/mesas", json={"numero": numero_mesa, "capacidade": 4}, headers=headers)
    assert r_mesa.status_code == 201, r_mesa.text
    mesa_id = r_mesa.json()["id"]

    produtos = client.get("/produtos", headers=headers)
    assert produtos.status_code == 200
    produto_id = produtos.json()[0]["id"]

    pedido_body = {
        "clienteNome": "tscheck-cliente",
        "mesaId": mesa_id,
        "itens": [{"produtoId": produto_id, "quantidade": 1}],
    }

    r1 = client.post("/pedidos", json=pedido_body, headers=headers)
    assert r1.status_code == 201, f"POST /pedidos #1 -> {r1.status_code} {r1.text}"
    comanda1 = r1.json()["numeroComanda"]

    pedido_body2 = dict(pedido_body)
    pedido_body2["mesaId"] = None  # segundo pedido no balcão para não exigir mesa livre
    r2 = client.post("/pedidos", json=pedido_body2, headers=headers)
    assert r2.status_code == 201, f"POST /pedidos #2 -> {r2.status_code} {r2.text}"
    comanda2 = r2.json()["numeroComanda"]

    assert comanda1 != comanda2
    # Ambas seguem a máscara padrão "###" -> comparáveis numericamente.
    assert int(comanda2) > int(comanda1), f"{comanda1} -> {comanda2} não é sequencial crescente"

    r_mesa_status = client.get("/mesas", headers=headers)
    assert r_mesa_status.status_code == 200
    mesa_atual = next(m for m in r_mesa_status.json() if m["id"] == mesa_id)
    assert mesa_atual["status"] == "OCUPADA", f"mesa não ficou OCUPADA: {mesa_atual}"
