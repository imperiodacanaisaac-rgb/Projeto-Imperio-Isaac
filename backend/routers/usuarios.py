from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import (
    ROLE_RANK,
    hash_senha,
    limpar_usuario,
    limpo,
    next_seq,
    permitir,
    registrar_log,
    usuario_atual,
    verificar_senha,
)
from lib.db import db
from models.schemas import (
    SenhaUpdate,
    StatusUpdate,
    TemaUpdate,
    Usuario,
    UsuarioCreate,
    UsuarioUpdate,
)

router = APIRouter(prefix="/usuarios", tags=["usuarios"])


async def _contar_devs_ativos() -> int:
    return await db.usuarios.count_documents({"role": "DEV", "ativo": True})


async def _limite_usuarios() -> int:
    """Limite de usuários do estabelecimento, controlado pelo DEV nas Configurações."""
    doc = await db.configuracoes.find_one({"chave": "limiteUsuarios"})
    try:
        return int(doc["valor"]) if doc and str(doc.get("valor", "")).strip() else 5
    except (TypeError, ValueError):
        return 5


async def _buscar(uid: int) -> dict:
    doc = await db.usuarios.find_one({"id": uid})
    if not doc:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return doc


@router.get("", response_model=list[Usuario])
async def listar(user: dict = Depends(permitir("ADMIN", "DEV"))):
    filtro = {} if user["role"] == "DEV" else {"role": "ATENDENTE"}
    docs = await db.usuarios.find(filtro).sort("id", 1).to_list(500)
    return [Usuario(**limpar_usuario(d)) for d in docs]


@router.get("/{uid}", response_model=Usuario)
async def detalhe(uid: int, user: dict = Depends(usuario_atual)):
    if user["role"] == "ATENDENTE" and user["id"] != uid:
        raise HTTPException(status_code=403, detail="Você não tem permissão para esta ação")
    doc = await _buscar(uid)
    if user["role"] == "ADMIN" and doc["role"] != "ATENDENTE" and doc["id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Você não tem permissão para esta ação")
    return Usuario(**limpar_usuario(doc))


@router.post("", response_model=Usuario, status_code=201)
async def criar(body: UsuarioCreate, user: dict = Depends(permitir("ADMIN", "DEV"))):
    nome = limpo(body.nome)
    login = limpo(body.usuario)
    if not nome or not login:
        raise HTTPException(status_code=400, detail="Nome e usuário são obrigatórios")
    if user["role"] == "ADMIN" and body.role != "ATENDENTE":
        raise HTTPException(
            status_code=403, detail="Administradores só podem criar usuários Atendente"
        )
    # Limite de usuários do estabelecimento — o DEV não é limitado.
    if user["role"] != "DEV":
        limite = await _limite_usuarios()
        total = await db.usuarios.count_documents({"ativo": True})
        if total >= limite:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Limite de usuários atingido ({total}/{limite}). "
                    "Entre em contato com o desenvolvedor para aumentar o limite."
                ),
            )
    if await db.usuarios.find_one({"usuario": login}):
        raise HTTPException(status_code=400, detail="Já existe um usuário com este nome de acesso")

    doc = {
        "id": await next_seq("usuarios"),
        "nome": nome,
        "usuario": login,
        "senha": hash_senha(body.senha),
        "role": body.role,
        "tema": "claro",
        "ativo": True,
        "fotoUrl": None,
        "criadoEm": datetime.now(timezone.utc),
    }
    await db.usuarios.insert_one(doc)
    await registrar_log(user["id"], "CRIOU_USUARIO", f"{nome} ({body.role})")
    return Usuario(**limpar_usuario(doc))


@router.put("/{uid}", response_model=Usuario)
async def editar(uid: int, body: UsuarioUpdate, user: dict = Depends(usuario_atual)):
    alvo = await _buscar(uid)
    proprio = user["id"] == uid
    if not proprio:
        if user["role"] == "ATENDENTE":
            raise HTTPException(status_code=403, detail="Você não tem permissão para esta ação")
        if user["role"] == "ADMIN" and alvo["role"] != "ATENDENTE":
            raise HTTPException(
                status_code=403, detail="Você não pode editar este usuário"
            )
    # O atendente não altera o próprio nome de login nem o próprio nome de exibição.
    if proprio and user["role"] == "ATENDENTE":
        raise HTTPException(
            status_code=403,
            detail=(
                "Atendentes não podem alterar os próprios dados de acesso. "
                "Solicite a alteração ao administrador."
            ),
        )
    campos: dict = {}
    nome = limpo(body.nome)
    login = limpo(body.usuario)
    if nome:
        campos["nome"] = nome
    if login and login != alvo["usuario"]:
        if await db.usuarios.find_one({"usuario": login}):
            raise HTTPException(
                status_code=400, detail="Já existe um usuário com este nome de acesso"
            )
        campos["usuario"] = login
    if not campos:
        raise HTTPException(status_code=400, detail="Nenhum campo válido para atualizar")
    await db.usuarios.update_one({"id": uid}, {"$set": campos})
    return Usuario(**limpar_usuario(await _buscar(uid)))


