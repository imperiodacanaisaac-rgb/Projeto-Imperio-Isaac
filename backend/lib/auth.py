"""Auth helpers: bcrypt hashing, JWT issue/verify, role guards, sequences, activity log."""

import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import jwt
from fastapi import Depends, HTTPException, Request
from passlib.context import CryptContext

from lib.db import db

JWT_SECRET = os.environ.get("JWT_SECRET", "")
if not JWT_SECRET or len(JWT_SECRET) < 32:
    # Falha fechada: sem um segredo forte em backend/.env qualquer pessoa poderia
    # assinar um token válido e virar DEV. Gere com: openssl rand -hex 32
    raise RuntimeError(
        "JWT_SECRET ausente ou fraco em backend/.env (mínimo 32 caracteres aleatórios)."
    )
JWT_ALG = "HS256"
JWT_HOURS = 12  # cobre um expediente inteiro: login uma vez no começo do dia

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


_USUARIO_TTL = 60.0
_usuario_cache: dict[Any, tuple[float, dict]] = {}


def invalidar_cache_usuario(usuario_id: Any = None) -> None:
    """Chamar ao desativar/alterar usuário para a mudança valer na hora."""
    if usuario_id is None:
        _usuario_cache.clear()
    else:
        _usuario_cache.pop(usuario_id, None)


async def _buscar_usuario_cacheado(usuario_id: Any) -> Optional[dict]:
    """Cache de 60s por usuário.

    Sem isso, CADA requisição autenticada fazia uma leitura no Firestore só para
    validar o token — era o maior consumidor de cota num caixa aberto o dia todo.
    """
    agora = time.monotonic()
    em_cache = _usuario_cache.get(usuario_id)
    if em_cache and agora - em_cache[0] < _USUARIO_TTL:
        return em_cache[1]
    doc = await db.usuarios.find_one({"id": usuario_id})
    if doc:
        _usuario_cache[usuario_id] = (agora, doc)
    return doc


async def usuario_atual(request: Request) -> dict:
    header = request.headers.get("authorization") or ""
    if not header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Token não fornecido")
    token = header.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except Exception:
        raise HTTPException(status_code=401, detail="Sessão expirada, faça login novamente")
    doc = await _buscar_usuario_cacheado(payload.get("id"))
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
