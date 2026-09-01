"""Criterion: em /produtos, o botao 'Remover' (PUT /produtos/{id} com imagemUrl=null)
deve limpar a imagem do produto (produto passa a usar o icone padrao da categoria)."""
import random

from tests.helpers import auth_headers


def test_remover_imagem_produto_limpa_imagemurl(client):
    headers_admin = auth_headers("admin")
    sufixo = random.randint(100000, 999999)

    r_create = client.post(
        "/produtos",
        json={
            "nome": f"tscheck-produto-imagem-{sufixo}",
            "preco": 5.5,
            "categoria": "caldo",
            "imagemUrl": "/marca/refrigerante.jpg",
        },
        headers=headers_admin,
    )
    assert r_create.status_code == 201, r_create.text
    produto = r_create.json()
    assert produto["imagemUrl"] == "/marca/refrigerante.jpg"

    # simula o botao "Remover": frontend envia imagemUrl=null para limpar a imagem
    r_update = client.put(
        f"/produtos/{produto['id']}",
        json={"imagemUrl": None},
        headers=headers_admin,
    )
    assert r_update.status_code == 200, r_update.text
    atualizado = r_update.json()
    assert atualizado["imagemUrl"] in (None, ""), (
        f"BUG: imagemUrl não foi limpo pelo PUT com imagemUrl=null -> ainda é {atualizado['imagemUrl']!r}. "
        "Causa provável: routers/produtos.py usa body.model_dump(exclude_none=True), que descarta o "
        "campo quando o valor enviado é null, então a remoção de imagem nunca é persistida."
    )

    # confirma via GET que a limpeza persistiu
    r_get = client.get("/produtos", headers=headers_admin)
    assert r_get.status_code == 200, r_get.text
    prod_get = next(p for p in r_get.json() if p["id"] == produto["id"])
    assert prod_get["imagemUrl"] in (None, ""), (
        f"BUG: GET /produtos ainda retorna imagemUrl={prod_get['imagemUrl']!r} após remocao"
    )

    # troca de um icone para outro continua funcionando
    r_troca = client.put(
        f"/produtos/{produto['id']}",
        json={"imagemUrl": "/marca/pastel.jpg"},
        headers=headers_admin,
    )
    assert r_troca.status_code == 200, r_troca.text
    assert r_troca.json()["imagemUrl"] == "/marca/pastel.jpg"

    # PUT com nome=null (junto de outro campo valido) NAO apaga o nome (campo obrigatorio protegido)
    nome_antes = r_troca.json()["nome"]
    r_nome_null = client.put(
        f"/produtos/{produto['id']}",
        json={"nome": None, "preco": 6.75},
        headers=headers_admin,
    )
    assert r_nome_null.status_code == 200, r_nome_null.text
    assert r_nome_null.json()["nome"] == nome_antes, (
        "BUG: PUT com nome=null apagou/alterou o nome do produto"
    )
    assert r_nome_null.json()["preco"] == 6.75

    # PUT com nome=null isolado (sem outro campo) nao apaga o nome; como nao ha nenhum
    # campo valido restante para atualizar, o backend retorna 400 (nao ha bug: o nome
    # permanece intacto, apenas nao ha operacao a persistir).
    r_nome_null_isolado = client.put(
        f"/produtos/{produto['id']}",
        json={"nome": None},
        headers=headers_admin,
    )
    assert r_nome_null_isolado.status_code == 400, r_nome_null_isolado.text
    r_check_intacto = client.get("/produtos", headers=headers_admin)
    prod_intacto = next(p for p in r_check_intacto.json() if p["id"] == produto["id"])
    assert prod_intacto["nome"] == nome_antes, "BUG: nome foi apagado por PUT nome=null isolado"

    # PUT com nome em branco ("   ") deve ser rejeitado com 400
    r_nome_branco = client.put(
        f"/produtos/{produto['id']}",
        json={"nome": "   "},
        headers=headers_admin,
    )
    assert r_nome_branco.status_code == 400, r_nome_branco.text

    # limpeza
    client.delete(f"/produtos/{produto['id']}", headers=headers_admin)
