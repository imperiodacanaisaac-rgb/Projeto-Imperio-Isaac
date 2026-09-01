"""Criterion: perfil do ATENDENTE é somente leitura no backend.
PUT /usuarios/{id}/senha e PUT /usuarios/{id} com token do atendente -> 403.
PUT /usuarios/{id}/tema -> 200."""
from tests.helpers import auth_headers, login
import httpx
import base64
import json


def _my_id(headers):
    # decode JWT payload without verifying signature to get user id, or use /auth/me
    with httpx.Client(base_url="http://localhost:8001/api", timeout=30.0) as c:
        r = c.get("/auth/me", headers=headers)
        r.raise_for_status()
        return r.json()["id"]


def test_atendente_perfil_readonly(client):
    headers_at = auth_headers("atendente")
    uid = _my_id(headers_at)

    r_edit = client.put(f"/usuarios/{uid}", json={"nome": "Tscheck Novo Nome"}, headers=headers_at)
    assert r_edit.status_code == 403, r_edit.text
    assert "administrador" in r_edit.json()["detail"].lower() or "acesso" in r_edit.json()["detail"].lower()

    r_senha = client.put(
        f"/usuarios/{uid}/senha",
        json={"senhaAtual": "atendente123", "novaSenha": "novaSenha123"},
        headers=headers_at,
    )
    assert r_senha.status_code == 403, r_senha.text

    r_tema = client.put(f"/usuarios/{uid}/tema", json={"tema": "escuro"}, headers=headers_at)
    assert r_tema.status_code == 200, r_tema.text
    assert r_tema.json()["tema"] == "escuro"

    # restore theme to claro to avoid residue affecting other checks
    client.put(f"/usuarios/{uid}/tema", json={"tema": "claro"}, headers=headers_at)
