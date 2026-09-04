from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from lib.auth import limpo, next_seq, registrar_log, usuario_atual
from lib.dates import today_iso
from lib.db import db
from models.schemas import (
    CancelarIn,
    Comanda,
    ItemIn,
    ItemPedido,
    ItensAdd,
    Pagamento,
    PagamentoIn,
    Pedido,
    PedidoCreate,
    PedidoUpdate,
)

router = APIRouter(prefix="/pedidos", tags=["pedidos"])


async def config_valor(chave: str, padrao: str) -> str:
    doc = await db.configuracoes.find_one({"chave": chave})
    return doc["valor"] if doc and doc.get("valor") else padrao


def aplicar_mascara(mascara: str, numero: int) -> str:
    hashes = mascara.count("#")
    if hashes == 0:
        mascara, hashes = "###", 3
    formatado = str(numero).zfill(hashes)
    saida, usado = "", False
    i = 0
    while i < len(mascara):
        if mascara[i] == "#":
            while i < len(mascara) and mascara[i] == "#":
                i += 1
            if not usado:
                saida += formatado
                usado = True
        else:
            saida += mascara[i]
            i += 1
    return saida


async def _proximo_numero_do_dia() -> int:
    """Incrementa o contador de comandas, zerando-o quando o dia virou.
    O dia é ancorado no servidor (lib/dates.today_iso), nunca no navegador."""
    hoje = today_iso()
    doc = await db.contadores.find_one_and_update(
        {"_id": "comanda", "dia": hoje},
        {"$inc": {"valor": 1}},
        return_document=True,
    )
    if doc:
        return int(doc["valor"])
    # Primeiro pedido do dia (ou primeira execução): reinicia a numeração em 1.
    doc = await db.contadores.find_one_and_update(
        {"_id": "comanda"},
        {"$set": {"dia": hoje, "valor": 1}},
        upsert=True,
        return_document=True,
    )
    return int(doc["valor"])


async def gerar_numero_comanda() -> str:
    mascara = await config_valor("mascaraComanda", "###")
    for _ in range(10):
        numero = await _proximo_numero_do_dia()
        candidato = aplicar_mascara(mascara, numero)
        # UNIQUE é por dia: comandas de dias anteriores podem repetir o número.
        if not await db.pedidos.find_one(
            {"numeroComanda": candidato, "diaComanda": today_iso()}
        ):
            return candidato
    raise HTTPException(status_code=500, detail="Não foi possível gerar o número da comanda")


async def proxima_comanda_preview() -> str:
    mascara = await config_valor("mascaraComanda", "###")
    doc = await db.contadores.find_one({"_id": "comanda"})
    # Se o dia virou, a próxima comanda volta a ser a número 1.
    atual = int(doc["valor"]) if doc and doc.get("dia") == today_iso() else 0
    return aplicar_mascara(mascara, atual + 1)


async def _resolver_itens(itens: list[ItemIn]) -> list[dict]:
    resolvidos: list[dict] = []
    for item in itens:
        produto = await db.produtos.find_one({"id": item.produtoId})
        if not produto:
            raise HTTPException(
                status_code=400, detail=f"Produto {item.produtoId} não encontrado"
            )
        if not produto.get("ativo", True):
            raise HTTPException(
                status_code=400, detail=f"O produto {produto['nome']} está inativo"
            )
        resolvidos.append(
            {
                "produtoId": produto["id"],
                "produtoNome": produto["nome"],
                "quantidade": item.quantidade,
                "precoUnit": round(float(produto["preco"]), 2),
                "observacao": limpo(item.observacao),
            }
        )
    return resolvidos


def total_de(itens: list[dict]) -> float:
    return round(sum(i["quantidade"] * i["precoUnit"] for i in itens), 2)


async def montar(doc: dict) -> Pedido:
    itens = [
        ItemPedido(
            **i, subtotal=round(i["quantidade"] * i["precoUnit"], 2)
        )
        for i in doc.get("itens", [])
    ]
    mesa_numero = None
    if doc.get("mesaId"):
        mesa = await db.mesas.find_one({"id": doc["mesaId"]})
        mesa_numero = mesa["numero"] if mesa else None
    atendente = await db.usuarios.find_one({"id": doc["atendenteId"]})
    pag = doc.get("pagamento")
    return Pedido(
        id=doc["id"],
        numeroComanda=doc["numeroComanda"],
        diaComanda=doc.get("diaComanda"),
        clienteNome=doc.get("clienteNome"),
        mesaId=doc.get("mesaId"),
        mesaNumero=mesa_numero,
        atendenteId=doc["atendenteId"],
        atendenteNome=atendente["nome"] if atendente else "—",
        status=doc["status"],
        observacao=doc.get("observacao"),
        canceladoMotivo=doc.get("canceladoMotivo"),
        itens=itens,
        total=total_de(doc.get("itens", [])),
        pagamento=Pagamento(**pag) if pag else None,
        criadoEm=doc["criadoEm"],
    )


