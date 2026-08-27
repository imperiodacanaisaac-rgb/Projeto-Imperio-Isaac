"""Shared auth helpers for tscheck backend tests."""
import httpx

BACKEND_URL = "http://localhost:8001"
API_URL = f"{BACKEND_URL}/api"

CREDS = {
    "dev": ("dev", "dev123"),
    "admin": ("admin", "admin123"),
    "atendente": ("atendente", "atendente123"),
}


_TOKEN_CACHE: dict = {}


def login(role: str) -> str:
    if role in _TOKEN_CACHE:
        return _TOKEN_CACHE[role]
    usuario, senha = CREDS[role]
    with httpx.Client(base_url=API_URL, timeout=30.0) as c:
        r = c.post("/auth/login", json={"usuario": usuario, "senha": senha})
        r.raise_for_status()
        token = r.json()["token"]
        _TOKEN_CACHE[role] = token
        return token


def auth_headers(role: str) -> dict:
    return {"Authorization": f"Bearer {login(role)}"}
