from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends

from lib.auth import permitir, usuario_atual
from lib.db import db
from models.schemas import (
    DashboardAdmin,
    DashboardAtendente,
    DashboardDev,
    DiaRelatorio,
    ProdutoRanking,
    RoleContagem,
)
from routers.caixa import aware, dia_utc
from routers.logs import montar_logs
from routers.pedidos import montar, proxima_comanda_preview, total_de

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/atendente", response_model=DashboardAtendente)
async def atendente(user: dict = Depends(usuario_atual)):
    inicio = dia_utc(None)
    fim = inicio + timedelta(days=1)
    ocupadas = await db.mesas.count_documents({"status": "OCUPADA"})
    livres = await db.mesas.count_documents({"status": "LIVRE"})
    abertos = await db.pedidos.count_documents({"status": "ABERTO"})
    pagos = await db.pedidos.find(
        {"status": "PAGO", "criadoEm": {"$gte": inicio, "$lt": fim}}
    ).to_list(2000)
    total_hoje = round(sum(total_de(p.get("itens", [])) for p in pagos), 2)
    ultimos = await db.pedidos.find({"atendenteId": user["id"]}).sort("criadoEm", -1).to_list(8)
    return DashboardAtendente(
        mesasOcupadas=ocupadas,
        mesasLivres=livres,
        pedidosAbertos=abertos,
        totalVendidoHoje=total_hoje,
        ultimosPedidos=[await montar(p) for p in ultimos],
    )


@router.get("/admin", response_model=DashboardAdmin)
async def admin(_user: dict = Depends(permitir("ADMIN", "DEV"))):
    hoje = dia_utc(None)
    inicio_semana = hoje - timedelta(days=6)
    inicio_mes = datetime(hoje.year, hoje.month, 1, tzinfo=timezone.utc)
    pagos = await db.pedidos.find(
        {"status": "PAGO", "criadoEm": {"$gte": min(inicio_semana, inicio_mes)}}
    ).to_list(5000)

    fat_hoje = fat_semana = fat_mes = 0.0
    pedidos_hoje = 0
    por_dia: dict[str, dict] = defaultdict(lambda: {"faturamento": 0.0, "pedidos": 0})
    ranking: dict[str, dict] = defaultdict(lambda: {"quantidade": 0.0, "total": 0.0})

    for p in pagos:
        criado = aware(p["criadoEm"])
        total = total_de(p.get("itens", []))
        if criado >= hoje:
            fat_hoje += total
            pedidos_hoje += 1
        if criado >= inicio_semana:
            fat_semana += total
            chave = criado.date().isoformat()
            por_dia[chave]["faturamento"] += total
            por_dia[chave]["pedidos"] += 1
        if criado >= inicio_mes:
            fat_mes += total
            for i in p.get("itens", []):
                ranking[i["produtoNome"]]["quantidade"] += i["quantidade"]
                ranking[i["produtoNome"]]["total"] += i["quantidade"] * i["precoUnit"]

    dias: list[DiaRelatorio] = []
    cursor = inicio_semana
    while cursor <= hoje:
        chave = cursor.date().isoformat()
        d = por_dia.get(chave, {"faturamento": 0.0, "pedidos": 0})
        dias.append(
            DiaRelatorio(data=chave, faturamento=round(d["faturamento"], 2), pedidos=d["pedidos"])
        )
        cursor += timedelta(days=1)

    mais_vendidos = sorted(
        (
            ProdutoRanking(produtoNome=k, quantidade=v["quantidade"], total=round(v["total"], 2))
            for k, v in ranking.items()
        ),
        key=lambda r: r.quantidade,
        reverse=True,
    )[:5]

    return DashboardAdmin(
        faturamentoHoje=round(fat_hoje, 2),
        faturamentoSemana=round(fat_semana, 2),
        faturamentoMes=round(fat_mes, 2),
        pedidosHoje=pedidos_hoje,
        ticketMedio=round(fat_hoje / pedidos_hoje, 2) if pedidos_hoje else 0.0,
        mesasOcupadas=await db.mesas.count_documents({"status": "OCUPADA"}),
        atendentesAtivos=await db.usuarios.count_documents({"role": "ATENDENTE", "ativo": True}),
        ultimos7Dias=dias,
        maisVendidos=mais_vendidos,
    )


@router.get("/dev", response_model=DashboardDev)
async def dev(_user: dict = Depends(permitir("DEV"))):
    contagens = []
    for role in ("DEV", "ADMIN", "ATENDENTE"):
        contagens.append(
            RoleContagem(role=role, total=await db.usuarios.count_documents({"role": role}))
        )
    logs = await db.logs.find().sort("criadoEm", -1).to_list(15)
    return DashboardDev(
        porRole=contagens,
        totalPedidos=await db.pedidos.count_documents({}),
        totalUsuarios=await db.usuarios.count_documents({}),
        proximaComanda=await proxima_comanda_preview(),
        logsRecentes=await montar_logs(logs),
    )
