"""Criterion: DEV altera máscara da comanda (aplica no próximo pedido) e restaura;
máscara sem '#' é rejeitada."""
from tests.helpers import auth_headers


def test_dev_altera_mascara_comanda_e_restaura(client):
    headers_dev = auth_headers("dev")

    # máscara inválida (sem '#') é rejeitada
    r_invalida = client.put(
        "/configuracoes/mascaraComanda", json={"valor": "SEMHASH"}, headers=headers_dev
    )
    assert r_invalida.status_code == 400, r_invalida.text
    assert "#" in r_invalida.json()["detail"]

    r_set = client.put(
        "/configuracoes/mascaraComanda", json={"valor": "TSCHECK-###"}, headers=headers_dev
    )
    assert r_set.status_code == 200, r_set.text
    assert r_set.json()["valor"] == "TSCHECK-###"

    produto_id = client.get("/produtos", headers=headers_dev).json()[0]["id"]
    r_pedido = client.post(
        "/pedidos",
        json={"clienteNome": "tscheck-mascara", "itens": [{"produtoId": produto_id, "quantidade": 1}]},
        headers=headers_dev,
    )
    assert r_pedido.status_code == 201, r_pedido.text
    comanda = r_pedido.json()["numeroComanda"]
    assert comanda.startswith("TSCHECK-"), f"comanda não usou a máscara nova: {comanda}"

    # restaura para o padrão original, exigido pelo critério
    r_restaura = client.put(
        "/configuracoes/mascaraComanda", json={"valor": "###"}, headers=headers_dev
    )
    assert r_restaura.status_code == 200, r_restaura.text
    assert r_restaura.json()["valor"] == "###"
