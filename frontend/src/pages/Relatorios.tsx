import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErroAviso, KpiCard, Loading, VazioAviso } from "@/components/Comuns";
import { apiGet } from "@/lib/api";
import { brl, FORMA_LABEL, type FormaPagamento, type Relatorio } from "@/lib/types";

const CORES = ["#16a34a", "#facc15", "#0ea5e9", "#f97316"];

export default function Relatorios() {
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const query = new URLSearchParams();
  if (dataInicio) query.set("dataInicio", dataInicio);
  if (dataFim) query.set("dataFim", dataFim);

  const rel = useQuery({
    queryKey: ["relatorio", query.toString()],
    queryFn: () => apiGet<Relatorio>(`/caixa/relatorio?${query.toString()}`),
  });

  function exportarCsv() {
    if (!rel.data) return;
    const linhas = [
      ["Data", "Faturamento", "Pedidos"],
      ...rel.data.porDia.map((d) => [d.data, d.faturamento.toFixed(2), String(d.pedidos)]),
      [],
      ["Produto", "Quantidade", "Total"],
      ...rel.data.ranking.map((r) => [
        r.produtoNome,
        String(r.quantidade),
        r.total.toFixed(2),
      ]),
    ];
    const csv = linhas.map((l) => l.join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-${rel.data.dataInicio}-a-${rel.data.dataFim}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const pizza = (rel.data?.formasPagamento ?? []).map((f) => ({
    name: FORMA_LABEL[f.forma as FormaPagamento] ?? f.forma,
    value: f.valor,
  }));

  return (
    <div className="space-y-6" data-testid="pagina-relatorios">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold" data-testid="pagina-titulo">
            Relatórios
          </h1>
          <p className="text-sm text-muted-foreground">Faturamento consolidado por período.</p>
        </div>
        <Button
          variant="outline"
          onClick={exportarCsv}
          disabled={!rel.data}
          data-testid="botao-exportar-csv"
        >
          <Download className="mr-1.5 size-4" /> Exportar CSV
        </Button>
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="r-di">Data início</Label>
          <Input
            id="r-di"
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            data-testid="relatorio-data-inicio"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="r-df">Data fim</Label>
          <Input
            id="r-df"
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            data-testid="relatorio-data-fim"
          />
        </div>
      </div>

      {rel.isError && <ErroAviso texto="Não foi possível carregar o relatório." />}
      {rel.isLoading && <Loading />}

      {rel.data && !rel.isError && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              titulo="Total faturado"
              valor={brl(rel.data.totalFaturado)}
              testId="kpi-relatorio-faturado"
              destaque="verde"
            />
            <KpiCard
              titulo="Pedidos pagos"
              valor={String(rel.data.qtdPedidos)}
              testId="kpi-relatorio-pedidos"
            />
            <KpiCard
              titulo="Ticket médio"
              valor={brl(rel.data.ticketMedio)}
              testId="kpi-relatorio-ticket"
              destaque="dourado"
            />
            <KpiCard
              titulo="Forma mais usada"
              valor={
                rel.data.formaMaisUsada
                  ? (FORMA_LABEL[rel.data.formaMaisUsada as FormaPagamento] ??
                    rel.data.formaMaisUsada)
                  : "—"
              }
              testId="kpi-relatorio-forma"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-heading text-lg font-bold">Formas de pagamento</h2>
              {pizza.length === 0 ? (
                <VazioAviso texto="Nenhum pagamento no período." />
              ) : (
                <div className="mt-2 h-64" data-testid="grafico-formas-pagamento">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pizza} dataKey="value" nameKey="name" outerRadius={85} label>
                        {pizza.map((_, i) => (
                          <Cell key={i} fill={CORES[i % CORES.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => brl(Number(v))} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-heading text-lg font-bold">Produtos mais vendidos</h2>
              {rel.data.ranking.length === 0 ? (
                <VazioAviso texto="Nenhuma venda no período." />
              ) : (
                <Table data-testid="tabela-ranking">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rel.data.ranking.map((r) => (
                      <TableRow key={r.produtoNome}>
                        <TableCell className="text-sm font-semibold">{r.produtoNome}</TableCell>
                        <TableCell className="text-right font-mono">{r.quantidade}</TableCell>
                        <TableCell className="text-right font-mono">{brl(r.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>
          </div>

          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-heading text-lg font-bold">Consolidado por dia</h2>
            <Table data-testid="tabela-por-dia">
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Pedidos</TableHead>
                  <TableHead className="text-right">Faturamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rel.data.porDia.map((d) => (
                  <TableRow key={d.data}>
                    <TableCell className="text-sm">{d.data}</TableCell>
                    <TableCell className="text-right font-mono">{d.pedidos}</TableCell>
                    <TableCell className="text-right font-mono">{brl(d.faturamento)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        </>
      )}
    </div>
  );
}
