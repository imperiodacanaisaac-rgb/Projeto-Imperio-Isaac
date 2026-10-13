from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from lib import cache
from lib.auth import limpo, next_seq, permitir, registrar_log, usuario_atual
from lib.dates import dia_local, inicio_do_dia
from lib.db import db
from models.schemas import (
    CaixaMovimento,
    CaixaResumo,
    DiaRelatorio,
    FormaTotal,
    GrupoVendas,
    MovimentoCreate,
    ProdutoRanking,
    Relatorio,
    VendaProduto,
    VendasPorCategoria,
)

router = APIRouter(prefix="/caixa", tags=["caixa"])

# O caldo de cana é uma BEBIDA: as categorias "caldo" e "bebida" somam no grupo Bebidas.
GRUPO_POR_CATEGORIA = {
    "pastel": "Pastéis",
    "caldo": "Bebidas",
    "bebida": "Bebidas",
    "outro": "Outros",
}


def grupo_da_categoria(categoria: str) -> str:
    return GRUPO_POR_CATEGORIA.get(categoria, "Outros")


async def mapa_produtos() -> dict[int, dict]:
    async def calcular() -> dict[int, dict]:
        produtos = await db.produtos.find().to_list(1000)
        return {p["id"]: p for p in produtos}

    # Cardápio muda pouco: evita reler todos os produtos a cada relatório.
    return await cache.lembrar("produtos:mapa", 120.0, calcular)


def dia_utc(data: Optional[str]) -> datetime:
    """Início do dia no fuso do estabelecimento (APP_TZ), timezone-aware."""
    return inicio_do_dia(data)


def aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


MAX_DIAS_PERIODO = 31


def validar_periodo(inicio: datetime, fim: datetime) -> None:
    """Teto de período: impede que um relatório varra meses de pedidos de uma vez."""
    if fim <= inicio:
        raise HTTPException(status_code=400, detail="A data final deve ser igual ou posterior à inicial")
    if (fim - inicio).days > MAX_DIAS_PERIODO:
        raise HTTPException(
            status_code=400,
            detail=f"Período máximo de {MAX_DIAS_PERIODO} dias por consulta",
        )


async def _agregar_dia(ini: datetime) -> DiaRelatorio:
    agg = await db.pedidos.agregar(
        {"status": "PAGO", "criadoEm": {"$gte": ini, "$lt": ini + timedelta(days=1)}},
        soma="pagamento.valor",
    )
    return DiaRelatorio(
        data=ini.date().isoformat(), faturamento=round(agg["soma"], 2), pedidos=agg["qtd"]
    )


async def faturamento_por_dia(ultimo_dia: datetime, dias: int) -> list[DiaRelatorio]:
    """Faturamento/pedidos pagos por dia via agregação nativa (count + sum) — cada
    dia custa ~1 leitura no Firestore em vez de ler todos os pedidos do período.
    Dias passados não mudam: ficam 12h em cache; só o dia atual é recalculado."""
    hoje = dia_utc(None)
    saida: list[DiaRelatorio] = []
    for n in range(dias - 1, -1, -1):
        ini = ultimo_dia - timedelta(days=n)
        if ini < hoje:
            saida.append(
                await cache.lembrar(
                    f"hist:dia:{ini.date().isoformat()}", 43200.0, lambda i=ini: _agregar_dia(i)
                )
            )
        else:
            saida.append(await _agregar_dia(ini))
    return saida


