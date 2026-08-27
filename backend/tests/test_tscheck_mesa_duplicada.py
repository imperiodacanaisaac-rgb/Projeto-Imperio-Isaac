"""Criterion: criar mesa com número inédito funciona; número duplicado é bloqueado."""
import random

from tests.helpers import auth_headers


def test_criar_mesa_e_bloquear_duplicata(client):
    headers = auth_headers("atendente")
    numero = random.randint(9000, 9999)

    r1 = client.post("/mesas", json={"numero": numero, "capacidade": 4}, headers=headers)
    assert r1.status_code == 201, f"POST /mesas -> {r1.status_code} {r1.text}"
    mesa = r1.json()
    assert mesa["numero"] == numero
    assert mesa["status"] == "LIVRE"

    r2 = client.post("/mesas", json={"numero": numero, "capacidade": 2}, headers=headers)
    assert r2.status_code == 400, f"POST /mesas duplicada -> {r2.status_code} {r2.text}"
    assert "Já existe mesa" in r2.json()["detail"]
