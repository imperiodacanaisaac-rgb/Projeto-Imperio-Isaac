"""Cache simples em memória com TTL.

Motivo: no Firestore cada consulta custa leitura e a cota diária do plano gratuito é
finita. Telas como dashboard, cardápio e configurações são abertas repetidamente com os
mesmos dados, então vale responder do cache por alguns segundos em vez de reler o banco.

É cache por processo (o backend roda em um único processo), sem dependências externas.
Toda escrita no recurso correspondente deve chamar `invalidar(prefixo)`.
"""

import time
from typing import Any, Callable, Awaitable

_dados: dict[str, tuple[float, Any]] = {}


def invalidar(prefixo: str = "") -> None:
    """Remove tudo (prefixo vazio) ou só as chaves que começam com `prefixo`."""
    if not prefixo:
        _dados.clear()
        return
    for chave in [k for k in _dados if k.startswith(prefixo)]:
        _dados.pop(chave, None)


async def lembrar(chave: str, ttl: float, calcular: Callable[[], Awaitable[Any]]) -> Any:
    """Devolve o valor em cache se ainda fresco; senão calcula, guarda e devolve."""
    agora = time.monotonic()
    item = _dados.get(chave)
    if item and agora - item[0] < ttl:
        return item[1]
    valor = await calcular()
    _dados[chave] = (agora, valor)
    return valor