@router.get("/faturamento-dias", response_model=list[DiaRelatorio])
async def faturamento_dias(dias: int = 7, _user: dict = Depends(permitir("ADMIN", "DEV"))):
    dias = max(1, min(dias, 14))
    return await cache.lembrar(
        f"dash:faturamento-dias:{dias}", 60.0, lambda: faturamento_por_dia(dia_utc(None), dias)
    )


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
    docs = await db.caixa.find(filtro).sort("criadoEm", -1).to_list(50)
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
    cache.invalidar("dash:")
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
    validar_periodo(inicio, fim)

    pedidos = await db.pedidos.find(
        {"status": "PAGO", "criadoEm": {"$gte": inicio, "$lt": fim}}
    ).to_list(5000)

    por_dia: dict[str, dict] = defaultdict(lambda: {"faturamento": 0.0, "pedidos": 0})
    ranking: dict[str, dict] = defaultdict(lambda: {"quantidade": 0.0, "total": 0.0})
    formas: dict[str, dict] = defaultdict(lambda: {"valor": 0.0, "quantidade": 0})
    grupos: dict[str, dict] = defaultdict(lambda: {"quantidade": 0.0, "valor": 0.0})
    produtos = await mapa_produtos()
    total_faturado = 0.0

    for p in pedidos:
        total = round(sum(i["quantidade"] * i["precoUnit"] for i in p.get("itens", [])), 2)
        total_faturado += total
        chave = dia_local(p["criadoEm"])
        por_dia[chave]["faturamento"] += total
        por_dia[chave]["pedidos"] += 1
        for i in p.get("itens", []):
            ranking[i["produtoNome"]]["quantidade"] += i["quantidade"]
            ranking[i["produtoNome"]]["total"] += i["quantidade"] * i["precoUnit"]
            categoria = (produtos.get(i["produtoId"]) or {}).get("categoria", "outro")
            g = grupo_da_categoria(categoria)
            grupos[g]["quantidade"] += i["quantidade"]
            grupos[g]["valor"] += i["quantidade"] * i["precoUnit"]
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

    ordem_grupos = ["Pastéis", "Bebidas", "Outros"]
    lista_grupos = [
        GrupoVendas(
            grupo=g,
            quantidade=grupos[g]["quantidade"],
            valor=round(grupos[g]["valor"], 2),
        )
        for g in ordem_grupos
        if g in grupos
    ]

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
        grupos=lista_grupos,
    )


@router.get("/vendas-categorias", response_model=VendasPorCategoria)
async def vendas_categorias(
    dataInicio: Optional[str] = None,
    dataFim: Optional[str] = None,
    grupo: Optional[str] = None,
    produtoId: Optional[int] = None,
    _user: dict = Depends(permitir("ADMIN", "DEV")),
):
    """Vendas do período separadas em Pastéis x Bebidas (o caldo de cana conta como
    bebida), com detalhamento por produto e filtro opcional de grupo/produto."""
    fim_base = dia_utc(dataFim)
    inicio = dia_utc(dataInicio) if dataInicio else fim_base
    fim = fim_base + timedelta(days=1)
    validar_periodo(inicio, fim)

    pedidos = await db.pedidos.find(
        {"status": "PAGO", "criadoEm": {"$gte": inicio, "$lt": fim}}
    ).to_list(5000)
    produtos = await mapa_produtos()

    grupos: dict[str, dict] = defaultdict(lambda: {"quantidade": 0.0, "valor": 0.0})
    por_produto: dict[int, dict] = {}

    for p in pedidos:
        for i in p.get("itens", []):
            prod = produtos.get(i["produtoId"]) or {}
            categoria = prod.get("categoria", "outro")
            g = grupo_da_categoria(categoria)
            valor = i["quantidade"] * i["precoUnit"]

            grupos[g]["quantidade"] += i["quantidade"]
            grupos[g]["valor"] += valor

            if grupo and g != grupo:
                continue
            if produtoId is not None and i["produtoId"] != produtoId:
                continue

            atual = por_produto.setdefault(
                i["produtoId"],
                {
                    "produtoId": i["produtoId"],
                    "produtoNome": i["produtoNome"],
                    "categoria": categoria,
                    "grupo": g,
                    "quantidade": 0.0,
                    "valor": 0.0,
                },
            )
            atual["quantidade"] += i["quantidade"]
            atual["valor"] += valor

    ordem_grupos = ["Pastéis", "Bebidas", "Outros"]
    lista_grupos = [
        GrupoVendas(
            grupo=g, quantidade=grupos[g]["quantidade"], valor=round(grupos[g]["valor"], 2)
        )
        for g in ordem_grupos
        if g in grupos
    ]
    lista_produtos = sorted(
        (
            VendaProduto(**{**v, "valor": round(v["valor"], 2)})
            for v in por_produto.values()
        ),
        key=lambda v: v.quantidade,
        reverse=True,
    )

    return VendasPorCategoria(
        dataInicio=inicio.date().isoformat(),
        dataFim=fim_base.date().isoformat(),
        grupos=lista_grupos,
        produtos=lista_produtos,
        quantidadeTotal=sum(v.quantidade for v in lista_produtos),
        valorTotal=round(sum(v.valor for v in lista_produtos), 2),
    )
