"""Cria os 3 usuários de acesso no Firestore (idempotente)."""

import asyncio
from datetime import datetime, timezone

from lib.auth import hash_senha
from lib.db import db

USUARIOS = [
    {"id": 1, "nome": "Desenvolvedor", "usuario": "mbangipedro@gmail.com", "senha": "DevIC@15", "role": "DEV"},
    {"id": 2, "nome": "Isaac — Dono", "usuario": "imperiodacanagestao@gmail.com", "senha": "GestaoICIsaac@15", "role": "ADMIN"},
    {"id": 3, "nome": "Atendente", "usuario": "Atendente", "senha": "Atendente123", "role": "ATENDENTE"},
]

PRODUTOS = [
    {"nome": "Caldo de Cana 300ml", "preco": 6.0, "categoria": "caldo"},
    {"nome": "Caldo de Cana 500ml", "preco": 9.0, "categoria": "caldo"},
    {"nome": "Pastel de Carne", "preco": 8.0, "categoria": "pastel"},
    {"nome": "Pastel de Queijo", "preco": 7.5, "categoria": "pastel"},
    {"nome": "Pastel de Frango com Catupiry", "preco": 9.0, "categoria": "pastel"},
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

    if not await db.mesas.find_one({}):
        for n in range(1, 7):
            await db.mesas.insert_one(
                {
                    "id": n,
                    "numero": n,
                    "status": "LIVRE",
                    "capacidade": 4,
                    "observacao": None,
                    "criadoEm": agora,
                }
            )
        await db.contadores.update_one({"_id": "mesas"}, {"$set": {"valor": 6}}, upsert=True)
        print("6 mesas criadas")

    if not await db.produtos.find_one({}):
        for i, p in enumerate(PRODUTOS, start=1):
            await db.produtos.insert_one(
                {
                    "id": i,
                    "nome": p["nome"],
                    "descricao": None,
                    "preco": p["preco"],
                    "categoria": p["categoria"],
                    "imagemUrl": None,
                    "ativo": True,
                    "ordem": i,
                    "criadoEm": agora,
                }
            )
        await db.contadores.update_one(
            {"_id": "produtos"}, {"$set": {"valor": len(PRODUTOS)}}, upsert=True
        )
        print(f"{len(PRODUTOS)} produtos criados")


if __name__ == "__main__":
    asyncio.run(main())
