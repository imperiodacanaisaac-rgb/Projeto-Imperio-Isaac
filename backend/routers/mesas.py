from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import limpo, next_seq, permitir, registrar_log, usuario_atual
from lib.db import db
from models.schemas import Mesa, MesaCreate, MesaStatusUpdate, MesaUpdate

router = APIRouter(prefix="/mesas", tags=["mesas"])


async def _buscar(mid: int) -> dict:
    doc = await db.mesas.find_one({"id": mid})
    if not doc:
        raise HTTPException(status_code=404, detail="Mesa não encontrada")
    return doc


@router.get("", response_model=list[Mesa])
async def listar(_user: dict = Depends(usuario_atual)):
    docs = await db.mesas.find().sort("numero", 1).to_list(500)
    return [Mesa(**d) for d in docs]


@router.post("", response_model=Mesa, status_code=201)
async def criar(body: MesaCreate, user: dict = Depends(usuario_atual)):
    if await db.mesas.find_one({"numero": body.numero}):
        raise HTTPException(status_code=400, detail="Já existe mesa com este número")
    doc = {
        "id": await next_seq("mesas"),
        "numero": body.numero,
        "status": "LIVRE",
        "capacidade": body.capacidade,
        "observacao": limpo(body.observacao),
        "criadoEm": datetime.now(timezone.utc),
    }
    await db.mesas.insert_one(doc)
    await registrar_log(user["id"], "CRIOU_MESA", f"Mesa {body.numero}")
    return Mesa(**doc)


@router.put("/{mid}", response_model=Mesa)
async def editar(mid: int, body: MesaUpdate, _user: dict = Depends(usuario_atual)):
    await _buscar(mid)
    campos: dict = {}
    if body.numero is not None:
        outra = await db.mesas.find_one({"numero": body.numero, "id": {"$ne": mid}})
        if outra:
            raise HTTPException(status_code=400, detail="Já existe mesa com este número")
        campos["numero"] = body.numero
    if body.capacidade is not None:
        campos["capacidade"] = body.capacidade
    if body.observacao is not None:
        campos["observacao"] = limpo(body.observacao)
    if not campos:
        raise HTTPException(status_code=400, detail="Nenhum campo válido para atualizar")
    await db.mesas.update_one({"id": mid}, {"$set": campos})
    return Mesa(**await _buscar(mid))


@router.patch("/{mid}/status", response_model=Mesa)
async def mudar_status(mid: int, body: MesaStatusUpdate, _user: dict = Depends(usuario_atual)):
    await _buscar(mid)
    if body.status == "LIVRE" and await db.pedidos.count_documents(
        {"mesaId": mid, "status": "ABERTO"}
    ):
        raise HTTPException(
            status_code=400,
            detail="Esta mesa possui pedido em aberto. Finalize ou cancele o pedido primeiro.",
        )
    await db.mesas.update_one({"id": mid}, {"$set": {"status": body.status}})
    return Mesa(**await _buscar(mid))


@router.patch("/{mid}/liberar", response_model=Mesa)
async def liberar(mid: int, user: dict = Depends(usuario_atual)):
    """Liberação MANUAL da mesa. O pagamento não libera a mesa automaticamente:
    o cliente pode continuar sentado e fazer novos pedidos."""
    mesa = await _buscar(mid)
    abertos = await db.pedidos.count_documents({"mesaId": mid, "status": "ABERTO"})
    if abertos:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Esta mesa possui {abertos} pedido(s) em aberto. "
                "Receba o pagamento ou cancele antes de liberar a mesa."
            ),
        )
    if mesa["status"] == "LIVRE":
        raise HTTPException(status_code=400, detail="Esta mesa já está livre")
    await db.mesas.update_one({"id": mid}, {"$set": {"status": "LIVRE"}})
    await registrar_log(user["id"], "LIBEROU_MESA", f"Mesa {mesa['numero']}")
    return Mesa(**await _buscar(mid))


@router.delete("/{mid}")
async def excluir(mid: int, user: dict = Depends(usuario_atual)):
    mesa = await _buscar(mid)
    if await db.pedidos.count_documents({"mesaId": mid}):
        raise HTTPException(
            status_code=400, detail="Esta mesa possui histórico de pedidos e não pode ser excluída"
        )
    await db.mesas.delete_one({"id": mid})
    await registrar_log(user["id"], "EXCLUIU_MESA", f"Mesa {mesa['numero']}")
    return {"mensagem": "Mesa excluída"}
