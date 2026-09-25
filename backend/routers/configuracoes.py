from fastapi import APIRouter, Depends, HTTPException

import time

from lib.auth import limpo, permitir, registrar_log
from lib.db import db
from models.schemas import Configuracao, ConfigUpdate, ResetContador

router = APIRouter(prefix="/configuracoes", tags=["configuracoes"])

PADROES = {
    "mascaraComanda": "###",
    "nomeEstabelecimento": "Império Da Cana",
    "corPrimaria": "#16a34a",
    "corSecundaria": "#facc15",
    "logoUrl": "",
    "textoBotaoNovoPedido": "Novo Pedido",
    "limiteUsuarios": "5",
}


# Pública: o login precisa do nome/logo/cores antes de existir token.
# Cache de 60s: é o endpoint mais chamado (todo carregamento de página, inclusive
# antes do login) e as configurações quase nunca mudam — evita reler a coleção.
_cache: dict[str, object] = {"quando": 0.0, "dados": None}
_CACHE_TTL = 60.0


def invalidar_cache_configuracoes() -> None:
    _cache["quando"] = 0.0
    _cache["dados"] = None


@router.get("", response_model=list[Configuracao])
async def listar():
    agora = time.monotonic()
    if _cache["dados"] is not None and agora - float(_cache["quando"]) < _CACHE_TTL:
        return _cache["dados"]

    docs = await db.configuracoes.find().to_list(100)
    valores = {d["chave"]: d["valor"] for d in docs}
    for chave, padrao in PADROES.items():
        valores.setdefault(chave, padrao)
    saida = [Configuracao(chave=k, valor=v) for k, v in valores.items()]
    _cache["quando"] = agora
    _cache["dados"] = saida
    return saida


@router.put("/resetar-contador-comanda")
async def resetar_contador(body: ResetContador, user: dict = Depends(permitir("DEV"))):
    if not body.confirmar:
        raise HTTPException(
            status_code=400, detail="Confirme a operação para resetar o contador de comandas"
        )
    await db.contadores.update_one({"_id": "comanda"}, {"$set": {"valor": 0}}, upsert=True)
    await registrar_log(user["id"], "RESETOU_CONTADOR_COMANDA", "Contador zerado")
    return {"mensagem": "Contador de comandas resetado"}


@router.put("/{chave}", response_model=Configuracao)
async def atualizar(chave: str, body: ConfigUpdate, user: dict = Depends(permitir("DEV"))):
    if chave not in PADROES:
        raise HTTPException(status_code=404, detail="Configuração não encontrada")
    valor = body.valor.strip()
    if chave == "mascaraComanda" and "#" not in valor:
        raise HTTPException(
            status_code=400, detail="A máscara da comanda deve conter ao menos um '#'"
        )
    if chave == "limiteUsuarios":
        if not valor.isdigit() or int(valor) < 1:
            raise HTTPException(
                status_code=400, detail="O limite de usuários deve ser um número maior que zero"
            )
    if chave == "nomeEstabelecimento" and not limpo(valor):
        raise HTTPException(status_code=400, detail="O nome do estabelecimento é obrigatório")
    await db.configuracoes.update_one(
        {"chave": chave}, {"$set": {"valor": valor}}, upsert=True
    )
    await registrar_log(user["id"], "ALTEROU_CONFIGURACAO", f"{chave} = {valor}")
    invalidar_cache_configuracoes()
    return Configuracao(chave=chave, valor=valor)
