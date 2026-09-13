import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErroAviso, KpiCard, Loading, VazioAviso } from "@/components/Comuns";
import { apiGet } from "@/lib/api";
import {
  brl,
  FORMA_LABEL,
  type FormaPagamento,
  type Produto,
  type Relatorio,
  type VendasPorCategoria,
} from "@/lib/types";

const CORES = ["#16a34a", "#facc15", "#0ea5e9", "#f97316"];

export default function Relatorios() {
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [grupoFiltro, setGrupoFiltro] = useState("TODOS");
  const [produtoFiltro, setProdutoFiltro] = useState("TODOS");

  const query = new URLSearchParams();
  if (dataInicio) query.set("dataInicio", dataInicio);
  if (dataFim) query.set("dataFim", dataFim);

  const rel = useQuery({
    queryKey: ["relatorio", query.toString()],
    queryFn: () => apiGet<Relatorio>(`/caixa/relatorio?${query.toString()}`),
  });

  const queryVendas = new URLSearchParams(query);
  if (grupoFiltro !== "TODOS") queryVendas.set("grupo", grupoFiltro);
  if (produtoFiltro !== "TODOS") queryVendas.set("produtoId", produtoFiltro);

  const vendas = useQuery({
    queryKey: ["vendas-categorias", queryVendas.toString()],
    queryFn: () =>
      apiGet<VendasPorCategoria>(`/caixa/vendas-categorias?${queryVendas.toString()}`),
  });

  const produtos = useQuery({
    queryKey: ["produtos"],
    queryFn: () => apiGet<Produto[]>("/produtos"),
  });

  // "Bebidas" engloba caldo de cana ("caldo") e demais bebidas ("bebida").
  const produtosDoGrupo = (produtos.data ?? []).filter((p) => {
    if (grupoFiltro === "Bebidas") return p.categoria === "caldo" || p.categoria === "bebida";
    if (grupoFiltro === "Pastéis") return p.categoria === "pastel";
    if (grupoFiltro === "Outros") return p.categoria === "outro";
    return true;
  });

  const totalGrupo = (nome: string) =>
    (vendas.data?.grupos ?? []).find((g) => g.grupo === nome);

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
      [],
      ["Categoria", "Quantidade", "Valor"],
      ...(vendas.data?.grupos ?? []).map((g) => [
        g.grupo,
        String(g.quantidade),
        g.valor.toFixed(2),
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
          <section
            className="space-y-4 rounded-xl border border-border bg-card p-5"
            data-testid="secao-vendas-categorias"
          >
            <div>
              <h2 className="font-heading text-lg font-bold">Vendas do período por categoria</h2>
              <p className="text-xs text-muted-foreground">
                O caldo de cana é contabilizado em <strong>Bebidas</strong>.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div
                className="rounded-lg border-2 border-[#facc15] bg-[#facc15]/10 p-4"
                data-testid="bloco-pasteis"
              >
                <p className="text-xs font-bold uppercase tracking-wider text-[#a16207] dark:text-[#facc15]">
                  Pastéis
                </p>
                <p
                  className="mt-1 font-heading text-3xl font-extrabold"
                  data-testid="pasteis-quantidade"
                >
                  {totalGrupo("Pastéis")?.quantidade ?? 0}
                  <span className="ml-1 text-sm font-semibold text-muted-foreground">un</span>
                </p>
                <p className="mt-1 text-sm font-bold" data-testid="pasteis-valor">
                  {brl(totalGrupo("Pastéis")?.valor ?? 0)}
                </p>
              </div>

              <div
                className="rounded-lg border-2 border-[#16a34a] bg-[#16a34a]/10 p-4"
                data-testid="bloco-bebidas"
              >
                <p className="text-xs font-bold uppercase tracking-wider text-[#15803d] dark:text-[#4ade80]">
                  Bebidas (inclui caldo de cana)
                </p>
                <p
                  className="mt-1 font-heading text-3xl font-extrabold"
                  data-testid="bebidas-quantidade"
                >
                  {totalGrupo("Bebidas")?.quantidade ?? 0}
                  <span className="ml-1 text-sm font-semibold text-muted-foreground">un</span>
                </p>
                <p className="mt-1 text-sm font-bold" data-testid="bebidas-valor">
                  {brl(totalGrupo("Bebidas")?.valor ?? 0)}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select
                  value={grupoFiltro}
                  onValueChange={(v: string) => {
                    setGrupoFiltro(v);
                    setProdutoFiltro("TODOS");
                  }}
                >
                  <SelectTrigger data-testid="filtro-grupo-vendas">
                    <SelectValue>
                      {(v) => (v === "TODOS" ? "Todas as categorias" : (v as string))}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODOS" data-testid="opcao-grupo-todos">
                      Todas as categorias
                    </SelectItem>
                    <SelectItem value="Pastéis" data-testid="opcao-grupo-pasteis">
                      Pastéis
                    </SelectItem>
                    <SelectItem value="Bebidas" data-testid="opcao-grupo-bebidas">
                      Bebidas
                    </SelectItem>
                    <SelectItem value="Outros" data-testid="opcao-grupo-outros">
                      Outros
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Produto específico</Label>
                <Select value={produtoFiltro} onValueChange={(v: string) => setProdutoFiltro(v)}>
                  <SelectTrigger data-testid="filtro-produto-vendas">
                    <SelectValue>
                      {(v) =>
                        v === "TODOS"
                          ? "Todos os produtos"
                          : (produtos.data?.find((p) => String(p.id) === v)?.nome ?? (v as string))
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODOS" data-testid="opcao-produto-todos">
                      Todos os produtos
                    </SelectItem>
                    {produtosDoGrupo.map((p) => (
                      <SelectItem
                        key={p.id}
                        value={String(p.id)}
                        data-testid={`opcao-produto-${p.id}`}
                      >
                        {p.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {vendas.isLoading && <Loading />}
            {vendas.data && vendas.data.produtos.length === 0 && (
              <VazioAviso
                texto="Nenhuma venda encontrada para este filtro no período."
                testId="vendas-categorias-vazio"
              />
            )}
            {vendas.data && vendas.data.produtos.length > 0 && (
              <>
                <Table data-testid="tabela-vendas-categorias">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendas.data.produtos.map((v) => (
                      <TableRow key={v.produtoId} data-testid={`venda-produto-${v.produtoId}`}>
                        <TableCell className="text-sm font-semibold">{v.produtoNome}</TableCell>
                        <TableCell className="text-xs">{v.grupo}</TableCell>
                        <TableCell className="text-right font-mono">{v.quantidade}</TableCell>
                        <TableCell className="text-right font-mono">{brl(v.valor)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-3 text-sm">
                  <span className="text-muted-foreground">
                    Período: {vendas.data.dataInicio} a {vendas.data.dataFim}
                  </span>
                  <span className="font-bold" data-testid="vendas-filtro-totais">
                    {vendas.data.quantidadeTotal} un · {brl(vendas.data.valorTotal)}
                  </span>
                </div>
              </>
            )}
          </section>

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
                        {pizza.map((fatia, i) => (
                          <Cell key={fatia.name} fill={CORES[i % CORES.length]} />
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
