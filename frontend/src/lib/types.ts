// Hand-written mirrors of backend/models/schemas.py — keep both sides in sync.

export type Role = "DEV" | "ADMIN" | "ATENDENTE";
export type StatusMesa = "LIVRE" | "OCUPADA" | "RESERVADA" | "MANUTENCAO";
export type StatusPedido = "ABERTO" | "PAGO" | "CANCELADO";
export type FormaPagamento = "DINHEIRO" | "PIX" | "CREDITO" | "DEBITO";
export type TipoMovimento = "ENTRADA" | "SAIDA";

export interface Usuario {
  id: number;
  nome: string;
  usuario: string;
  role: Role;
  tema: string;
  ativo: boolean;
  fotoUrl: string | null;
  criadoEm: string;
}

export interface LoginOut {
  token: string;
  user: Usuario;
}

export interface Mesa {
  id: number;
  numero: number;
  status: StatusMesa;
  capacidade: number | null;
  observacao: string | null;
  criadoEm: string;
}

export interface Produto {
  id: number;
  nome: string;
  descricao: string | null;
  preco: number;
  categoria: string;
  imagemUrl: string | null;
  ativo: boolean;
  ordem: number;
  criadoEm: string;
}

export interface ItemPedido {
  produtoId: number;
  produtoNome: string;
  quantidade: number;
  precoUnit: number;
  observacao: string | null;
  subtotal: number;
}

export interface Pagamento {
  forma: FormaPagamento;
  valor: number;
  troco: number | null;
  pagoEm: string;
}

export interface Pedido {
  id: number;
  numeroComanda: string;
  clienteNome: string | null;
  mesaId: number | null;
  mesaNumero: number | null;
  atendenteId: number;
  atendenteNome: string;
  status: StatusPedido;
  observacao: string | null;
  canceladoMotivo: string | null;
  itens: ItemPedido[];
  total: number;
  pagamento: Pagamento | null;
  criadoEm: string;
}

export interface Comanda {
  numeroComanda: string;
  estabelecimento: string;
  clienteNome: string | null;
  mesaNumero: number | null;
  atendenteNome: string;
  itens: ItemPedido[];
  total: number;
  status: StatusPedido;
  criadoEm: string;
  pagamento: Pagamento | null;
}

export interface CaixaMovimento {
  id: number;
  tipo: TipoMovimento;
  valor: number;
  descricao: string;
  categoria: string | null;
  usuarioId: number | null;
  criadoEm: string;
}

export interface CaixaResumo {
  data: string;
  entradas: number;
  saidas: number;
  saldo: number;
  pedidosPagos: number;
}

export interface DiaRelatorio {
  data: string;
  faturamento: number;
  pedidos: number;
}

export interface ProdutoRanking {
  produtoNome: string;
  quantidade: number;
  total: number;
}

// "Bebidas" inclui as categorias "caldo" (caldo de cana) e "bebida".
export interface GrupoVendas {
  grupo: string;
  quantidade: number;
  valor: number;
}

export interface VendaProduto {
  produtoId: number;
  produtoNome: string;
  categoria: string;
  grupo: string;
  quantidade: number;
  valor: number;
}

export interface VendasPorCategoria {
  dataInicio: string;
  dataFim: string;
  grupos: GrupoVendas[];
  produtos: VendaProduto[];
  quantidadeTotal: number;
  valorTotal: number;
}

export interface FormaTotal {
  forma: string;
  valor: number;
  quantidade: number;
}

export interface Relatorio {
  dataInicio: string;
  dataFim: string;
  totalFaturado: number;
  qtdPedidos: number;
  ticketMedio: number;
  porDia: DiaRelatorio[];
  ranking: ProdutoRanking[];
  formasPagamento: FormaTotal[];
  formaMaisUsada: string | null;
  grupos: GrupoVendas[];
}

export interface Configuracao {
  chave: string;
  valor: string;
}

export interface LogAtividade {
  id: number;
  usuarioId: number;
  usuarioNome: string;
  acao: string;
  detalhes: string | null;
  criadoEm: string;
}

export interface DashboardAtendente {
  mesasOcupadas: number;
  mesasLivres: number;
  pedidosAbertos: number;
  totalVendidoHoje: number;
  ultimosPedidos: Pedido[];
}

export interface DashboardAdmin {
  faturamentoHoje: number;
  faturamentoSemana: number;
  faturamentoMes: number;
  pedidosHoje: number;
  ticketMedio: number;
  mesasOcupadas: number;
  atendentesAtivos: number;
  ultimos7Dias: DiaRelatorio[];
  maisVendidos: ProdutoRanking[];
}

export interface RoleContagem {
  role: string;
  total: number;
}

export interface DashboardDev {
  porRole: RoleContagem[];
  totalPedidos: number;
  totalUsuarios: number;
  proximaComanda: string;
  logsRecentes: LogAtividade[];
}

export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export const ROLE_LABEL: Record<Role, string> = {
  DEV: "Desenvolvedor",
  ADMIN: "Administrador",
  ATENDENTE: "Atendente",
};

export const MESA_LABEL: Record<StatusMesa, string> = {
  LIVRE: "Livre",
  OCUPADA: "Ocupada",
  RESERVADA: "Reservada",
  MANUTENCAO: "Manutenção",
};

export const MESA_COR: Record<StatusMesa, string> = {
  LIVRE: "border-[#16a34a] bg-[#16a34a]/10 text-[#15803d] dark:text-[#4ade80]",
  OCUPADA: "border-[#dc2626] bg-[#dc2626]/10 text-[#b91c1c] dark:text-[#f87171]",
  RESERVADA: "border-[#eab308] bg-[#eab308]/10 text-[#a16207] dark:text-[#facc15]",
  MANUTENCAO: "border-[#64748b] bg-[#64748b]/10 text-[#475569] dark:text-[#cbd5e1]",
};

export const FORMA_LABEL: Record<FormaPagamento, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "Pix",
  CREDITO: "Crédito",
  DEBITO: "Débito",
};

export const CATEGORIA_LABEL: Record<string, string> = {
  caldo: "Caldos",
  pastel: "Pastéis",
  bebida: "Bebidas",
  outro: "Outros",
};
