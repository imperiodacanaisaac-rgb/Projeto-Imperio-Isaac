import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { buttonVariants } from "@/components/ui/button";
import { ErroAviso, KpiCard, Loading, StatusBadge, VazioAviso } from "@/components/Comuns";
import { useAuth } from "@/context/AuthContext";
import { apiGet } from "@/lib/api";
import {
  brl,
  dataHora,
  MESA_COR,
  MESA_LABEL,
  type DashboardAdmin,
  type DashboardAtendente,
  type DashboardDev,
  type Mesa,
} from "@/lib/types";

export default function Dashboard() {
  const { user } = useAuth();
  if (user?.role === "ADMIN") return <PainelAdmin />;
  if (user?.role === "DEV") return <PainelDev />;
  return <PainelAtendente />;
}

function Titulo({ texto, sub }: { texto: string; sub: string }) {
  return (
    <div>
      <h1 className="font-heading text-2xl font-bold" data-testid="pagina-titulo">
        {texto}
      </h1>
      <p className="text-sm text-muted-foreground">{sub}</p>
    </div>
  );
}

function PainelAtendente() {
  const dash = useQuery({
    queryKey: ["dashboard", "atendente"],
    queryFn: () => apiGet<DashboardAtendente>("/dashboard/atendente"),
  });
  const mesas = useQuery({ queryKey: ["mesas"], queryFn: () => apiGet<Mesa[]>("/mesas") });

  return (
    <div className="space-y-6" data-testid="dashboard-atendente">
      <Titulo texto="Painel do Atendente" sub="Situação do salão agora." />
      {dash.isError && <ErroAviso texto="Não foi possível carregar os indicadores." />}
      {dash.isLoading && <Loading />}
      {dash.data && !dash.isError && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              titulo="Mesas ocupadas"
              valor={String(dash.data.mesasOcupadas)}
              detalhe={`${dash.data.mesasLivres} livres`}
              testId="kpi-mesas-ocupadas"
              destaque="verde"
            />
            <KpiCard
              titulo="Mesas livres"
              valor={String(dash.data.mesasLivres)}
              testId="kpi-mesas-livres"
            />
            <KpiCard
              titulo="Pedidos abertos"
              valor={String(dash.data.pedidosAbertos)}
              testId="kpi-pedidos-abertos"
              destaque="dourado"
            />
            <KpiCard
              titulo="Vendido hoje"
              valor={brl(dash.data.totalVendidoHoje)}
              testId="kpi-vendido-hoje"
              destaque="verde"
            />
          </div>

          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-heading text-lg font-bold">Meus últimos pedidos</h2>
            {dash.data.ultimosPedidos.length === 0 ? (
              <VazioAviso texto="Nenhum pedido registrado ainda." testId="vazio-ultimos-pedidos" />
            ) : (
              <ul className="mt-3 divide-y divide-border" data-testid="lista-ultimos-pedidos">
                {dash.data.ultimosPedidos.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                    <span className="font-mono text-sm font-bold">{p.numeroComanda}</span>
                    <span className="text-sm text-muted-foreground">
                      {p.clienteNome || "Sem cliente"} ·{" "}
                      {p.mesaNumero ? `Mesa ${p.mesaNumero}` : "Balcão"}
                    </span>
                    <StatusBadge status={p.status} />
                    <span className="ml-auto text-sm font-bold">{brl(p.total)}</span>
                    <Link
                      to={`/pedidos?comanda=${p.numeroComanda}`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                      data-testid={`link-ver-pedido-${p.id}`}
                    >
                      Ver
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold">Mesas</h2>
          <Link
            to="/mesas"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
            data-testid="link-gerenciar-mesas"
          >
            Gerenciar
          </Link>
        </div>
        {mesas.isLoading && <Loading />}
        {mesas.data && (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {mesas.data.map((m) => (
              <div
                key={m.id}
                className={`rounded-lg border-2 p-3 ${MESA_COR[m.status]}`}
                data-testid={`dashboard-mesa-${m.numero}`}
              >
                <p className="font-heading text-lg font-extrabold">Mesa {m.numero}</p>
                <p className="text-xs font-semibold">{MESA_LABEL[m.status]}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PainelAdmin() {
  const dash = useQuery({
    queryKey: ["dashboard", "admin"],
    queryFn: () => apiGet<DashboardAdmin>("/dashboard/admin"),
  });

  return (
    <div className="space-y-6" data-testid="dashboard-admin">
      <Titulo texto="Painel do Administrador" sub="Faturamento e desempenho do negócio." />
      {dash.isError && <ErroAviso texto="Não foi possível carregar os indicadores." />}
      {dash.isLoading && <Loading />}
      {dash.data && !dash.isError && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              titulo="Faturamento hoje"
              valor={brl(dash.data.faturamentoHoje)}
              testId="kpi-faturamento-hoje"
              destaque="verde"
            />
            <KpiCard
              titulo="Faturamento do mês"
              valor={brl(dash.data.faturamentoMes)}
              testId="kpi-faturamento-mes"
              destaque="dourado"
            />
            <KpiCard
              titulo="Ticket médio"
              valor={brl(dash.data.ticketMedio)}
              testId="kpi-ticket-medio"
            />
            <KpiCard
              titulo="Pedidos hoje"
              valor={String(dash.data.pedidosHoje)}
              detalhe={`${dash.data.mesasOcupadas} mesas ocupadas · ${dash.data.atendentesAtivos} atendentes`}
              testId="kpi-pedidos-hoje"
            />
          </div>

          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-heading text-lg font-bold">Faturamento — últimos 7 dias</h2>
            <div className="mt-4 h-64" data-testid="grafico-faturamento-7-dias">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dash.data.ultimos7Dias}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="data"
                    tickFormatter={(v: string) => v.slice(8) + "/" + v.slice(5, 7)}
                    fontSize={12}
                  />
                  <YAxis fontSize={12} />
                  <Tooltip
                    formatter={(v) => brl(Number(v))}
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }}
                  />
                  <Bar dataKey="faturamento" fill="#16a34a" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-heading text-lg font-bold">Produtos mais vendidos (mês)</h2>
            {dash.data.maisVendidos.length === 0 ? (
              <VazioAviso texto="Nenhuma venda registrada no mês." />
            ) : (
              <ul className="mt-3 divide-y divide-border" data-testid="lista-mais-vendidos">
                {dash.data.maisVendidos.map((p) => (
                  <li key={p.produtoNome} className="flex items-center justify-between py-2.5">
                    <span className="text-sm font-semibold">{p.produtoNome}</span>
                    <span className="text-sm text-muted-foreground">
                      {p.quantidade} un · {brl(p.total)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function PainelDev() {
  const dash = useQuery({
    queryKey: ["dashboard", "dev"],
    queryFn: () => apiGet<DashboardDev>("/dashboard/dev"),
  });

  return (
    <div className="space-y-6" data-testid="dashboard-dev">
      <Titulo texto="Painel do Desenvolvedor" sub="Estado do sistema e atividade recente." />
      {dash.isError && <ErroAviso texto="Não foi possível carregar os indicadores." />}
      {dash.isLoading && <Loading />}
      {dash.data && !dash.isError && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {dash.data.porRole.map((r) => (
              <KpiCard
                key={r.role}
                titulo={`Usuários ${r.role}`}
                valor={String(r.total)}
                testId={`kpi-usuarios-${r.role.toLowerCase()}`}
                destaque={r.role === "DEV" ? "dourado" : "verde"}
              />
            ))}
            <KpiCard
              titulo="Total de pedidos"
              valor={String(dash.data.totalPedidos)}
              detalhe={`Próxima comanda: ${dash.data.proximaComanda}`}
              testId="kpi-total-pedidos"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              to="/configuracoes"
              className={buttonVariants({ variant: "default" })}
              data-testid="atalho-configuracoes"
            >
              Configurações do Sistema
            </Link>
            <Link
              to="/logs"
              className={buttonVariants({ variant: "outline" })}
              data-testid="atalho-logs"
            >
              Ver todos os logs
            </Link>
          </div>

          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-heading text-lg font-bold">Atividade recente</h2>
            {dash.data.logsRecentes.length === 0 ? (
              <VazioAviso texto="Nenhuma atividade registrada." />
            ) : (
              <ul className="mt-3 divide-y divide-border" data-testid="feed-logs-recentes">
                {dash.data.logsRecentes.map((l) => (
                  <li key={l.id} className="py-2.5 text-sm">
                    <span className="font-mono text-xs text-muted-foreground">
                      {dataHora(l.criadoEm)}
                    </span>{" "}
                    <strong>{l.usuarioNome}</strong> — {l.acao}
                    {l.detalhes ? `: ${l.detalhes}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
