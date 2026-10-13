"""Cria no Firestore os índices compostos de /app/firestore.indexes.json usando a
Service Account do backend (alternativa a `firebase deploy --only firestore:indexes`).

Uso:  cd /app/backend && python scripts/criar_indices.py
Índices já existentes são ignorados. A construção leva alguns minutos no Google.
"""

import json
import os
import sys
from pathlib import Path

from google.api_core.exceptions import AlreadyExists
from google.cloud.firestore_admin_v1 import FirestoreAdminClient
from google.cloud.firestore_admin_v1.types import Index
from google.oauth2 import service_account

ROOT = Path(__file__).resolve().parent.parent
CRED = os.environ.get("FIREBASE_CREDENTIALS", str(ROOT / "secrets" / "firebase-admin.json"))
ARQUIVO = ROOT.parent / "firestore.indexes.json"


def main() -> int:
    info = json.loads(Path(CRED).read_text())
    creds = service_account.Credentials.from_service_account_info(info)
    cliente = FirestoreAdminClient(credentials=creds)
    projeto = info["project_id"]

    for idx in json.loads(ARQUIVO.read_text())["indexes"]:
        pai = f"projects/{projeto}/databases/(default)/collectionGroups/{idx['collectionGroup']}"
        campos = [
            Index.IndexField(
                field_path=f["fieldPath"],
                order=Index.IndexField.Order[f["order"]],
            )
            for f in idx["fields"]
        ]
        nome = f"{idx['collectionGroup']}: " + ", ".join(
            f"{f['fieldPath']} {f['order']}" for f in idx["fields"]
        )
        try:
            cliente.create_index(
                parent=pai,
                index=Index(query_scope=Index.QueryScope.COLLECTION, fields=campos),
            )
            print(f"[criado]     {nome}")
        except AlreadyExists:
            print(f"[já existe]  {nome}")
        except Exception as erro:  # permissão, cota, etc.
            print(f"[falhou]     {nome} -> {erro}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
