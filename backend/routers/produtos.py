from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from lib.auth import limpo, next_seq, permitir, registrar_log, usuario_atual
from lib.db import db
from models.schemas import Produto, ProdutoCreate, ProdutoUpdate, StatusUpdate

router = APIRouter(prefix="/produtos", tags=["produtos"])


async def _buscar(pid: int) -> dict:
    doc = await db.produtos.find_one({"id": pid})
    if not doc:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    return doc


@router.get("", response_model=list[Produto])
async def listar(
    ativo: Optional[bool] = Query(default=None),
    categoria: Optional[str] = Query(default=None),
    _user: dict = Depends(usuario_atual),
):
    filtro: dict = {}
    if ativo is not None:
        filtro["ativo"] = ativo
    if categoria:
        filtro["categoria"] = categoria
    docs = await db.produtos.find(filtro).sort([("ordem", 1), ("id", 1)]).to_list(500)
    return [Produto(**d) for d in docs]


@router.post("", response_model=Produto, status_code=201)
async def criar(body: ProdutoCreate, user: dict = Depends(permitir("ADMIN", "DEV"))):
    nome = limpo(body.nome)
    if not nome:
        raise HTTPException(status_code=400, detail="Nome do produto é obrigatório")
    doc = {
        "id": await next_seq("produtos"),
        "nome": nome,
        "descricao": limpo(body.descricao),
        "preco": round(body.preco, 2),
        "categoria": body.categoria,
        "imagemUrl": limpo(body.imagemUrl),
        "ativo": True,
        "ordem": body.ordem,
        "criadoEm": datetime.now(timezone.utc),
    }
    await db.produtos.insert_one(doc)
    await registrar_log(user["id"], "CRIOU_PRODUTO", nome)
    return Produto(**doc)


@router.put("/{pid}", response_model=Produto)
async def editar(pid: int, body: ProdutoUpdate, _user: dict = Depends(permitir("ADMIN", "DEV"))):
    await _buscar(pid)
    # exclude_unset (e não exclude_none): campos opcionais enviados como null precisam
    # ser gravados para permitir REMOVER a imagem/descrição do produto.
    campos = body.model_dump(exclude_unset=True)

    # Campos obrigatórios não podem ser apagados com null.
    for obrigatorio in ("nome", "preco", "categoria", "ordem"):
        if obrigatorio in campos and campos[obrigatorio] is None:
            del campos[obrigatorio]

    if "nome" in campos:
        nome = limpo(campos["nome"])
        if not nome:
            raise HTTPException(status_code=400, detail="Nome do produto é obrigatório")
        campos["nome"] = nome
    if "preco" in campos:
        campos["preco"] = round(campos["preco"], 2)
    # Opcionais aceitam null/"" como remoção explícita.
    if "imagemUrl" in campos:
        campos["imagemUrl"] = limpo(campos["imagemUrl"])
    if "descricao" in campos:
        campos["descricao"] = limpo(campos["descricao"])

    if not campos:
        raise HTTPException(status_code=400, detail="Nenhum campo válido para atualizar")
    await db.produtos.update_one({"id": pid}, {"$set": campos})
    return Produto(**await _buscar(pid))


@router.patch("/{pid}/status", response_model=Produto)
async def mudar_status(
    pid: int, body: StatusUpdate, _user: dict = Depends(permitir("ADMIN", "DEV"))
):
    await _buscar(pid)
    await db.produtos.update_one({"id": pid}, {"$set": {"ativo": body.ativo}})
    return Produto(**await _buscar(pid))


@router.delete("/{pid}")
async def excluir(pid: int, user: dict = Depends(permitir("ADMIN", "DEV"))):
    produto = await _buscar(pid)
    if await db.pedidos.count_documents({"itens.produtoId": pid}):
        raise HTTPException(
            status_code=400,
            detail="Este produto já foi vendido. Desative-o em vez de excluir.",
        )
    await db.produtos.delete_one({"id": pid})
    await registrar_log(user["id"], "EXCLUIU_PRODUTO", produto["nome"])
    return {"mensagem": "Produto excluído"}
