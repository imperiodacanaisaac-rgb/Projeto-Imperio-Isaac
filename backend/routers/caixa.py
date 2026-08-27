from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import limpo, next_seq, permitir, registrar_log, usuario_atual
from lib.db import db
from models.schemas import (
    CaixaMovimento,
    CaixaResumo,
    DiaRelatorio,
    FormaTotal,
    MovimentoCreate,
    ProdutoRanking,
    Relatorio,
)

router = APIRouter(prefix="/caixa", tags=["caixa"])


def dia_utc(data: Optional[str]) -> datetime:
    if data:
        return datetime.fromisoformat(data).replace(tzinfo=timezone.utc)
    agora = datetime.now(timezone.utc)
    return datetime(agora.year, agora.month, agora.day, tzinfo=timezone.utc)


def aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


@router.get("/resumo", response_model=CaixaResumo)
async def resumo(data: Optional[str] = None, _user: dict = Depends(usuario_atual)):
    inicio = dia_utc(data)
    fim = inicio + timedelta(days=1)
    movs = await db.caixa.find({"criadoEm": {"$gte": inicio, "$lt": fim}}).to_list(2000)
    entradas = round(sum(m["valor"] for m in movs if m["tipo"] == "ENTRADA"), 2)
    saidas = round(sum(m["valor"] for m in movs if m["tipo"] == "SAIDA"), 2)
    pagos = await db.pedidos.count_documents(
        {"status": "PAGO", "criadoEm": {"$gte": inicio, "$lt": fim}}
    )
    return CaixaResumo(
        data=inicio.date().isoformat(),
        entradas=entradas,
        saidas=saidas,
        saldo=round(entradas - saidas, 2),
        pedidosPagos=pagos,
    )


@router.get("/movimentos", response_model=list[CaixaMovimento])
async def movimentos(
    dataInicio: Optional[str] = None,
    dataFim: Optional[str] = None,
    tipo: Optional[str] = None,
    _user: dict = Depends(permitir("ADMIN", "DEV")),
):
    filtro: dict = {}
    if tipo:
        filtro["tipo"] = tipo
    if dataInicio or dataFim:
        rng: dict = {}
        if dataInicio:
            rng["$gte"] = dia_utc(dataInicio)
        if dataFim:
            rng["$lt"] = dia_utc(dataFim) + timedelta(days=1)
        filtro["criadoEm"] = rng
    docs = await db.caixa.find(filtro).sort("criadoEm", -1).to_list(1000)
    return [CaixaMovimento(**{k: v for k, v in d.items() if k != "_id"}) for d in docs]


@router.post("/movimentos", response_model=CaixaMovimento, status_code=201)
async def criar_movimento(
    body: MovimentoCreate, user: dict = Depends(permitir("ADMIN", "DEV"))
):
    descricao = limpo(body.descricao)
    if not descricao:
        raise HTTPException(status_code=400, detail="A descrição é obrigatória")
    doc = {
        "id": await next_seq("caixa"),
        "tipo": body.tipo,
        "valor": round(body.valor, 2),
        "descricao": descricao,
        "categoria": limpo(body.categoria) or "despesa",
        "usuarioId": user["id"],
        "criadoEm": datetime.now(timezone.utc),
    }
    await db.caixa.insert_one(doc)
    await registrar_log(
        user["id"], "LANCOU_CAIXA", f"{body.tipo} R$ {body.valor:.2f} — {descricao}"
    )
    return CaixaMovimento(**doc)


@router.get("/relatorio", response_model=Relatorio)
async def relatorio(
    dataInicio: Optional[str] = None,
    dataFim: Optional[str] = None,
    _user: dict = Depends(permitir("ADMIN", "DEV")),
):
    fim_base = dia_utc(dataFim)
    inicio = dia_utc(dataInicio) if dataInicio else fim_base - timedelta(days=6)
    fim = fim_base + timedelta(days=1)

    pedidos = await db.pedidos.find(
        {"status": "PAGO", "criadoEm": {"$gte": inicio, "$lt": fim}}
    ).to_list(5000)

    por_dia: dict[str, dict] = defaultdict(lambda: {"faturamento": 0.0, "pedidos": 0})
    ranking: dict[str, dict] = defaultdict(lambda: {"quantidade": 0.0, "total": 0.0})
    formas: dict[str, dict] = defaultdict(lambda: {"valor": 0.0, "quantidade": 0})
    total_faturado = 0.0

    for p in pedidos:
        total = round(sum(i["quantidade"] * i["precoUnit"] for i in p.get("itens", [])), 2)
        total_faturado += total
        chave = aware(p["criadoEm"]).date().isoformat()
        por_dia[chave]["faturamento"] += total
        por_dia[chave]["pedidos"] += 1
        for i in p.get("itens", []):
            ranking[i["produtoNome"]]["quantidade"] += i["quantidade"]
            ranking[i["produtoNome"]]["total"] += i["quantidade"] * i["precoUnit"]
        pag = p.get("pagamento")
        if pag:
            formas[pag["forma"]]["valor"] += pag["valor"]
            formas[pag["forma"]]["quantidade"] += 1

    dias: list[DiaRelatorio] = []
    cursor = inicio
    while cursor < fim:
        chave = cursor.date().isoformat()
        d = por_dia.get(chave, {"faturamento": 0.0, "pedidos": 0})
        dias.append(
            DiaRelatorio(data=chave, faturamento=round(d["faturamento"], 2), pedidos=d["pedidos"])
        )
        cursor += timedelta(days=1)

    lista_ranking = sorted(
        (
            ProdutoRanking(
                produtoNome=k, quantidade=v["quantidade"], total=round(v["total"], 2)
            )
            for k, v in ranking.items()
        ),
        key=lambda r: r.quantidade,
        reverse=True,
    )[:10]
    lista_formas = [
        FormaTotal(forma=k, valor=round(v["valor"], 2), quantidade=v["quantidade"])
        for k, v in formas.items()
    ]
    mais_usada = max(lista_formas, key=lambda f: f.quantidade).forma if lista_formas else None
    qtd = len(pedidos)

    return Relatorio(
        dataInicio=inicio.date().isoformat(),
        dataFim=fim_base.date().isoformat(),
        totalFaturado=round(total_faturado, 2),
        qtdPedidos=qtd,
        ticketMedio=round(total_faturado / qtd, 2) if qtd else 0.0,
        porDia=dias,
        ranking=lista_ranking,
        formasPagamento=lista_formas,
        formaMaisUsada=mais_usada,
    )