@router.put("/{uid}/senha")
async def alterar_senha(uid: int, body: SenhaUpdate, user: dict = Depends(usuario_atual)):
    alvo = await _buscar(uid)
    proprio = user["id"] == uid
    if proprio:
        # Atendentes não trocam a própria senha — apenas ADMIN/DEV redefinem.
        if user["role"] == "ATENDENTE":
            raise HTTPException(
                status_code=403,
                detail=(
                    "Atendentes não podem alterar a própria senha. "
                    "Solicite a redefinição ao administrador."
                ),
            )
        if not body.senhaAtual or not verificar_senha(body.senhaAtual, alvo["senha"]):
            raise HTTPException(status_code=400, detail="Senha atual incorreta")
    else:
        if user["role"] == "ATENDENTE":
            raise HTTPException(status_code=403, detail="Você não tem permissão para esta ação")
        if user["role"] == "ADMIN" and alvo["role"] != "ATENDENTE":
            raise HTTPException(
                status_code=403, detail="Você só pode redefinir a senha de atendentes"
            )
    await db.usuarios.update_one({"id": uid}, {"$set": {"senha": hash_senha(body.novaSenha)}})
    await registrar_log(user["id"], "ALTEROU_SENHA", f"usuário {alvo['nome']}")
    return {"mensagem": "Senha atualizada com sucesso"}


@router.put("/{uid}/tema", response_model=Usuario)
async def trocar_tema(uid: int, body: TemaUpdate, user: dict = Depends(usuario_atual)):
    if user["id"] != uid:
        raise HTTPException(status_code=403, detail="Você só pode alterar o seu próprio tema")
    await db.usuarios.update_one({"id": uid}, {"$set": {"tema": body.tema}})
    return Usuario(**limpar_usuario(await _buscar(uid)))


@router.patch("/{uid}/status", response_model=Usuario)
async def mudar_status(
    uid: int, body: StatusUpdate, user: dict = Depends(permitir("ADMIN", "DEV"))
):
    alvo = await _buscar(uid)
    if alvo["id"] == user["id"]:
        raise HTTPException(status_code=400, detail="Você não pode desativar a si mesmo")
    if ROLE_RANK[alvo["role"]] >= ROLE_RANK[user["role"]] and user["role"] != "DEV":
        raise HTTPException(
            status_code=403, detail="Você não pode alterar um usuário de nível igual ou superior"
        )
    if user["role"] == "ADMIN" and alvo["role"] != "ATENDENTE":
        raise HTTPException(status_code=403, detail="Você não tem permissão para esta ação")
    if not body.ativo and alvo["role"] == "DEV" and await _contar_devs_ativos() <= 1:
        raise HTTPException(
            status_code=400, detail="Deve existir ao menos um Desenvolvedor ativo no sistema"
        )
    await db.usuarios.update_one({"id": uid}, {"$set": {"ativo": body.ativo}})
    await registrar_log(
        user["id"], "ALTEROU_STATUS_USUARIO", f"{alvo['nome']} -> {'ativo' if body.ativo else 'inativo'}"
    )
    return Usuario(**limpar_usuario(await _buscar(uid)))


@router.delete("/{uid}")
async def excluir(uid: int, user: dict = Depends(permitir("DEV"))):
    alvo = await _buscar(uid)
    if alvo["id"] == user["id"]:
        raise HTTPException(status_code=400, detail="Você não pode excluir a si mesmo")
    if alvo["role"] == "DEV" and await _contar_devs_ativos() <= 1:
        raise HTTPException(
            status_code=400, detail="Deve existir ao menos um Desenvolvedor ativo no sistema"
        )
    if await db.pedidos.count_documents({"atendenteId": uid}):
        raise HTTPException(
            status_code=400,
            detail="Este usuário possui pedidos vinculados. Desative-o em vez de excluir.",
        )
    await db.usuarios.delete_one({"id": uid})
    await registrar_log(user["id"], "EXCLUIU_USUARIO", alvo["nome"])
    return {"mensagem": "Usuário excluído"}
