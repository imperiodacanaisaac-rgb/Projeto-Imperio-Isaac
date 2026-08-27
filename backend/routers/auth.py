import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from lib.auth import (
    criar_token,
    limpar_usuario,
    registrar_log,
    usuario_atual,
    verificar_senha,
)
from lib.db import db
from models.schemas import LoginIn, LoginOut, Usuario

router = APIRouter(prefix="/auth", tags=["auth"])

# Rate limit: 10 tentativas / 15 min por IP
_TENTATIVAS: dict[str, list[float]] = {}
_JANELA = 15 * 60
_MAX = 10


def _checar_rate(ip: str) -> None:
    agora = time.time()
    hist = [t for t in _TENTATIVAS.get(ip, []) if agora - t < _JANELA]
    if len(hist) >= _MAX:
        _TENTATIVAS[ip] = hist
        raise HTTPException(
            status_code=429,
            detail="Muitas tentativas de login. Tente novamente em alguns minutos.",
        )
    hist.append(agora)
    _TENTATIVAS[ip] = hist


@router.post("/login", response_model=LoginOut)
async def login(body: LoginIn, request: Request):
    _checar_rate(request.client.host if request.client else "desconhecido")
    nome_usuario = body.usuario.strip()
    if not nome_usuario or not body.senha:
        raise HTTPException(status_code=400, detail="Informe usuário e senha")

    doc = await db.usuarios.find_one({"usuario": nome_usuario})
    if not doc or not doc.get("ativo", True):
        raise HTTPException(status_code=401, detail="Usuário não encontrado ou inativo")
    if not verificar_senha(body.senha, doc["senha"]):
        raise HTTPException(status_code=401, detail="Usuário ou senha incorretos")

    user = limpar_usuario(doc)
    await registrar_log(user["id"], "LOGIN", f"{user['nome']} entrou no sistema")
    return LoginOut(token=criar_token(user), user=Usuario(**user))


@router.get("/me", response_model=Usuario)
async def me(user: dict = Depends(usuario_atual)):
    return Usuario(**user)


@router.get("/hora")
async def hora():
    return {"agora": datetime.now(timezone.utc).isoformat()}
