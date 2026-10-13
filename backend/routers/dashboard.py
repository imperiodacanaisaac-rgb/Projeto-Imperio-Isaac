from collections import defaultdict
from datetime import timedelta

from fastapi import APIRouter, Depends

from lib import cache
from lib.auth import permitir, usuario_atual
from lib.db import db
from models.schemas import (
    DashboardAdmin,
    DashboardAtendente,
    DashboardDev,
    ProdutoRanking,
    RoleContagem,
)
from routers.caixa import dia_utc, faturamento_por_dia
from routers.logs import montar_logs
from routers.pedidos import montar, proxima_comanda_preview, total_de

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/atendente", response_model=DashboardAtendente)
async def atendente(user: dict = Depends(usuario_atual)):
    # Cache de 20s por atendente: o painel é reaberto a toda hora e agrega pedidos do dia.
    return await cache.lembrar(f"dash:atendente:{user['id']}", 20.0, lambda: _atendente(user))


async def _atendente(user: dict) -> DashboardAtendente:
    inicio = dia_utc(None)
    fim = inicio + timedelta(days=1)
    hoje = {"$gte": inicio, "$lt": fim}
    # count()/sum() nativos: ~1 leitura cada, em vez de ler pedido por pedido.
    ocupadas = await db.mesas.count_documents({"status": "OCUPADA"})
    livres = await db.mesas.count_documents({"status": "LIVRE"})
    abertos = await db.pedidos.count_documents({"status": "ABERTO"})
    pagos_hoje = await db.pedidos.agregar(
        {"status": "PAGO", "criadoEm": hoje}, soma="pagamento.valor"
    )
    # Só pedidos de HOJE do atendente, mais recentes primeiro, no máximo 8.
    ultimos = (
        await db.pedidos.find({"atendenteId": user["id"], "criadoEm": hoje})
        .sort("criadoEm", -1)
        .to_list(8)
    )
    return DashboardAtendente(
        mesasOcupadas=ocupadas,
        mesasLivres=livres,
        pedidosAbertos=abertos,
        totalVendidoHoje=round(pagos_hoje["soma"], 2),
        ultimosPedidos=[await montar(p) for p in ultimos],
    )


@router.get("/admin", response_model=DashboardAdmin)
async def admin(_user: dict = Depends(permitir("ADMIN", "DEV"))):
    return await cache.lembrar("dash:admin", 30.0, _admin)


async def _admin() -> DashboardAdmin:
    hoje = dia_utc(None)
    amanha = hoje + timedelta(days=1)

    # Documentos lidos: SOMENTE os pedidos pagos de hoje (ranking + ticket médio).
    pagos_hoje = await db.pedidos.find(
        {"status": "PAGO", "criadoEm": {"$gte": hoje, "$lt": amanha}}
    ).to_list(1000)
    # Semana e mês: soma dos agregados diários (dias passados em cache de 12h).
    mes_dias = await faturamento_por_dia(hoje, hoje.day)
    dias = (await faturamento_por_dia(hoje, 7))
    mes = {"soma": sum(d.faturamento for d in mes_dias)}

    fat_hoje = 0.0
    ranking: dict[str, dict] = defaultdict(lambda: {"quantidade": 0.0, "total": 0.0})
    for p in pagos_hoje:
        fat_hoje += total_de(p.get("itens", []))
        for i in p.get("itens", []):
            ranking[i["produtoNome"]]["quantidade"] += i["quantidade"]
            ranking[i["produtoNome"]]["total"] += i["quantidade"] * i["precoUnit"]
    pedidos_hoje = len(pagos_hoje)

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
        faturamentoSemana=round(sum(d.faturamento for d in dias), 2),
        faturamentoMes=round(mes["soma"], 2),
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
