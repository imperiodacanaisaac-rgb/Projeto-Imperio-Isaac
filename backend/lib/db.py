"""Camada de dados em Firestore (Firebase Admin SDK).

Expõe uma interface de coleções/documentos no estilo do antigo adaptador
(`db.<colecao>.find_one/find/insert_one/find_one_and_update/...`), de modo que
nenhum módulo de rota precisou ser reescrito na migração.

O cliente do google-cloud-firestore é sincrono; toda chamada é executada numa
thread via anyio.to_thread para não bloquear o loop do FastAPI.

Autorização continua 100% no backend (Admin SDK ignora as Firestore rules).
"""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path
from typing import Any, Iterable

import anyio
import firebase_admin
from firebase_admin import credentials, firestore
from google.api_core.exceptions import FailedPrecondition
from google.cloud.firestore_v1 import FieldFilter, transactional

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
            if op == "$contains" and not (isinstance(valor, list) and esperado in valor):
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


_OPS_RANGE = {"$gte": ">=", "$gt": ">", "$lte": "<=", "$lt": "<"}
_log = logging.getLogger("firestore")
_indices_avisados: set[str] = set()


class _Plano:
    """Consulta montada: completa (igualdades + intervalo) e a reserva só-intervalo."""

    def __init__(self, consulta):
        self.consulta = consulta
        self.so_range = None
        self.campo_range: str | None = None
        self.tudo_no_banco = True


def _ler(q) -> list[dict]:
    saida = []
    for snap in q.stream():
        d = snap.to_dict() or {}
        d.setdefault("_id", snap.id)
        saida.append(d)
    return saida


def _avisar_indice(colecao: str, erro: Exception) -> None:
    """Loga (uma vez) o link do índice composto que o Firestore pede para criar."""
    msg = str(erro)
    if msg not in _indices_avisados:
        _indices_avisados.add(msg)
        _log.warning("Índice composto ausente em /%s — usando consulta reserva. %s", colecao, msg)


class _Resultado:
    def __init__(self, modified: int = 0, matched: int = 0, deleted: int = 0):
        self.modified_count = modified
        self.matched_count = matched
        self.deleted_count = deleted
        self.upserted_id = None


