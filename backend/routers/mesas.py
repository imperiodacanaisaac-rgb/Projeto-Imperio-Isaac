from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import limpo, next_seq, permitir, registrar_log, usuario_atual
from lib.db import db
from models.schemas import (
    ContaMesa,
    ContaPagamentoIn,
    Mesa,
    MesaCreate,
    MesaStatusUpdate,
    MesaUpdate,
)

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


@router.get("/{mid}/conta", response_model=ContaMesa)
async def conta(mid: int, pessoas: int = 1, _user: dict = Depends(usuario_atual)):
    """Conta única da mesa: soma todas as comandas ABERTAS, com divisão opcional."""
    mesa = await _buscar(mid)
    abertos = await db.pedidos.find({"mesaId": mid, "status": "ABERTO"}).sort("criadoEm", 1).to_list(200)
    total = round(
        sum(i["quantidade"] * i["precoUnit"] for p in abertos for i in p.get("itens", [])), 2
    )
    n = max(1, pessoas)
    return ContaMesa(
        mesaId=mesa["id"],
        mesaNumero=mesa["numero"],
        status=mesa["status"],
        qtdComandas=len(abertos),
        comandas=[p["numeroComanda"] for p in abertos],
        pedidoIds=[p["id"] for p in abertos],
        total=total,
        pessoas=n,
        valorPorPessoa=round(total / n, 2),
    )


@router.post("/{mid}/pagamento", response_model=ContaMesa)
async def pagar_conta(mid: int, body: ContaPagamentoIn, user: dict = Depends(usuario_atual)):
    """Paga de uma vez todas as comandas abertas da mesa.
    A mesa NÃO é liberada aqui — a liberação continua manual."""
    mesa = await _buscar(mid)
    abertos = await db.pedidos.find({"mesaId": mid, "status": "ABERTO"}).to_list(200)
    if not abertos:
        raise HTTPException(
            status_code=400, detail="Esta mesa não possui comandas abertas para pagar"
        )

    total = round(
        sum(i["quantidade"] * i["precoUnit"] for p in abertos for i in p.get("itens", [])), 2
    )
    troco = None
    if body.forma == "DINHEIRO":
        recebido = body.valorRecebido if body.valorRecebido is not None else total
        if recebido < total:
            raise HTTPException(
                status_code=400,
                detail=f"Valor recebido é menor que o total da conta (R$ {total:.2f})",
            )
        troco = round(recebido - total, 2)

    agora = datetime.now(timezone.utc)
    pagos: list[str] = []
    for p in abertos:
        subtotal = round(sum(i["quantidade"] * i["precoUnit"] for i in p.get("itens", [])), 2)
        # Guarda atômica por comanda, contra pagamento duplo simultâneo.
        atualizado = await db.pedidos.find_one_and_update(
            {"id": p["id"], "status": "ABERTO"},
            {
                "$set": {
                    "status": "PAGO",
                    "pagamento": {
                        "forma": body.forma,
                        "valor": subtotal,
                        "troco": None,
                        "pagoEm": agora,
                    },
                }
            },
        )
        if not atualizado:
            continue
        pagos.append(p["numeroComanda"])
        await db.caixa.insert_one(
            {
                "id": await next_seq("caixa"),
                "tipo": "ENTRADA",
                "valor": subtotal,
                "descricao": f"Venda comanda {p['numeroComanda']} ({body.forma}) — conta da Mesa {mesa['numero']}",
                "categoria": "venda",
                "usuarioId": user["id"],
                "criadoEm": agora,
            }
        )

    if not pagos:
        raise HTTPException(
            status_code=400, detail="Esta conta já foi paga por outro usuário"
        )

    detalhe = f"Mesa {mesa['numero']} — {len(pagos)} comanda(s), R$ {total:.2f} via {body.forma}"
    if body.pessoas > 1:
        detalhe += f" — dividido por {body.pessoas} pessoas"
    if troco:
        detalhe += f" — troco R$ {troco:.2f}"
    await registrar_log(user["id"], "PAGOU_CONTA_MESA", detalhe)

    return ContaMesa(
        mesaId=mesa["id"],
        mesaNumero=mesa["numero"],
        status=mesa["status"],
        qtdComandas=0,
        comandas=pagos,
        pedidoIds=[],
        total=total,
        pessoas=body.pessoas,
        valorPorPessoa=round(total / max(1, body.pessoas), 2),
    )


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
