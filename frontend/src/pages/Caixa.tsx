import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErroAviso, KpiCard, Loading, VazioAviso } from "@/components/Comuns";
import { apiGet, apiPost, mensagemErro } from "@/lib/api";
import { brl, dataHora, type CaixaMovimento, type CaixaResumo, type Relatorio } from "@/lib/types";

const CATEGORIAS = ["despesa", "sangria", "suprimento"];
const CATEGORIA_LABEL: Record<string, string> = {
  despesa: "Despesa",
  sangria: "Sangria",
  suprimento: "Suprimento",
};

export default function Caixa() {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState("despesa");
  const [filtroTipo, setFiltroTipo] = useState("TODOS");

  const resumo = useQuery({
    queryKey: ["caixa", "resumo"],
    queryFn: () => apiGet<CaixaResumo>("/caixa/resumo"),
  });

  const movimentos = useQuery({
    queryKey: ["caixa", "movimentos", filtroTipo],
    queryFn: () =>
      apiGet<CaixaMovimento[]>(
        `/caixa/movimentos${filtroTipo === "TODOS" ? "" : `?tipo=${filtroTipo}`}`,
      ),
  });

  const relatorio = useQuery({
    queryKey: ["caixa", "relatorio", "7dias"],
    queryFn: () => apiGet<Relatorio>("/caixa/relatorio"),
  });

  const lancar = useMutation({
    mutationFn: () =>
      apiPost<CaixaMovimento>("/caixa/movimentos", {
        tipo: "SAIDA",
        valor: Number(valor),
        descricao: descricao.trim(),
        categoria,
      }),
    onSuccess: () => {
      toast.success("Saída lançada no caixa");
      setAberto(false);
      setValor("");
      setDescricao("");
      qc.invalidateQueries({ queryKey: ["caixa"] });
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const dadosGrafico = (relatorio.data?.porDia ?? []).map((d) => ({
    data: d.data.slice(8) + "/" + d.data.slice(5, 7),
    entradas: d.faturamento,
  }));

  return (
    <div className="space-y-6" data-testid="pagina-caixa">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold" data-testid="pagina-titulo">
            Caixa
          </h1>
          <p className="text-sm text-muted-foreground">Entradas de vendas e saídas manuais.</p>
        </div>
        <Button onClick={() => setAberto(true)} className="active:scale-95" data-testid="botao-lancar-saida">
          <Plus className="mr-1.5 size-4" /> Lançar Saída
        </Button>
      </div>

      {resumo.isError && <ErroAviso texto="Não foi possível carregar o resumo do caixa." />}
      {resumo.isLoading && <Loading />}
      {resumo.data && !resumo.isError && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            titulo="Entradas do dia"
            valor={brl(resumo.data.entradas)}
            testId="kpi-caixa-entradas"
            destaque="verde"
          />
          <KpiCard titulo="Saídas do dia" valor={brl(resumo.data.saidas)} testId="kpi-caixa-saidas" />
          <KpiCard
            titulo="Saldo do dia"
            valor={brl(resumo.data.saldo)}
            testId="kpi-caixa-saldo"
            destaque="dourado"
          />
          <KpiCard
            titulo="Pedidos pagos"
            valor={String(resumo.data.pedidosPagos)}
            testId="kpi-caixa-pedidos-pagos"
          />
        </div>
      )}

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-heading text-lg font-bold">Entradas por dia (7 dias)</h2>
        <div className="mt-4 h-56" data-testid="grafico-caixa">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dadosGrafico}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="data" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip
                formatter={(v) => brl(Number(v))}
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }}
              />
              <Legend />
              <Bar dataKey="entradas" name="Entradas" fill="#16a34a" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-52 space-y-1.5">
            <Label>Filtrar por tipo</Label>
            <Select value={filtroTipo} onValueChange={(v: string) => setFiltroTipo(v)}>
              <SelectTrigger data-testid="filtro-tipo-movimento">
                <SelectValue>
                  {(v) =>
                    v === "TODOS" ? "Todos" : v === "ENTRADA" ? "Entradas" : "Saídas"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos</SelectItem>
                <SelectItem value="ENTRADA">Entradas</SelectItem>
                <SelectItem value="SAIDA">Saídas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card">
          {movimentos.isLoading && <Loading />}
          {movimentos.data && movimentos.data.length === 0 && (
            <VazioAviso texto="Nenhum movimento registrado." testId="caixa-vazio" />
          )}
          {movimentos.data && movimentos.data.length > 0 && (
            <Table data-testid="tabela-movimentos">
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movimentos.data.map((m) => (
                  <TableRow key={m.id} data-testid={`linha-movimento-${m.id}`}>
                    <TableCell className="text-xs">{dataHora(m.criadoEm)}</TableCell>
                    <TableCell>
                      <span
                        className={`text-xs font-bold ${m.tipo === "ENTRADA" ? "text-primary" : "text-destructive"}`}
                      >
                        {m.tipo === "ENTRADA" ? "Entrada" : "Saída"}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{m.descricao}</TableCell>
                    <TableCell className="text-xs">{m.categoria ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono font-bold">
                      {brl(m.valor)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent data-testid="modal-lancar-saida">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl font-bold">Lançar Saída</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="c-valor">Valor * (mín. R$ 0,01)</Label>
              <Input
                id="c-valor"
                type="number"
                step="0.01"
                min="0.01"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                data-testid="input-saida-valor"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-desc">Descrição *</Label>
              <Input
                id="c-desc"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                data-testid="input-saida-descricao"
              />
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={categoria} onValueChange={(v: string) => setCategoria(v)}>
                <SelectTrigger data-testid="select-saida-categoria">
                  <SelectValue>{(v) => CATEGORIA_LABEL[v as string]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((c) => (
                    <SelectItem key={c} value={c} data-testid={`opcao-cat-${c}`}>
                      {CATEGORIA_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button
              disabled={Number(valor) < 0.01 || !descricao.trim() || lancar.isPending}
              onClick={() => lancar.mutate()}
              data-testid="botao-salvar-saida"
            >
              {lancar.isPending ? "Lançando..." : "Lançar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
