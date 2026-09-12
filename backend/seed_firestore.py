"""Cria os 3 usuários de acesso no Firestore (idempotente)."""

import asyncio
from datetime import datetime, timezone

from lib.auth import hash_senha
from lib.db import db

USUARIOS = [
    {"id": 1, "nome": "Desenvolvedor", "usuario": "mbangipedro@gmail.com", "senha": "dev@IC", "role": "DEV"},
    {"id": 2, "nome": "Isaac — Dono", "usuario": "imperiodacanaisaac@gmail.com", "senha": "Isaac@IC", "role": "ADMIN"},
    {"id": 3, "nome": "Atendente", "usuario": "Atendente", "senha": "atendente123", "role": "ATENDENTE"},
]

CONFIGS = {
    "mascaraComanda": "###",
    "nomeEstabelecimento": "Império Da Cana",
    "corPrimaria": "#16a34a",
    "corSecundaria": "#facc15",
    "logoUrl": "",
    "textoBotaoNovoPedido": "Novo Pedido",
    "limiteUsuarios": "5",
}


async def main() -> None:
    agora = datetime.now(timezone.utc)
    for u in USUARIOS:
        if await db.usuarios.find_one({"usuario": u["usuario"]}):
            print(f"já existe: {u['usuario']}")
            continue
        await db.usuarios.insert_one(
            {
                "id": u["id"],
                "nome": u["nome"],
                "usuario": u["usuario"],
                "senha": hash_senha(u["senha"]),
                "role": u["role"],
                "tema": "claro",
                "ativo": True,
                "fotoUrl": None,
                "criadoEm": agora,
            }
        )
        print(f"criado: {u['usuario']} ({u['role']})")

    await db.contadores.update_one({"_id": "usuarios"}, {"$set": {"valor": 3}}, upsert=True)

    for chave, valor in CONFIGS.items():
        if not await db.configuracoes.find_one({"chave": chave}):
            await db.configuracoes.insert_one({"_id": chave, "chave": chave, "valor": valor})
    print("configurações prontas")


if __name__ == "__main__":
    asyncio.run(main())
