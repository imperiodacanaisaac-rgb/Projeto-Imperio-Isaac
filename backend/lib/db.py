"""Camada de dados em Firestore (Firebase Admin SDK).

Expõe a MESMA interface que os routers já usavam com o motor/Mongo
(`db.<colecao>.find_one/find/insert_one/find_one_and_update/...`), de modo que
nenhum módulo de rota precisou ser reescrito na migração.

O cliente do google-cloud-firestore é sincrono; toda chamada é executada numa
thread via anyio.to_thread para não bloquear o loop do FastAPI.

Autorização continua 100% no backend (Admin SDK ignora as Firestore rules).
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any, Iterable

import anyio
import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1 import transactional

ROOT = Path(__file__).resolve().parent.parent
CRED_PATH = os.environ.get("FIREBASE_CREDENTIALS", str(ROOT / "secrets" / "firebase-admin.json"))

if not firebase_admin._apps:
    firebase_admin.initialize_app(credentials.Certificate(CRED_PATH))

_fs = firestore.client()


# ---------------------------------------------------------------- filtros
def _get(doc: dict, campo: str) -> Any:
    """Suporta caminho com ponto, inclusive atravessando listas (itens.produtoId)."""
    atual: Any = doc
    for parte in campo.split("."):
        if isinstance(atual, list):
            return [x.get(parte) if isinstance(x, dict) else None for x in atual]
        if not isinstance(atual, dict):
            return None
        atual = atual.get(parte)
    return atual


def _cmp_ok(valor: Any, cond: Any) -> bool:
    if isinstance(cond, dict) and any(k.startswith("$") for k in cond):
        for op, esperado in cond.items():
            if op == "$ne" and valor == esperado:
                return False
            if op == "$gte" and not (valor is not None and valor >= esperado):
                return False
            if op == "$gt" and not (valor is not None and valor > esperado):
                return False
            if op == "$lte" and not (valor is not None and valor <= esperado):
                return False
            if op == "$lt" and not (valor is not None and valor < esperado):
                return False
            if op == "$in" and valor not in esperado:
                return False
            if op == "$regex":
                flags = re.I if "i" in cond.get("$options", "") else 0
                if valor is None or not re.search(esperado, str(valor), flags):
                    return False
        return True
    if isinstance(valor, list):
        return cond in valor
    return valor == cond


def _match(doc: dict, filtro: dict | None) -> bool:
    for campo, cond in (filtro or {}).items():
        if not _cmp_ok(_get(doc, campo), cond):
            return False
    return True


def _aplicar_update(doc: dict, update: dict, inserindo: bool = False) -> dict:
    novo = dict(doc)
    for op, campos in update.items():
        if op == "$set":
            novo.update(campos)
        elif op == "$inc":
            for k, v in campos.items():
                novo[k] = (novo.get(k) or 0) + v
        elif op == "$setOnInsert":
            if inserindo:
                novo.update(campos)
        else:  # documento literal
            return dict(update)
    return novo


class _Resultado:
    def __init__(self, modified: int = 0, matched: int = 0, deleted: int = 0):
        self.modified_count = modified
        self.matched_count = matched
        self.deleted_count = deleted
        self.upserted_id = None


class _Cursor:
    """Cursor preguiçoso: ordena/limita em memória (coleções pequenas de PDV)."""

    def __init__(self, colecao: "_Colecao", filtro: dict | None):
        self._c = colecao
        self._f = filtro
        self._sort: list[tuple[str, int]] = []

    def sort(self, chave, direcao: int = 1) -> "_Cursor":
        self._sort = list(chave) if isinstance(chave, (list, tuple)) else [(chave, direcao)]
        return self

    async def to_list(self, length: int | None = None) -> list[dict]:
        docs = await self._c._todos(self._f)
        for campo, direcao in reversed(self._sort):
            docs.sort(
                key=lambda d: (_get(d, campo) is None, _get(d, campo)),
                reverse=direcao < 0,
            )
        return docs[:length] if length else docs


class _Colecao:
    def __init__(self, nome: str):
        self.nome = nome

    # ---- helpers internos
    def _ref(self):
        return _fs.collection(self.nome)

    def _doc_id(self, doc: dict) -> str | None:
        for chave in ("_id", "id"):
            if doc.get(chave) is not None:
                return str(doc[chave])
        return None

    def _sync_todos(self) -> list[dict]:
        saida = []
        for snap in self._ref().stream():
            d = snap.to_dict() or {}
            d.setdefault("_id", snap.id)
            saida.append(d)
        return saida

    async def _todos(self, filtro: dict | None = None) -> list[dict]:
        docs = await anyio.to_thread.run_sync(self._sync_todos)
        return [d for d in docs if _match(d, filtro)]

    # ---- API compatível com motor
    async def find_one(self, filtro: dict | None = None) -> dict | None:
        docs = await self._todos(filtro)
        return docs[0] if docs else None

    def find(self, filtro: dict | None = None) -> _Cursor:
        return _Cursor(self, filtro)

    async def count_documents(self, filtro: dict | None = None) -> int:
        return len(await self._todos(filtro))

    async def insert_one(self, doc: dict) -> _Resultado:
        dados = {k: v for k, v in doc.items() if k != "_id"}
        did = self._doc_id(doc)

        def _w():
            (self._ref().document(did) if did else self._ref().document()).set(dados)

        await anyio.to_thread.run_sync(_w)
        return _Resultado(matched=1)

    async def update_one(self, filtro: dict, update: dict, upsert: bool = False) -> _Resultado:
        r = await self.find_one_and_update(filtro, update, upsert=upsert)
        return _Resultado(modified=1 if r else 0, matched=1 if r else 0)

    async def update_many(self, filtro: dict, update: dict) -> _Resultado:
        alvos = await self._todos(filtro)

        def _w():
            lote = _fs.batch()
            for d in alvos:
                novo = _aplicar_update(d, update)
                lote.set(
                    self._ref().document(str(d["_id"])),
                    {k: v for k, v in novo.items() if k != "_id"},
                )
            lote.commit()

        if alvos:
            await anyio.to_thread.run_sync(_w)
        return _Resultado(modified=len(alvos), matched=len(alvos))

    async def find_one_and_update(
        self,
        filtro: dict,
        update: dict,
        upsert: bool = False,
        return_document: Any = True,
        **_: Any,
    ) -> dict | None:
        """Atômico quando o filtro identifica o documento por _id/id (contador de
        comanda, guarda de pagamento duplo). Caso contrário, resolve o alvo antes."""
        chave = filtro.get("_id") or filtro.get("id")
        alvo_id = str(chave) if isinstance(chave, (str, int)) else None

        if alvo_id is None:
            achado = await self.find_one(filtro)
            if achado is None and not upsert:
                return None
            if achado is not None:
                alvo_id = str(achado["_id"])

        ref = self._ref().document(alvo_id) if alvo_id else self._ref().document()

        def _tx() -> dict | None:
            @transactional
            def _run(tx):
                snap = ref.get(transaction=tx)
                existe = snap.exists
                atual = (snap.to_dict() or {}) if existe else {}
                atual.setdefault("_id", ref.id)
                # revalida o filtro DENTRO da transação (compare-and-set)
                if existe:
                    if not _match(atual, filtro):
                        return None
                elif not upsert:
                    return None
                novo = _aplicar_update(atual, update, inserindo=not existe)
                novo["_id"] = ref.id
                tx.set(ref, {k: v for k, v in novo.items() if k != "_id"})
                return novo if return_document else atual

            return _run(_fs.transaction())

        return await anyio.to_thread.run_sync(_tx)

    async def delete_one(self, filtro: dict) -> _Resultado:
        achado = await self.find_one(filtro)
        if not achado:
            return _Resultado(deleted=0)
        await anyio.to_thread.run_sync(lambda: self._ref().document(str(achado["_id"])).delete())
        return _Resultado(deleted=1)

    async def delete_many(self, filtro: dict | None = None) -> _Resultado:
        alvos = await self._todos(filtro)

        def _w():
            lote = _fs.batch()
            for d in alvos:
                lote.delete(self._ref().document(str(d["_id"])))
            lote.commit()

        if alvos:
            await anyio.to_thread.run_sync(_w)
        return _Resultado(deleted=len(alvos))

    async def create_index(self, *_: Any, **__: Any) -> None:
        """Firestore não tem índice único; a unicidade é validada nos routers."""
        return None

    async def drop_index(self, *_: Any, **__: Any) -> None:
        return None


class _Banco:
    def __init__(self):
        self._cache: dict[str, _Colecao] = {}

    def __getattr__(self, nome: str) -> _Colecao:
        if nome.startswith("_"):
            raise AttributeError(nome)
        return self[nome]

    def __getitem__(self, nome: str) -> _Colecao:
        if nome not in self._cache:
            self._cache[nome] = _Colecao(nome)
        return self._cache[nome]


class _Cliente:
    def close(self) -> None:
        return None


db = _Banco()
client = _Cliente()
