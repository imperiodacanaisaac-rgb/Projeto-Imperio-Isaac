"""Prova offline que validar o token não lê o Firestore em toda requisição."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

import lib.auth as auth

leituras = {"n": 0}


class FakeUsuarios:
    async def find_one(self, _filtro):
        leituras["n"] += 1
        return {"id": 3, "nome": "Atendente", "usuario": "Atendente", "role": "ATENDENTE", "ativo": True, "tema": "claro", "senha": "x"}


class FakeDB:
    usuarios = FakeUsuarios()


class FakeReq:
    def __init__(self, token):
        self.headers = {"authorization": f"Bearer {token}"}


auth.db = FakeDB()
auth.invalidar_cache_usuario()

token = auth.criar_token({"id": 3, "nome": "Atendente", "role": "ATENDENTE", "usuario": "Atendente"})

# 20 requisições autenticadas seguidas, como num caixa aberto o dia todo
for _ in range(20):
    asyncio.run(auth.usuario_atual(FakeReq(token)))
print(f"20 requisições -> {leituras['n']} leitura(s) no Firestore")
assert leituras["n"] == 1, leituras

# desativar/alterar usuário invalida o cache na hora
auth.invalidar_cache_usuario(3)
asyncio.run(auth.usuario_atual(FakeReq(token)))
print(f"após invalidar cache -> {leituras['n']} leitura(s) no total")
assert leituras["n"] == 2, leituras

print("OK — antes eram 20 leituras para 20 requisições; agora é 1 por minuto por usuário")
