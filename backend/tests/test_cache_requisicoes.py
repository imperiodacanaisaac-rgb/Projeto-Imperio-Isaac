"""Prova offline que o cache de mesas/cardápio/dashboard corta requisições repetidas
e que a invalidação por prefixo mantém os dados corretos após uma escrita."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path("/app/backend")))

from lib import cache

leituras = {"mesas": 0, "produtos": 0, "dash": 0}


async def ler(nome: str):
    leituras[nome] += 1
    return [nome]


async def main() -> None:
    cache.invalidar()

    # painel de mesas aberto o dia todo, 30 aberturas de tela
    for _ in range(30):
        await cache.lembrar("mesas:lista", 15.0, lambda: ler("mesas"))
    print(f"30 aberturas do painel de mesas -> {leituras['mesas']} consulta(s)")
    assert leituras["mesas"] == 1

    # mudou o status de uma mesa: invalida e a próxima leitura traz o dado novo
    cache.invalidar("mesas:")
    await cache.lembrar("mesas:lista", 15.0, lambda: ler("mesas"))
    print(f"apos mudar uma mesa -> {leituras['mesas']} consulta(s) no total")
    assert leituras["mesas"] == 2

    # cardápio e dashboard têm prefixos próprios e não são afetados
    for _ in range(20):
        await cache.lembrar("produtos:True:None", 120.0, lambda: ler("produtos"))
        await cache.lembrar("dash:atendente:3", 20.0, lambda: ler("dash"))
    print(f"20 aberturas de Novo Pedido -> {leituras['produtos']} consulta(s) de cardápio")
    print(f"20 aberturas do painel -> {leituras['dash']} consulta(s) de dashboard")
    assert leituras["produtos"] == 1 and leituras["dash"] == 1

    cache.invalidar("mesas:")
    await cache.lembrar("produtos:True:None", 120.0, lambda: ler("produtos"))
    assert leituras["produtos"] == 1, "invalidar mesas nao pode derrubar o cardapio"
    print("OK — cache por recurso, com invalidacao isolada por prefixo")


asyncio.run(main())
