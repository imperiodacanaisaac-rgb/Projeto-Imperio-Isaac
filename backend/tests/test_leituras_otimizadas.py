"""Verifica offline (sem tocar no Firestore real) que as consultas descem filtro,
ordenação e limite para o banco — o que reduz as leituras e a cota consumida."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncio

import lib.db as libdb


class FakeQuery:
    def __init__(self, log, docs):
        self.log, self.docs = log, docs

    def where(self, filter=None):
        self.log.append(("where", filter.field_path, filter.value))
        return self

    def order_by(self, campo, direction=None):
        self.log.append(("order_by", campo, direction))
        return self

    def limit(self, n):
        self.log.append(("limit", n))
        return self

    def stream(self):
        return iter(self.docs)

    def document(self, doc_id=None):
        self.log.append(("document_get", doc_id))
        return FakeDocRef()


class FakeSnap:
    def __init__(self, id, data):
        self.id, self._d, self.exists = id, data, True

    def to_dict(self):
        return dict(self._d)


class FakeDocRef:
    def get(self):
        return FakeSnap("7", {"id": 7, "numeroComanda": "007"})


class FakeFS:
    def __init__(self):
        self.log = []
        self.docs = [FakeSnap("1", {"id": 1, "status": "ABERTO", "criadoEm": 1})]

    def collection(self, _nome):
        return FakeQuery(self.log, self.docs)


def cenario(nome, filtro, ordem, limite):
    fake = FakeFS()
    libdb._fs = fake
    col = libdb._Colecao("pedidos")
    docs = asyncio.run(col._todos(filtro, ordem=ordem, limite=limite))
    print(f"{nome}: ops={fake.log} docs={len(docs)}")
    return fake.log


log = cenario("busca por id (1 leitura)", {"id": 7}, None, None)
assert log == [("document_get", "7")], log

log = cenario("igualdade + ordem + limite", {"status": "ABERTO"}, [("criadoEm", -1)], 50)
assert ("where", "status", "ABERTO") in log
assert ("order_by", "criadoEm", "DESCENDING") in log
assert ("limit", 50) in log, log

log = cenario("com operador (sem limite no banco)", {"criadoEm": {"$gte": 0}}, [("criadoEm", -1)], 50)
assert not [o for o in log if o[0] in ("limit", "order_by")], log

log = cenario("sem filtro + ordem + limite", {}, [("numero", 1)], 20)
assert ("order_by", "numero", "ASCENDING") in log and ("limit", 20) in log, log

print("OK — filtro, ordenação e limite são aplicados no Firestore, não em memória")
