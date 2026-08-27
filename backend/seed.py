"""Seed idempotente — `cd /app/backend && python seed.py`."""

import asyncio
from datetime import datetime, timezone

from lib.auth import hash_senha
from lib.db import db

USUARIOS = [
    {"nome": "Desenvolvedor", "usuario": "dev", "senha": "dev123", "role": "DEV"},
    {"nome": "Dono do Estabelecimento", "usuario": "admin", "senha": "admin123", "role": "ADMIN"},
    {"nome": "Atendente Padrão", "usuario": "atendente", "senha": "atendente123", "role": "ATENDENTE"},
]

PRODUTOS = [
    {"nome": "Caldo de Cana 300ml", "preco": 6.00, "categoria": "caldo", "ordem": 1,
     "descricao": "Caldo de cana gelado, moído na hora"},
    {"nome": "Caldo de Cana 500ml", "preco": 9.00, "categoria": "caldo", "ordem": 2,
     "descricao": "Copo grande, moído na hora"},
    {"nome": "Pastel de Carne", "preco": 8.00, "categoria": "pastel", "ordem": 3,
     "descricao": "Massa crocante com carne temperada"},
    {"nome": "Pastel de Queijo", "preco": 7.50, "categoria": "pastel", "ordem": 4,
     "descricao": "Queijo mussarela derretido"},
    {"nome": "Pastel de Frango com Catupiry", "preco": 9.00, "categoria": "pastel", "ordem": 5,
     "descricao": "Frango desfiado com catupiry"},
]

CONFIGS = {
    "mascaraComanda": "###",
    "nomeEstabelecimento": "Império Da Cana",
    "corPrimaria": "#16a34a",
    "corSecundaria": "#facc15",
    "logoUrl": "",
    "textoBotaoNovoPedido": "Novo Pedido",
}


async def seq(nome: str) -> int:
    doc = await db.contadores.find_one_and_update(
        {"_id": nome}, {"$inc": {"valor": 1}}, upsert=True, return_document=True
    )
    return int(doc["valor"])


async def main() -> None:
    agora = datetime.now(timezone.utc)

    for u in USUARIOS:
        if not await db.usuarios.find_one({"usuario": u["usuario"]}):
            await db.usuarios.insert_one(
                {
                    "id": await seq("usuarios"),
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
            print(f"usuário criado: {u['usuario']}")

    for p in PRODUTOS:
        if not await db.produtos.find_one({"nome": p["nome"]}):
            await db.produtos.insert_one(
                {
                    "id": await seq("produtos"),
                    "nome": p["nome"],
                    "descricao": p["descricao"],
                    "preco": p["preco"],
                    "categoria": p["categoria"],
                    "imagemUrl": None,
                    "ativo": True,
                    "ordem": p["ordem"],
                    "criadoEm": agora,
                }
            )
            print(f"produto criado: {p['nome']}")

    for numero in range(1, 7):
        if not await db.mesas.find_one({"numero": numero}):
            await db.mesas.insert_one(
                {
                    "id": await seq("mesas"),
                    "numero": numero,
                    "status": "LIVRE",
                    "capacidade": 4,
                    "observacao": None,
                    "criadoEm": agora,
                }
            )
            print(f"mesa criada: {numero}")

    for chave, valor in CONFIGS.items():
        await db.configuracoes.update_one(
            {"chave": chave}, {"$setOnInsert": {"valor": valor}}, upsert=True
        )

    await db.contadores.update_one({"_id": "comanda"}, {"$setOnInsert": {"valor": 0}}, upsert=True)

    await db.usuarios.create_index("usuario", unique=True)
    await db.mesas.create_index("numero", unique=True)
    await db.pedidos.create_index("numeroComanda", unique=True)
    print("seed concluído")


if __name__ == "__main__":
    asyncio.run(main())
