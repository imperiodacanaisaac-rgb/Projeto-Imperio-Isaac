"""Copia todas as colecoes do projeto Firestore antigo para o novo.

Uso: python backend/scripts/migrar_firestore.py [--dry-run]
Mantem os mesmos IDs de documento, para nao quebrar relacoes (mesaId, pedidoId...).
"""

import sys
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore

ROOT = Path(__file__).resolve().parent.parent
ANTIGO = ROOT / "secrets" / "firebase-admin.json"
NOVO = ROOT / "secrets" / "firebase-admin-novo.json"

COLECOES = [
    "usuarios",
    "mesas",
    "produtos",
    "pedidos",
    "caixa",
    "configuracoes",
    "contadores",
    "logs",
]

DRY = "--dry-run" in sys.argv


def cliente(cred_path: Path, nome: str):
    app = firebase_admin.initialize_app(credentials.Certificate(str(cred_path)), name=nome)
    return firestore.client(app)


def main() -> None:
    origem = cliente(ANTIGO, "origem")
    destino = cliente(NOVO, "destino")

    total = 0
    for col in COLECOES:
        docs = list(origem.collection(col).stream())
        print(f"{col}: {len(docs)} documentos")
        if DRY:
            continue
        lote = destino.batch()
        n = 0
        for doc in docs:
            lote.set(destino.collection(col).document(doc.id), doc.to_dict())
            n += 1
            if n % 400 == 0:
                lote.commit()
                lote = destino.batch()
        if n:
            lote.commit()
        total += n
    print(f"OK — {total} documentos copiados{' (dry-run)' if DRY else ''}")


if __name__ == "__main__":
    main()
