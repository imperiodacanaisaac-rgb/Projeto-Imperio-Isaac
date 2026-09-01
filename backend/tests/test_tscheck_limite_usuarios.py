"""Criterion: limite de usuarios aplicado no backend, controlado apenas pelo DEV.
Admin recebe 400 ao atingir o limite; DEV aumenta o limite e admin volta a conseguir
criar; admin recebe 403 ao tentar alterar o limite; valor 0/nao-numerico rejeitado."""
import random

from tests.helpers import auth_headers


def test_limite_usuarios_backend(client):
    headers_admin = auth_headers("admin")
    headers_dev = auth_headers("dev")

    # admin nao pode alterar o limite
    r_403 = client.put("/configuracoes/limiteUsuarios", json={"valor": "50"}, headers=headers_admin)
    assert r_403.status_code == 403, r_403.text

    # valores invalidos rejeitados (DEV)
    r_zero = client.put("/configuracoes/limiteUsuarios", json={"valor": "0"}, headers=headers_dev)
    assert r_zero.status_code == 400, r_zero.text
    r_nan = client.put("/configuracoes/limiteUsuarios", json={"valor": "abc"}, headers=headers_dev)
    assert r_nan.status_code == 400, r_nan.text

    criados = []
    try:
        # Usa valores extremos (1 e 1000) em vez do numero exato de usuarios ativos, para
        # que o teste seja imune a criacoes concorrentes de outros modulos de teste
        # (pytest-xdist roda modulos em paralelo) sem depender de contagem exata.
        r_set = client.put(
            "/configuracoes/limiteUsuarios", json={"valor": "1"}, headers=headers_dev
        )
        assert r_set.status_code == 200, r_set.text

        sufixo = random.randint(100000, 999999)
        r_over = client.post(
            "/usuarios",
            json={
                "nome": f"tscheck-limite-{sufixo}",
                "usuario": f"tscheck-limite-{sufixo}",
                "senha": "senha12345",
                "role": "ATENDENTE",
            },
            headers=headers_admin,
        )
        assert r_over.status_code == 400, r_over.text
        assert "limite" in r_over.json()["detail"].lower()

        # DEV aumenta o limite bem acima do total realista de usuarios -> admin consegue criar
        r_up = client.put(
            "/configuracoes/limiteUsuarios", json={"valor": "1000"}, headers=headers_dev
        )
        assert r_up.status_code == 200, r_up.text

        r_ok = client.post(
            "/usuarios",
            json={
                "nome": f"tscheck-limite-{sufixo}",
                "usuario": f"tscheck-limite-{sufixo}",
                "senha": "senha12345",
                "role": "ATENDENTE",
            },
            headers=headers_admin,
        )
        assert r_ok.status_code == 201, r_ok.text
        criados.append(r_ok.json()["id"])
    finally:
        # limpeza: exclui usuarios de teste criados e restaura limite para 5
        for uid in criados:
            client.delete(f"/usuarios/{uid}", headers=headers_dev)
        client.put("/configuracoes/limiteUsuarios", json={"valor": "5"}, headers=headers_dev)
