"""Pydantic v2 request/response models. Mirrored by frontend/src/lib/types.ts."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

Role = Literal["DEV", "ADMIN", "ATENDENTE"]
StatusMesa = Literal["LIVRE", "OCUPADA", "RESERVADA", "MANUTENCAO"]
StatusPedido = Literal["ABERTO", "PAGO", "CANCELADO"]
FormaPagamento = Literal["DINHEIRO", "PIX", "CREDITO", "DEBITO"]
TipoMovimento = Literal["ENTRADA", "SAIDA"]


# ---------- auth / usuarios ----------
class LoginIn(BaseModel):
    usuario: str
    senha: str


class Usuario(BaseModel):
    id: int
    nome: str
    usuario: str
    role: Role
    tema: str = "claro"
    ativo: bool = True
    fotoUrl: Optional[str] = None
    criadoEm: datetime


class LoginOut(BaseModel):
    token: str
    user: Usuario


class UsuarioCreate(BaseModel):
    nome: str = Field(min_length=1)
    usuario: str = Field(min_length=3)
    senha: str = Field(min_length=6)
    role: Role


class UsuarioUpdate(BaseModel):
    nome: Optional[str] = None
    usuario: Optional[str] = None


class SenhaUpdate(BaseModel):
    senhaAtual: Optional[str] = None
    novaSenha: str = Field(min_length=6)


class TemaUpdate(BaseModel):
    tema: Literal["claro", "escuro"]


class StatusUpdate(BaseModel):
    ativo: bool


# ---------- mesas ----------
class Mesa(BaseModel):
    id: int
    numero: int
    status: StatusMesa = "LIVRE"
    capacidade: Optional[int] = None
    observacao: Optional[str] = None
    criadoEm: datetime


class MesaCreate(BaseModel):
    numero: int = Field(ge=1)
    capacidade: Optional[int] = Field(default=None, ge=1)
    observacao: Optional[str] = None


class MesaUpdate(BaseModel):
    numero: Optional[int] = Field(default=None, ge=1)
    capacidade: Optional[int] = Field(default=None, ge=1)
    observacao: Optional[str] = None


class MesaStatusUpdate(BaseModel):
    status: StatusMesa


class ContaMesa(BaseModel):
    """Conta única da mesa: soma de todas as comandas ABERTAS."""

    mesaId: int
    mesaNumero: int
    status: StatusMesa
    qtdComandas: int
    comandas: list[str]
    pedidoIds: list[int]
    total: float
    pessoas: int = 1
    valorPorPessoa: float


class ContaPagamentoIn(BaseModel):
    forma: FormaPagamento
    valorRecebido: Optional[float] = None
    pessoas: int = Field(default=1, ge=1)


# ---------- produtos ----------
class Produto(BaseModel):
    id: int
    nome: str
    descricao: Optional[str] = None
    preco: float
    categoria: str
    imagemUrl: Optional[str] = None
    ativo: bool = True
    ordem: int = 0
    criadoEm: datetime


class ProdutoCreate(BaseModel):
    nome: str = Field(min_length=1)
    descricao: Optional[str] = None
    preco: float = Field(ge=0.01)
    categoria: Literal["caldo", "pastel", "bebida", "outro"]
    imagemUrl: Optional[str] = None
    ordem: int = 0


class ProdutoUpdate(BaseModel):
    nome: Optional[str] = None
    descricao: Optional[str] = None
    preco: Optional[float] = Field(default=None, ge=0.01)
    categoria: Optional[Literal["caldo", "pastel", "bebida", "outro"]] = None
    imagemUrl: Optional[str] = None
    ordem: Optional[int] = None


# ---------- pedidos ----------
class ItemIn(BaseModel):
    produtoId: int
    quantidade: int = Field(ge=1)
    observacao: Optional[str] = None


class PedidoCreate(BaseModel):
    clienteNome: Optional[str] = None
    mesaId: Optional[int] = None
    observacao: Optional[str] = None
    itens: list[ItemIn] = Field(min_length=1)


class PedidoUpdate(BaseModel):
    clienteNome: Optional[str] = None
    observacao: Optional[str] = None
    itens: list[ItemIn] = Field(min_length=1)


class ItemPedido(BaseModel):
    produtoId: int
    produtoNome: str
    quantidade: int
    precoUnit: float
    observacao: Optional[str] = None
    subtotal: float


class Pagamento(BaseModel):
    forma: FormaPagamento
    valor: float
    troco: Optional[float] = None
    pagoEm: datetime


class ItensAdd(BaseModel):
    """Soma itens a uma comanda já aberta, sem criar outro pedido."""

    itens: list[ItemIn] = Field(min_length=1)


class Pedido(BaseModel):
    id: int
    numeroComanda: str
    diaComanda: Optional[str] = None
    clienteNome: Optional[str] = None
    mesaId: Optional[int] = None
    mesaNumero: Optional[int] = None
    atendenteId: int
    atendenteNome: str
    status: StatusPedido
    observacao: Optional[str] = None
    canceladoMotivo: Optional[str] = None
    itens: list[ItemPedido]
    total: float
    pagamento: Optional[Pagamento] = None
    criadoEm: datetime


class CancelarIn(BaseModel):
    motivo: str = Field(min_length=3)


class PagamentoIn(BaseModel):
    forma: FormaPagamento
    valorRecebido: Optional[float] = None


class Comanda(BaseModel):
    numeroComanda: str
    estabelecimento: str
    clienteNome: Optional[str] = None
    mesaNumero: Optional[int] = None
    atendenteNome: str
    itens: list[ItemPedido]
    total: float
    status: StatusPedido
    criadoEm: datetime
    pagamento: Optional[Pagamento] = None


# ---------- caixa ----------
class CaixaMovimento(BaseModel):
    id: int
    tipo: TipoMovimento
    valor: float
    descricao: str
    categoria: Optional[str] = None
    usuarioId: Optional[int] = None
    criadoEm: datetime


class MovimentoCreate(BaseModel):
    tipo: TipoMovimento
    valor: float = Field(ge=0.01)
    descricao: str = Field(min_length=1)
    categoria: Optional[str] = None


class CaixaResumo(BaseModel):
    data: str
    entradas: float
    saidas: float
    saldo: float
    pedidosPagos: int


class DiaRelatorio(BaseModel):
    data: str
    faturamento: float
    pedidos: int


class ProdutoRanking(BaseModel):
    produtoNome: str
    quantidade: float
    total: float


# Agrupamento de vendas por grupo de categoria.
# "Bebidas" inclui as categorias "caldo" (caldo de cana) e "bebida".
class GrupoVendas(BaseModel):
    grupo: str
    quantidade: float
    valor: float


class VendaProduto(BaseModel):
    produtoId: int
    produtoNome: str
    categoria: str
    grupo: str
    quantidade: float
    valor: float


class VendasPorCategoria(BaseModel):
    dataInicio: str
    dataFim: str
    grupos: list[GrupoVendas]
    produtos: list[VendaProduto]
    quantidadeTotal: float
    valorTotal: float


class FormaTotal(BaseModel):
    forma: str
    valor: float
    quantidade: int


class Relatorio(BaseModel):
    dataInicio: str
    dataFim: str
    totalFaturado: float
    qtdPedidos: int
    ticketMedio: float
    porDia: list[DiaRelatorio]
    ranking: list[ProdutoRanking]
    formasPagamento: list[FormaTotal]
    formaMaisUsada: Optional[str] = None
    grupos: list[GrupoVendas] = []


# ---------- configuracoes / logs / dashboards ----------
class Configuracao(BaseModel):
    chave: str
    valor: str


class ConfigUpdate(BaseModel):
    valor: str


class ResetContador(BaseModel):
    confirmar: bool


class LogAtividade(BaseModel):
    id: int
    usuarioId: int
    usuarioNome: str
    acao: str
    detalhes: Optional[str] = None
    criadoEm: datetime


class DashboardAtendente(BaseModel):
    mesasOcupadas: int
    mesasLivres: int
    pedidosAbertos: int
    totalVendidoHoje: float
    ultimosPedidos: list[Pedido]


class DashboardAdmin(BaseModel):
    faturamentoHoje: float
    faturamentoSemana: float
    faturamentoMes: float
    pedidosHoje: int
    ticketMedio: float
    mesasOcupadas: int
    atendentesAtivos: int
    ultimos7Dias: list[DiaRelatorio]
    maisVendidos: list[ProdutoRanking]


class RoleContagem(BaseModel):
    role: str
    total: int


class DashboardDev(BaseModel):
    porRole: list[RoleContagem]
    totalPedidos: int
    totalUsuarios: int
    proximaComanda: str
    logsRecentes: list[LogAtividade]
