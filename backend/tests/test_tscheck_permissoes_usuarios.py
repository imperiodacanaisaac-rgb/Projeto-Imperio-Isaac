"""Criterion: ADMIN não cria outro ADMIN/DEV (só ATENDENTE); ATENDENTE não acessa
recursos restritos (usuarios) da API."""
import random

from tests.helpers import auth_headers


def test_admin_nao_cria_admin_e_atendente_sem_acesso(client):
    headers_admin = auth_headers("admin")
    headers_at = auth_headers("atendente")
    sufixo = random.randint(100000, 999999)

    r_admin_tenta = client.post(
        "/usuarios",
        json={
            "nome": f"tscheck-admin-{sufixo}",
            "usuario": f"tscheck-admin-{sufixo}",
            "senha": "senha12345",
            "role": "ADMIN",
        },
        headers=headers_admin,
    )
    assert r_admin_tenta.status_code == 403, (
        f"ADMIN conseguiu criar outro ADMIN -> {r_admin_tenta.status_code} {r_admin_tenta.text}"
    )
    assert "Atendente" in r_admin_tenta.json()["detail"]

    r_admin_ok = client.post(
        "/usuarios",
        json={
            "nome": f"tscheck-atendente-{sufixo}",
            "usuario": f"tscheck-atendente-{sufixo}",
            "senha": "senha12345",
            "role": "ATENDENTE",
        },
        headers=headers_admin,
    )
    assert r_admin_ok.status_code == 201, r_admin_ok.text

    r_at_lista = client.get("/usuarios", headers=headers_at)
    assert r_at_lista.status_code == 403, (
        f"ATENDENTE acessou /usuarios -> {r_at_lista.status_code} {r_at_lista.text}"
    )