async def _buscar(pid: int) -> dict:
    doc = await db.pedidos.find_one({"id": pid})
    if not doc:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    return doc


async def liberar_mesa(mesa_id: Optional[int], ignorar_pedido: Optional[int] = None) -> None:
    if not mesa_id:
        return
    filtro: dict = {"mesaId": mesa_id, "status": "ABERTO"}
    if ignorar_pedido is not None:
        filtro["id"] = {"$ne": ignorar_pedido}
    if await db.pedidos.count_documents(filtro) == 0:
        await db.mesas.update_one({"id": mesa_id}, {"$set": {"status": "LIVRE"}})


@router.get("", response_model=list[Pedido])
async def listar(
    status: Optional[str] = None,
    dataInicio: Optional[str] = None,
    dataFim: Optional[str] = None,
    numeroComanda: Optional[str] = None,
    mesaId: Optional[int] = None,
    meus: bool = Query(default=False),
    user: dict = Depends(usuario_atual),
):
    filtro: dict = {}
    if status:
        filtro["status"] = status
    if numeroComanda:
        filtro["numeroComanda"] = {"$regex": numeroComanda, "$options": "i"}
    if mesaId is not None:
        filtro["mesaId"] = mesaId
    if meus:
        filtro["atendenteId"] = user["id"]
    if dataInicio or dataFim:
        rng: dict = {}
        if dataInicio:
            rng["$gte"] = datetime.fromisoformat(dataInicio).replace(tzinfo=timezone.utc)
        if dataFim:
            rng["$lte"] = datetime.fromisoformat(dataFim).replace(
                tzinfo=timezone.utc
            ) + timedelta(days=1)
        filtro["criadoEm"] = rng
    docs = await db.pedidos.find(filtro).sort("criadoEm", -1).to_list(500)
    return [await montar(d) for d in docs]


@router.post("", response_model=Pedido, status_code=201)
async def criar(body: PedidoCreate, user: dict = Depends(usuario_atual)):
    itens = await _resolver_itens(body.itens)
    if body.mesaId is not None:
        mesa = await db.mesas.find_one({"id": body.mesaId})
        if not mesa:
            raise HTTPException(status_code=404, detail="Mesa não encontrada")
        if mesa["status"] == "MANUTENCAO":
            raise HTTPException(status_code=400, detail="Esta mesa está em manutenção")

    doc = {
        "id": await next_seq("pedidos"),
        "numeroComanda": await gerar_numero_comanda(),
        "clienteNome": limpo(body.clienteNome),
        "mesaId": body.mesaId,
        "atendenteId": user["id"],
        "status": "ABERTO",
        "observacao": limpo(body.observacao),
        "canceladoMotivo": None,
        "itens": itens,
        "pagamento": None,
        "diaComanda": today_iso(),
        "criadoEm": datetime.now(timezone.utc),
    }
    await db.pedidos.insert_one(doc)
    if body.mesaId is not None:
        await db.mesas.update_one({"id": body.mesaId}, {"$set": {"status": "OCUPADA"}})
    await registrar_log(
        user["id"], "CRIOU_PEDIDO", f"Comanda {doc['numeroComanda']} — R$ {total_de(itens):.2f}"
    )
    return await montar(doc)


@router.get("/{pid}", response_model=Pedido)
async def detalhe(pid: int, _user: dict = Depends(usuario_atual)):
    return await montar(await _buscar(pid))


@router.put("/{pid}", response_model=Pedido)
async def editar(pid: int, body: PedidoUpdate, user: dict = Depends(usuario_atual)):
    doc = await _buscar(pid)
    if doc["status"] != "ABERTO":
        raise HTTPException(status_code=400, detail="Este pedido já foi finalizado")
    itens = await _resolver_itens(body.itens)
    await db.pedidos.update_one(
        {"id": pid},
        {
            "$set": {
                "itens": itens,
                "clienteNome": limpo(body.clienteNome),
                "observacao": limpo(body.observacao),
            }
        },
    )
    await registrar_log(user["id"], "EDITOU_PEDIDO", f"Comanda {doc['numeroComanda']}")
    return await montar(await _buscar(pid))


