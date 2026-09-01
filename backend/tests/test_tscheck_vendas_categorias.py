"""Criterion: relatorio de vendas por categoria separa Pasteis x Bebidas, com caldo de
cana contado como BEBIDA; filtro por grupo e por produto especifico funciona; atendente
recebe 403."""
import datetime
import random

from tests.helpers import auth_headers


def test_vendas_categorias_agrupa_caldo_como_bebida_e_filtra(client):
    headers_at = auth_headers("atendente")
    headers_admin = auth_headers("admin")

    produtos = client.get("/produtos", headers=headers_at).json()
    caldo = next(p for p in produtos if "Caldo de Cana 300ml" in p["nome"])
    pastel = next(p for p in produtos if p["categoria"] == "pastel")

    numero_mesa = random.randint(30000, 39999)
    r_mesa = client.post("/mesas", json={"numero": numero_mesa, "capacidade": 4}, headers=headers_at)
    assert r_mesa.status_code == 201, r_mesa.text
    mesa_id = r_mesa.json()["id"]

    r_pedido = client.post(
        "/pedidos",
        json={
            "clienteNome": "tscheck-vendas-categorias",
            "mesaId": mesa_id,
            "itens": [
                {"produtoId": caldo["id"], "quantidade": 2},
                {"produtoId": pastel["id"], "quantidade": 1},
            ],
        },
        headers=headers_at,
    )
    assert r_pedido.status_code == 201, r_pedido.text
    pedido = r_pedido.json()
    total = pedido["total"]
    r_pag = client.post(
        f"/pedidos/{pedido['id']}/pagamento",
        json={"forma": "PIX", "valorRecebido": total},
        headers=headers_at,
    )
    assert r_pag.status_code == 200, r_pag.text

    hoje = datetime.date.today().isoformat()

    # 403 para atendente
    r_403 = client.get(
        "/caixa/vendas-categorias", params={"dataInicio": hoje, "dataFim": hoje}, headers=headers_at
    )
    assert r_403.status_code == 403, r_403.text

    # admin sem filtro: caldo aparece no grupo Bebidas, nunca em Pasteis
    r_all = client.get(
        "/caixa/vendas-categorias", params={"dataInicio": hoje, "dataFim": hoje}, headers=headers_admin
    )
    assert r_all.status_code == 200, r_all.text
    data = r_all.json()
    prod_caldo = next(p for p in data["produtos"] if p["produtoId"] == caldo["id"])
    assert prod_caldo["grupo"].lower().startswith("bebida"), prod_caldo
    prod_pastel = next(p for p in data["produtos"] if p["produtoId"] == pastel["id"])
    assert "pastel" in prod_pastel["grupo"].lower() or "past" in prod_pastel["grupo"].lower(), prod_pastel
    assert prod_pastel["grupo"] != prod_caldo["grupo"]
    assert "bebida" not in prod_pastel["grupo"].lower()

    grupos_by_name = {g["grupo"].lower(): g for g in data["grupos"]}
    bebidas_grupo = next(v for k, v in grupos_by_name.items() if "bebida" in k)
    assert bebidas_grupo["quantidade"] >= 2
    assert bebidas_grupo["valor"] >= round(2 * caldo["preco"], 2)

    # filtro por grupo=Bebidas retorna somente produtos de bebida (inclui nosso caldo)
    grupo_bebida_nome = next(k for k in grupos_by_name if "bebida" in k)
    r_grupo = client.get(
        "/caixa/vendas-categorias",
        params={"dataInicio": hoje, "dataFim": hoje, "grupo": bebidas_grupo["grupo"]},
        headers=headers_admin,
    )
    assert r_grupo.status_code == 200, r_grupo.text
    data_grupo = r_grupo.json()
    assert all(p["grupo"] == bebidas_grupo["grupo"] for p in data_grupo["produtos"])
    assert any(p["produtoId"] == caldo["id"] for p in data_grupo["produtos"])
    assert not any(p["produtoId"] == pastel["id"] for p in data_grupo["produtos"])

    # filtro por produto especifico (caldo) retorna somente aquele produto
    r_prod = client.get(
        "/caixa/vendas-categorias",
        params={"dataInicio": hoje, "dataFim": hoje, "produtoId": caldo["id"]},
        headers=headers_admin,
    )
    assert r_prod.status_code == 200, r_prod.text
    data_prod = r_prod.json()
    assert len(data_prod["produtos"]) == 1
    assert data_prod["produtos"][0]["produtoId"] == caldo["id"]
    assert data_prod["produtos"][0]["quantidade"] >= 2
