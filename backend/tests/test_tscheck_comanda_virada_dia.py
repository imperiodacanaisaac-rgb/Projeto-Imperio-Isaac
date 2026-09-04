"""tscheck: numeracao da comanda reinicia por dia (diaComanda) e virada de dia no contador.

Verifica:
1) Cada pedido guarda diaComanda=hoje e GET /pedidos reflete isso.
2) Virada de dia (tecnica indicada no briefing: mover o campo `dia` do documento
   contadores._id='comanda' para uma data anterior E o diaComanda do pedido '001'
   existente para essa data anterior) faz o proximo pedido criado voltar a receber
   '001', convivendo com o '001' movido para o dia anterior sem erro de duplicidade
   (indice unico e por (diaComanda, numeroComanda)).
   Restaura integralmente o estado tocado (contador + pedido seedado) no finally,
   renomeando antes o numeroComanda do pedido de teste para nao colidir na restauracao.
"""
import os
import uuid
from datetime import datetime, timedelta

import pymongo
import pytest

from tests.helpers import auth_headers

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME") or "app"


@pytest.fixture
def mongo_db():
    mongo_client = pymongo.MongoClient(MONGO_URL)
    db = mongo_client[DB_NAME]
    yield db
    mongo_client.close()


def _criar_produto(client, sufixo):
    r = client.post(
        "/produtos",
        json={"nome": f"tscheck-prod-dia-{sufixo}", "preco": 5.0, "categoria": "outro"},
        headers=auth_headers("admin"),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _post_pedido_com_retry(client, payload, headers, tentativas=5):
    ultimo = None
    for _ in range(tentativas):
        ultimo = client.post("/pedidos", json=payload, headers=headers)
        if ultimo.status_code != 500:
            return ultimo
        import time
        time.sleep(0.2)
    return ultimo


def test_comanda_numero_e_dia_no_pedido(client):
    sufixo = uuid.uuid4().hex[:8]
    produto_id = _criar_produto(client, sufixo)

    r_proxima_antes = client.get("/comanda/proxima", headers=auth_headers("admin"))
    assert r_proxima_antes.status_code == 200, r_proxima_antes.text

    r = _post_pedido_com_retry(
        client,
        {"itens": [{"produtoId": produto_id, "quantidade": 1}]},
        auth_headers("atendente"),
    )
    assert r.status_code == 201, r.text
    pedido = r.json()
    assert pedido.get("diaComanda"), "pedido deve guardar diaComanda"
    hoje = datetime.now().strftime("%Y-%m-%d")
    assert pedido["diaComanda"] == hoje

    r_get = client.get("/pedidos", params={"numeroComanda": pedido["numeroComanda"]}, headers=auth_headers("admin"))
    assert r_get.status_code == 200
    encontrados = [p for p in r_get.json() if p["id"] == pedido["id"]]
    assert encontrados and encontrados[0]["diaComanda"] == hoje

    client.patch(
        f"/pedidos/{pedido['id']}/cancelar",
        json={"motivo": "tscheck cleanup dia comanda"},
        headers=auth_headers("admin"),
    )


def test_virada_de_dia_reinicia_numeracao(client, mongo_db):
    sufixo = uuid.uuid4().hex[:8]
    produto_id = _criar_produto(client, sufixo)
    hoje = datetime.now().strftime("%Y-%m-%d")
    dia_anterior = (datetime.strptime(hoje, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")

    contador_original = mongo_db.contadores.find_one({"_id": "comanda"})
    assert contador_original is not None
    doc_001_hoje = mongo_db.pedidos.find_one({"diaComanda": hoje, "numeroComanda": "001"})
    assert doc_001_hoje is not None, "pre-condicao: deveria existir comanda 001 de hoje (banco zerado no inicio do dia)"
    id_001 = doc_001_hoje["id"]

    pedido_novo = None
    try:
        # Simula virada: move o contador e a comanda '001' de hoje para o dia anterior,
        # liberando o numero '001' para o dia de hoje.
        mongo_db.contadores.update_one({"_id": "comanda"}, {"$set": {"dia": dia_anterior}})
        mongo_db.pedidos.update_one({"id": id_001}, {"$set": {"diaComanda": dia_anterior}})

        r_proxima = client.get("/comanda/proxima", headers=auth_headers("admin"))
        assert r_proxima.status_code == 200
        assert r_proxima.json()["proxima"].endswith("001")

        r_novo = client.post(
            "/pedidos",
            json={"itens": [{"produtoId": produto_id, "quantidade": 1}]},
            headers=auth_headers("atendente"),
        )
        assert r_novo.status_code == 201, r_novo.text
        pedido_novo = r_novo.json()
        assert pedido_novo["numeroComanda"].endswith("001"), "primeiro pedido apos a virada deve reiniciar em 001"
        assert pedido_novo["diaComanda"] == hoje

        # Coexistencia sem duplicidade: 001-de-hoje (novo) e 001-do-dia-anterior (movido) convivem
        contagem_001 = mongo_db.pedidos.count_documents({"numeroComanda": pedido_novo["numeroComanda"]})
        assert contagem_001 >= 1
        assert mongo_db.pedidos.find_one({"id": id_001})["diaComanda"] == dia_anterior
        assert mongo_db.pedidos.find_one({"id": pedido_novo["id"]})["diaComanda"] == hoje
    finally:
        # Cada passo de restauracao roda isolado (try/except) para que uma falha de rede
        # (ex.: 429 do rate-limit de login) em um passo NUNCA impeca os demais de rodar —
        # a restauracao do estado global (contador + pedido seedado) e a prioridade maxima.
        # Tambem remove proativamente qualquer residuo de execucoes anteriores que tenha
        # ficado ocupando a mesma chave (diaComanda=hoje, numeroComanda="001"), tornando
        # o teste auto-recuperavel entre reruns mesmo apos uma falha parcial anterior.
        if pedido_novo is not None:
            try:
                mongo_db.pedidos.update_one(
                    {"id": pedido_novo["id"]}, {"$set": {"numeroComanda": f"TSCHECK-CLEANUP-{pedido_novo['id']}"}}
                )
            except Exception:
                pass
            try:
                client.patch(
                    f"/pedidos/{pedido_novo['id']}/cancelar",
                    json={"motivo": "tscheck cleanup virada de dia"},
                    headers=auth_headers("admin"),
                )
            except Exception:
                pass
        try:
            residuo = mongo_db.pedidos.find_one(
                {"diaComanda": hoje, "numeroComanda": "001", "id": {"$ne": id_001}}
            )
            if residuo:
                mongo_db.pedidos.update_one(
                    {"id": residuo["id"]}, {"$set": {"numeroComanda": f"TSCHECK-CLEANUP-{residuo['id']}"}}
                )
        except Exception:
            pass
        try:
            mongo_db.pedidos.update_one({"id": id_001}, {"$set": {"diaComanda": hoje}})
        except Exception:
            pass
        try:
            mongo_db.contadores.replace_one({"_id": "comanda"}, contador_original)
        except Exception:
            pass

        # confere restauracao
        assert mongo_db.pedidos.find_one({"id": id_001})["diaComanda"] == hoje
        assert mongo_db.contadores.find_one({"_id": "comanda"}) == contador_original