class _Cursor:
    """Cursor: empurra ordenação e limite para o Firestore quando é seguro."""

    def __init__(self, colecao: "_Colecao", filtro: dict | None):
        self._c = colecao
        self._f = filtro
        self._sort: list[tuple[str, int]] = []

    def sort(self, chave, direcao: int = 1) -> "_Cursor":
        self._sort = list(chave) if isinstance(chave, (list, tuple)) else [(chave, direcao)]
        return self

    async def to_list(self, length: int | None = None) -> list[dict]:
        docs = await self._c._todos(self._f, ordem=self._sort, limite=length)
        for campo, direcao in reversed(self._sort):
            # `c=campo` fixa o campo da iteração atual (evita late binding).
            docs.sort(
                key=lambda d, c=campo: (_get(d, c) is None, _get(d, c)),
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

    def _montar_consulta(self, filtro: dict) -> _Plano:
        """Traduz o filtro para `where(...)` nativos do Firestore.

        - igualdade simples         -> `==`
        - `$gte/$gt/$lte/$lt`       -> desigualdade no banco (1 campo por consulta)
        - `$contains`               -> `array_contains`
        Qualquer outro operador (`$regex`, `$ne`, ...) é refinado em memória e marca o
        plano como "não totalmente no banco" (aí não é seguro aplicar limit no servidor).
        """
        plano = _Plano(self._ref())
        for campo, valor in filtro.items():
            if campo.startswith("$") or campo in ("_id", "id") or "." in campo:
                plano.tudo_no_banco = False
                continue
            if isinstance(valor, (str, int, float, bool)):
                plano.consulta = plano.consulta.where(filter=FieldFilter(campo, "==", valor))
            elif (
                isinstance(valor, dict)
                and valor
                and set(valor) <= set(_OPS_RANGE)
                and plano.campo_range is None
            ):
                plano.campo_range = campo
                plano.so_range = self._ref()
                for op, v in valor.items():
                    f = FieldFilter(campo, _OPS_RANGE[op], v)
                    plano.consulta = plano.consulta.where(filter=f)
                    plano.so_range = plano.so_range.where(filter=f)
            elif isinstance(valor, dict) and set(valor) == {"$contains"}:
                plano.consulta = plano.consulta.where(
                    filter=FieldFilter(campo, "array_contains", valor["$contains"])
                )
            else:
                plano.tudo_no_banco = False
        return plano

    def _sync_todos(
        self,
        filtro: dict | None = None,
        ordem: list[tuple[str, int]] | None = None,
        limite: int | None = None,
    ) -> list[dict]:
        """Busca no Firestore já filtrando, ordenando e limitando no servidor.

        Filtro por documento (`_id`/`id`) vira `get()` de 1 leitura; igualdades e
        intervalos de data viram `where(...)`; `order_by + limit` descem para o banco.
        Se faltar índice composto (FailedPrecondition), a consulta cai para SÓ o
        intervalo de data (índice simples automático) — continua restrita ao período,
        nunca à coleção inteira — e o resto do filtro é refinado em memória.
        """
        filtro = filtro or {}

        chave = filtro.get("_id") or filtro.get("id")
        if isinstance(chave, (str, int)):
            snap = self._ref().document(str(chave)).get()
            if not snap.exists:
                return []
            d = snap.to_dict() or {}
            d.setdefault("_id", snap.id)
            return [d]

        plano = self._montar_consulta(filtro)
        campo_ordem, direcao = (ordem[0] if ordem and len(ordem) == 1 else (None, 1))
        sentido = "DESCENDING" if direcao < 0 else "ASCENDING"
        # Com desigualdade, o Firestore só ordena (sem índice extra) pelo mesmo campo.
        ordena_no_banco = campo_ordem is not None and plano.campo_range in (None, campo_ordem)

        otimizada = plano.consulta
        if plano.tudo_no_banco and ordena_no_banco:
            otimizada = otimizada.order_by(campo_ordem, direction=sentido)
        if plano.tudo_no_banco and limite and (not ordem or ordena_no_banco):
            otimizada = otimizada.limit(limite)

        try:
            return _ler(otimizada)
        except FailedPrecondition as erro:
            _avisar_indice(self.nome, erro)
            if plano.so_range is not None:
                q = plano.so_range
                if campo_ordem == plano.campo_range:
                    q = q.order_by(campo_ordem, direction=sentido)
                    if limite:
                        # teto de segurança: o refino em memória corta para `limite`
                        q = q.limit(max(limite * 4, 200))
                return _ler(q)
            return _ler(plano.consulta)

    def _sync_agregar(self, filtro: dict, soma: str | None) -> dict | None:
        """count()/sum() nativos: custam ~1 leitura por 1000 documentos casados,
        em vez de 1 leitura por documento. Devolve None se não der para agregar no banco."""
        plano = self._montar_consulta(filtro)
        if not plano.tudo_no_banco or filtro.get("_id") or filtro.get("id"):
            return None
        agg = plano.consulta.count(alias="qtd")
        if soma:
            agg = agg.sum(soma, alias="soma")
        try:
            resultado = agg.get()
        except FailedPrecondition as erro:
            _avisar_indice(self.nome, erro)
            return None
        valores = {r.alias: r.value for r in resultado[0]}
        return {"qtd": int(valores.get("qtd") or 0), "soma": float(valores.get("soma") or 0)}

    async def agregar(self, filtro: dict | None = None, soma: str | None = None) -> dict:
        """{'qtd': n, 'soma': x} — agrega no Firestore; sem índice, calcula em memória
        (ainda restrito ao intervalo de data do filtro)."""
        filtro = filtro or {}
        r = await anyio.to_thread.run_sync(self._sync_agregar, filtro, soma)
        if r is not None:
            return r
        docs = await self._todos(filtro)
        total = 0.0
        if soma:
            for d in docs:
                v = _get(d, soma)
                total += v if isinstance(v, (int, float)) else 0
        return {"qtd": len(docs), "soma": total}

    async def _todos(
        self,
        filtro: dict | None = None,
        ordem: list[tuple[str, int]] | None = None,
        limite: int | None = None,
    ) -> list[dict]:
        docs = await anyio.to_thread.run_sync(self._sync_todos, filtro, ordem, limite)
        return [d for d in docs if _match(d, filtro)]

    # ---- API de coleção (find/insert/update/delete)
    async def find_one(self, filtro: dict | None = None) -> dict | None:
        docs = await self._todos(filtro, limite=1)
        return docs[0] if docs else None

    def find(self, filtro: dict | None = None) -> _Cursor:
        return _Cursor(self, filtro)

    async def count_documents(self, filtro: dict | None = None) -> int:
        return (await self.agregar(filtro))["qtd"]

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
