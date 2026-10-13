"""Execução ÚNICA: adiciona o campo `produtoIds` aos pedidos antigos.

Pedidos novos já gravam esse campo. Com ele, "este produto já foi vendido?" vira um
count() com array_contains (~1 leitura) em vez de varrer a coleção /pedidos inteira.
Este script lê a coleção uma vez e só grava nos documentos que ainda não têm o campo.

Uso:  cd /app/backend && python scripts/backfill_produto_ids.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from lib.db import _fs  # noqa: E402


def main() -> int:
    lote, pendentes, atualizados = _fs.batch(), 0, 0
    for snap in _fs.collection("pedidos").stream():
        d = snap.to_dict() or {}
        if "produtoIds" in d:
            continue
        ids = sorted({int(i["produtoId"]) for i in d.get("itens", []) if "produtoId" in i})
        lote.update(snap.reference, {"produtoIds": ids})
        pendentes += 1
        atualizados += 1
        if pendentes == 400:
            lote.commit()
            lote, pendentes = _fs.batch(), 0
    if pendentes:
        lote.commit()
    print(f"Pedidos atualizados com produtoIds: {atualizados}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
