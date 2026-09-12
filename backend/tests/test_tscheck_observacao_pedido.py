"""tscheck: observacao do pedido (bug reportado - nao saia na comanda impressa).

Cobre os criterios de API do briefing:
- GET /api/pedidos/{id} e GET /api/pedidos/{id}/comanda devolvem `observacao`.
- Observacao so com espacos e normalizada para null (nao vira string vazia).
- Observacao do pedido convive com observacao POR ITEM (uma nao substitui a outra).
"""
import uuid

from tests.helpers import auth_headers


def _criar_produto(client, sufixo):
    r = client.post(
        "/produtos",
        json={"nome": f"tscheck-prod-obs-{sufixo}", "preco": 12.5, "categoria": "outro"},
        headers=auth_headers("admin"),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_observacao_do_pedido_e_do_item_convivem_e_aparecem_nos_dois_endpoints(client):
    sufixo = uuid.uuid4().hex[:8]
    produto_id = _criar_produto(client, sufixo)
    texto_obs_pedido = f"tscheck-obs-pedido-{sufixo} sem cebola, entregar na varanda"
    texto_obs_item = f"tscheck-obs-item-{sufixo} bem gelado"

    r = client.post(
        "/pedidos",
        json={
            "itens": [
                {"produtoId": produto_id, "quantidade": 1, "observacao": texto_obs_item}
            ],
            "observacao": texto_obs_pedido,
        },
        headers=auth_headers("atendente"),
    )
    assert r.status_code == 201, r.text
    pedido = r.json()
    pedido_id = pedido["id"]

    # observacao do pedido volta no proprio POST
    assert pedido["observacao"] == texto_obs_pedido
    assert pedido["itens"][0]["observacao"] == texto_obs_item

    # GET /api/pedidos/{id}
    r_get = client.get(f"/pedidos/{pedido_id}", headers=auth_headers("admin"))
    assert r_get.status_code == 200, r_get.text
    pedido_get = r_get.json()
    assert pedido_get["observacao"] == texto_obs_pedido
    assert pedido_get["itens"][0]["observacao"] == texto_obs_item

    # GET /api/pedidos/{id}/comanda
    r_comanda = client.get(f"/pedidos/{pedido_id}/comanda", headers=auth_headers("admin"))
    assert r_comanda.status_code == 200, r_comanda.text
    comanda = r_comanda.json()
    assert comanda["observacao"] == texto_obs_pedido
    assert comanda["itens"][0]["observacao"] == texto_obs_item

    client.patch(
        f"/pedidos/{pedido_id}/cancelar",
        json={"motivo": "tscheck cleanup observacao pedido"},
        headers=auth_headers("admin"),
    )


def test_observacao_so_com_espacos_normaliza_para_null(client):
    sufixo = uuid.uuid4().hex[:8]
    produto_id = _criar_produto(client, sufixo)

    r = client.post(
        "/pedidos",
        json={
            "itens": [{"produtoId": produto_id, "quantidade": 1}],
            "observacao": "   ",
        },
        headers=auth_headers("atendente"),
    )
    assert r.status_code == 201, r.text
    pedido = r.json()
    pedido_id = pedido["id"]
    assert pedido["observacao"] is None, "observacao so com espacos deveria virar null, nao string vazia"

    r_comanda = client.get(f"/pedidos/{pedido_id}/comanda", headers=auth_headers("admin"))
    assert r_comanda.status_code == 200, r_comanda.text
    assert r_comanda.json()["observacao"] is None

    client.patch(
        f"/pedidos/{pedido_id}/cancelar",
        json={"motivo": "tscheck cleanup observacao vazia"},
        headers=auth_headers("admin"),
    )
