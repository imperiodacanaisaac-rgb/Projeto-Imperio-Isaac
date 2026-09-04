"""Limpa os dados operacionais para o estabelecimento começar do zero.

REMOVE: pedidos, logs, mesas, produtos, movimentos de caixa e o contador de comandas.
PRESERVA: usuários (dev/admin/atendente) e as configurações do sistema.

Uso: cd /app/backend && python limpar_operacao.py
"""

import asyncio

from lib.db import db

COLECOES = ["pedidos", "logs", "mesas", "produtos", "caixa"]


async def main() -> None:
    for nome in COLECOES:
        total = await db[nome].count_documents({})
        await db[nome].delete_many({})
        print(f"{nome}: {total} registro(s) removido(s)")

    # Zera as sequências das coleções limpas e o contador de comandas.
    for seq in ("pedidos", "logs", "mesas", "produtos", "caixa", "comanda"):
        await db.contadores.delete_one({"_id": seq})
    print("contadores zerados (a próxima comanda será a 001)")

    usuarios = await db.usuarios.count_documents({})
    configs = await db.configuracoes.count_documents({})
    print(f"preservados: {usuarios} usuário(s), {configs} configuração(ões)")

    # Remove o índice único antigo de numeroComanda, se existir (agora é por dia).
    try:
        await db.pedidos.drop_index("numeroComanda_1")
        print("índice antigo numeroComanda_1 removido")
    except Exception:
        pass

    print("limpeza concluída")


if __name__ == "__main__":
    asyncio.run(main())
