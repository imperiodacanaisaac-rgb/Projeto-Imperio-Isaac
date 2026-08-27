"""Auth helpers: bcrypt hashing, JWT issue/verify, role guards, sequences, activity log."""

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import jwt
from fastapi import Depends, HTTPException, Request
from passlib.context import CryptContext

from lib.db import db

JWT_SECRET = os.environ.get("JWT_SECRET", "imperio_cana_secret_troque_em_producao")
JWT_ALG = "HS256"
JWT_HOURS = 8

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=10)

ROLE_RANK = {"ATENDENTE": 1, "ADMIN": 2, "DEV": 3}


def hash_senha(senha: str) -> str:
    return _pwd.hash(senha)


def verificar_senha(senha: str, hashed: str) -> bool:
    try:
        return _pwd.verify(senha, hashed)
    except Exception:
        return False


def criar_token(user: dict) -> str:
    payload = {
        "id": user["id"],
        "nome": user["nome"],
        "role": user["role"],
        "usuario": user["usuario"],
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def next_seq(nome: str) -> int:
    doc = await db.contadores.find_one_and_update(
        {"_id": nome}, {"$inc": {"valor": 1}}, upsert=True, return_document=True
    )
    return int(doc["valor"])


async def registrar_log(usuario_id: int, acao: str, detalhes: Optional[str] = None) -> None:
    await db.logs.insert_one(
        {
            "id": await next_seq("logs"),
            "usuarioId": usuario_id,
            "acao": acao,
            "detalhes": detalhes,
            "criadoEm": datetime.now(timezone.utc),
        }
    )


def limpar_usuario(doc: dict[str, Any]) -> dict[str, Any]:
    """Never leak the password hash or Mongo's _id."""
    out = {k: v for k, v in doc.items() if k not in ("senha", "_id")}
    return out


async def usuario_atual(request: Request) -> dict:
    header = request.headers.get("authorization") or ""
    if not header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Token não fornecido")
    token = header.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except Exception:
        raise HTTPException(status_code=401, detail="Sessão expirada, faça login novamente")
    doc = await db.usuarios.find_one({"id": payload.get("id")})
    if not doc or not doc.get("ativo", True):
        raise HTTPException(status_code=401, detail="Usuário não encontrado ou inativo")
    return limpar_usuario(doc)


def permitir(*roles: str):
    async def _guard(user: dict = Depends(usuario_atual)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Você não tem permissão para esta ação")
        return user

    return _guard


def limpo(texto: Optional[str]) -> Optional[str]:
    if texto is None:
        return None
    t = texto.strip()
    return t or None