@router.post("/{pid}/itens", response_model=Pedido)
async def adicionar_itens(pid: int, body: ItensAdd, user: dict = Depends(usuario_atual)):
    """Soma itens a uma comanda ABERTA, sem precisar criar outro pedido.
    Itens repetidos somam a quantidade; o preço já congelado é preservado."""
    doc = await _buscar(pid)
    if doc["status"] != "ABERTO":
        raise HTTPException(status_code=400, detail="Este pedido já foi finalizado")

    novos = await _resolver_itens(body.itens)
    atuais = list(doc.get("itens", []))
    for novo in novos:
        existente = next(
            (
                i
                for i in atuais
                if i["produtoId"] == novo["produtoId"]
                and (i.get("observacao") or None) == (novo.get("observacao") or None)
            ),
            None,
        )
        if existente:
            existente["quantidade"] += novo["quantidade"]
        else:
            atuais.append(novo)

    await db.pedidos.update_one({"id": pid}, {"$set": {"itens": atuais}})
    await registrar_log(
        user["id"],
        "ADICIONOU_ITENS",
        f"Comanda {doc['numeroComanda']} — +{sum(i['quantidade'] for i in novos)} item(ns)",
    )
    return await montar(await _buscar(pid))


@router.patch("/{pid}/cancelar", response_model=Pedido)
async def cancelar(pid: int, body: CancelarIn, user: dict = Depends(usuario_atual)):
    doc = await _buscar(pid)
    if user["role"] == "ATENDENTE" and doc["atendenteId"] != user["id"]:
        raise HTTPException(
            status_code=403, detail="Você só pode cancelar pedidos registrados por você"
        )
    motivo = limpo(body.motivo)
    if not motivo:
        raise HTTPException(status_code=400, detail="O motivo do cancelamento é obrigatório")
    atualizado = await db.pedidos.find_one_and_update(
        {"id": pid, "status": "ABERTO"},
        {"$set": {"status": "CANCELADO", "canceladoMotivo": motivo}},
        return_document=True,
    )
    if not atualizado:
        raise HTTPException(status_code=400, detail="Este pedido já foi finalizado")
    await liberar_mesa(doc.get("mesaId"), ignorar_pedido=pid)
    await registrar_log(
        user["id"], "CANCELOU_PEDIDO", f"Comanda {doc['numeroComanda']} — {motivo}"
    )
    return await montar(atualizado)


@router.post("/{pid}/pagamento", response_model=Pedido)
async def pagar(pid: int, body: PagamentoIn, user: dict = Depends(usuario_atual)):
    doc = await _buscar(pid)
    if doc["status"] != "ABERTO":
        raise HTTPException(status_code=400, detail="Este pedido já foi finalizado")
    total = total_de(doc.get("itens", []))
    troco = None
    if body.forma == "DINHEIRO":
        recebido = body.valorRecebido if body.valorRecebido is not None else total
        if recebido < total:
            raise HTTPException(
                status_code=400,
                detail=f"Valor recebido é menor que o total do pedido (R$ {total:.2f})",
            )
        troco = round(recebido - total, 2)

    pagamento = {
        "forma": body.forma,
        "valor": total,
        "troco": troco,
        "pagoEm": datetime.now(timezone.utc),
    }
    # Guarda atômica contra pagamento duplo simultâneo.
    atualizado = await db.pedidos.find_one_and_update(
        {"id": pid, "status": "ABERTO"},
        {"$set": {"status": "PAGO", "pagamento": pagamento}},
        return_document=True,
    )
    if not atualizado:
        raise HTTPException(status_code=400, detail="Este pedido já foi pago por outro usuário")

    await db.caixa.insert_one(
        {
            "id": await next_seq("caixa"),
            "tipo": "ENTRADA",
            "valor": total,
            "descricao": f"Venda comanda {doc['numeroComanda']} ({body.forma})",
            "categoria": "venda",
            "usuarioId": user["id"],
            "criadoEm": datetime.now(timezone.utc),
        }
    )
    # A mesa NÃO é liberada no pagamento: o cliente pode continuar sentado e
    # pedir novamente. A liberação é manual (PATCH /api/mesas/{id}/liberar).
    await registrar_log(
        user["id"],
        "CONFIRMOU_PAGAMENTO",
        f"Comanda {doc['numeroComanda']} — R$ {total:.2f} via {body.forma}",
    )
    return await montar(atualizado)


@router.get("/{pid}/comanda", response_model=Comanda)
async def comanda(pid: int, _user: dict = Depends(usuario_atual)):
    doc = await _buscar(pid)
    pedido = await montar(doc)
    return Comanda(
        numeroComanda=pedido.numeroComanda,
        estabelecimento=await config_valor("nomeEstabelecimento", "Império Da Cana"),
        clienteNome=pedido.clienteNome,
        mesaNumero=pedido.mesaNumero,
        atendenteNome=pedido.atendenteNome,
        itens=pedido.itens,
        total=pedido.total,
        status=pedido.status,
        criadoEm=pedido.criadoEm,
        pagamento=pedido.pagamento,
    )
