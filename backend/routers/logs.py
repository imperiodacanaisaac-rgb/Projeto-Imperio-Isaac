from typing import Optional

from fastapi import APIRouter, Depends

from lib.auth import permitir
from lib.db import db
from models.schemas import LogAtividade

router = APIRouter(prefix="/logs", tags=["logs"])


@router.get("", response_model=list[LogAtividade])
async def listar(
    usuarioId: Optional[int] = None,
    acao: Optional[str] = None,
    _user: dict = Depends(permitir("DEV")),
):
    filtro: dict = {}
    if usuarioId is not None:
        filtro["usuarioId"] = usuarioId
    if acao:
        filtro["acao"] = acao
    docs = await db.logs.find(filtro).sort("criadoEm", -1).to_list(300)
    return await montar_logs(docs)


async def montar_logs(docs: list[dict]) -> list[LogAtividade]:
    usuarios = await db.usuarios.find().to_list(500)
    nomes = {u["id"]: u["nome"] for u in usuarios}
    return [
        LogAtividade(
            id=d["id"],
            usuarioId=d["usuarioId"],
            usuarioNome=nomes.get(d["usuarioId"], "—"),
            acao=d["acao"],
            detalhes=d.get("detalhes"),
            criadoEm=d["criadoEm"],
        )
        for d in docs
    ]
