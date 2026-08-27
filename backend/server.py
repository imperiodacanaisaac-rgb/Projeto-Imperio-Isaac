from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
from lib.db import client, db
from lib.auth import permitir
from routers import (
    auth,
    caixa,
    configuracoes,
    dashboard,
    logs,
    mesas,
    pedidos,
    produtos,
    usuarios,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.usuarios.create_index("usuario", unique=True)
    await db.mesas.create_index("numero", unique=True)
    await db.pedidos.create_index("numeroComanda", unique=True)
    yield
    client.close()


app = FastAPI(lifespan=lifespan, title="Império Da Cana API")

api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "Império Da Cana API", "status": "ok"}


@api_router.get("/comanda/proxima")
async def proxima_comanda(_user: dict = Depends(permitir("DEV", "ADMIN", "ATENDENTE"))):
    return {"proxima": await pedidos.proxima_comanda_preview()}


api_router.include_router(auth.router)
api_router.include_router(usuarios.router)
api_router.include_router(mesas.router)
api_router.include_router(produtos.router)
api_router.include_router(pedidos.router)
api_router.include_router(caixa.router)
api_router.include_router(configuracoes.router)
api_router.include_router(dashboard.router)
api_router.include_router(logs.router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Include the router in the main app — must stay the last statement.
app.include_router(api_router)
