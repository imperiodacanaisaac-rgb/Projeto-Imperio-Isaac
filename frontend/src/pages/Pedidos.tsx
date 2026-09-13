import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ComandaModal } from "@/components/ComandaModal";
import { ErroAviso, Loading, StatusBadge, VazioAviso } from "@/components/Comuns";
import { useAuth } from "@/context/AuthContext";
import { apiGet, apiPatch, apiPost, mensagemErro } from "@/lib/api";import { brl, dataHora, FORMA_LABEL, type FormaPagamento, type Pedido, type Produto } from "@/lib/types";

const FORMAS: FormaPagamento[] = ["DINHEIRO", "PIX", "CREDITO", "DEBITO"];
const STATUS_FILTRO = ["TODOS", "ABERTO", "PAGO", "CANCELADO"];
const STATUS_LABEL: Record<string, string> = {
  TODOS: "Todos os status",
  ABERTO: "Aberto",
  PAGO: "Pago",
  CANCELADO: "Cancelado",
};

export default function Pedidos() {
  const qc = useQueryClient();
  const { config } = useAuth();
  const [params] = useSearchParams();
  const [status, setStatus] = useState("TODOS");
  const [busca, setBusca] = useState(params.get("comanda") ?? "");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [detalhe, setDetalhe] = useState<Pedido | null>(null);
  const [pagando, setPagando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [adicionando, setAdicionando] = useState(false);
  const [extras, setExtras] = useState<Record<number, number>>({});
  const [comanda, setComanda] = useState<Pedido | null>(null);
  const [forma, setForma] = useState<FormaPagamento>("DINHEIRO");
  const [recebido, setRecebido] = useState("");
  const [motivo, setMotivo] = useState("");

  const query = new URLSearchParams();
  if (status !== "TODOS") query.set("status", status);
  if (busca.trim()) query.set("numeroComanda", busca.trim());
  if (dataInicio) query.set("dataInicio", dataInicio);
  if (dataFim) query.set("dataFim", dataFim);

  const pedidos = useQuery({
    queryKey: ["pedidos", query.toString()],
    queryFn: () => apiGet<Pedido[]>(`/pedidos?${query.toString()}`),
  });

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["pedidos"] });
    qc.invalidateQueries({ queryKey: ["mesas"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["caixa"] });
  };

  const troco =
    forma === "DINHEIRO" && detalhe && Number(recebido) > detalhe.total
      ? Number(recebido) - detalhe.total
      : 0;

  const pagar = useMutation({
    mutationFn: () =>
      apiPost<Pedido>(`/pedidos/${detalhe?.id}/pagamento`, {
        forma,
        valorRecebido: forma === "DINHEIRO" && recebido ? Number(recebido) : null,
      }),
    onSuccess: (p) => {
      toast.success(
        p.pagamento?.troco ? `Pagamento confirmado. Troco: ${brl(p.pagamento.troco)}` : "Pagamento confirmado",
      );
      setPagando(false);
      setRecebido("");
      setDetalhe(p);
      invalidar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const cancelar = useMutation({
    mutationFn: () => apiPatch<Pedido>(`/pedidos/${detalhe?.id}/cancelar`, { motivo }),
    onSuccess: (p) => {
      toast.success("Pedido cancelado");
      setCancelando(false);
      setMotivo("");
      setDetalhe(p);
      invalidar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const produtosAtivos = useQuery({
    queryKey: ["produtos", "ativos"],
    queryFn: () => apiGet<Produto[]>("/produtos?ativo=true"),
    enabled: adicionando,
  });

  const totalExtras = Object.entries(extras).reduce((s, [id, qtd]) => {
    const prod = produtosAtivos.data?.find((p) => p.id === Number(id));
    return s + (prod ? prod.preco * qtd : 0);
  }, 0);

  const adicionarItens = useMutation({
    mutationFn: () =>
      apiPost<Pedido>(`/pedidos/${detalhe?.id}/itens`, {
        itens: Object.entries(extras)
          .filter(([, qtd]) => qtd > 0)
          .map(([id, qtd]) => ({ produtoId: Number(id), quantidade: qtd })),
      }),
    onSuccess: (p) => {
      toast.success(`Itens somados à comanda ${p.numeroComanda}`);
      setAdicionando(false);
      setExtras({});
      setDetalhe(p);
      invalidar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <div className="space-y-6" data-testid="pagina-pedidos">
      <div>
        <h1 className="font-heading text-2xl font-bold" data-testid="pagina-titulo">
          Pedidos
        </h1>
        <p className="text-sm text-muted-foreground">Comandas registradas no estabelecimento.</p>
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v: string) => setStatus(v)}>
            <SelectTrigger data-testid="filtro-status">
              <SelectValue>{(v) => STATUS_LABEL[v as string]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTRO.map((s) => (
                <SelectItem key={s} value={s} data-testid={`filtro-status-${s.toLowerCase()}`}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="busca">Buscar comanda</Label>
          <Input
            id="busca"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="ex.: 001"
            data-testid="filtro-busca-comanda"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="di">Data início</Label>
          <Input
            id="di"
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            data-testid="filtro-data-inicio"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="df">Data fim</Label>
          <Input
            id="df"
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            data-testid="filtro-data-fim"
          />
        </div>
      </div>

      {pedidos.isError && <ErroAviso texto="Não foi possível carregar os pedidos." />}
      {pedidos.isLoading && <Loading />}

      {pedidos.data && !pedidos.isError && (
        <>
          {pedidos.data.length === 0 ? (
            <div className="rounded-xl border border-border bg-card">
              <VazioAviso
                texto="Nenhum pedido encontrado com estes filtros."
                testId="pedidos-vazio"
              />
            </div>
          ) : (
            <>
              {/* Mobile: cards empilhados, sem scroll horizontal */}
              <div className="space-y-3 md:hidden" data-testid="cards-pedidos-mobile">
                {pedidos.data.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-xl border border-border bg-card p-4"
                    data-testid={`card-pedido-${p.numeroComanda}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-base font-bold">{p.numeroComanda}</span>
                      <StatusBadge status={p.status} />
                      <span className="ml-auto font-heading text-lg font-extrabold">
                        {brl(p.total)}
                      </span>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                      <div>
                        <dt className="text-muted-foreground">Cliente</dt>
                        <dd className="font-semibold">{p.clienteNome || "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Mesa</dt>
                        <dd className="font-semibold">
                          {p.mesaNumero ? `Mesa ${p.mesaNumero}` : "Balcão"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Data/Hora</dt>
                        <dd className="font-semibold">{dataHora(p.criadoEm)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Atendente</dt>
                        <dd className="font-semibold">{p.atendenteNome}</dd>
                      </div>
                    </dl>
                    <Button
                      className="mt-3 h-11 w-full active:scale-95"
                      variant="outline"
                      onClick={() => setDetalhe(p)}
                      data-testid={`botao-detalhe-mobile-${p.numeroComanda}`}
                    >
                      Detalhes
                    </Button>
                  </div>
                ))}
              </div>

              {/* Desktop/tablet: tabela original preservada */}
              <div className="hidden rounded-xl border border-border bg-card md:block">
                <Table data-testid="tabela-pedidos">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Comanda</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Mesa</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Atendente</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pedidos.data.map((p) => (
                      <TableRow key={p.id} data-testid={`linha-pedido-${p.numeroComanda}`}>
                        <TableCell className="font-mono font-bold">{p.numeroComanda}</TableCell>
                        <TableCell>{p.clienteNome || "—"}</TableCell>
                        <TableCell>{p.mesaNumero ? `Mesa ${p.mesaNumero}` : "Balcão"}</TableCell>
                        <TableCell className="font-bold">{brl(p.total)}</TableCell>
                        <TableCell>
                          <StatusBadge status={p.status} />
                        </TableCell>
                        <TableCell className="text-xs">{dataHora(p.criadoEm)}</TableCell>
                        <TableCell className="text-xs">{p.atendenteNome}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDetalhe(p)}
                            data-testid={`botao-detalhe-${p.numeroComanda}`}
                          >
                            Detalhes
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </>
      )}

      <Dialog open={!!detalhe && !pagando && !cancelando && !adicionando} onOpenChange={(v) => !v && setDetalhe(null)}>
        <DialogContent
          className="max-h-[90dvh] overflow-y-auto overscroll-contain"
          data-testid="modal-detalhe-pedido"
        >
          <DialogHeader>
            <DialogTitle className="font-heading text-xl font-bold">
              Comanda {detalhe?.numeroComanda}
            </DialogTitle>
          </DialogHeader>
          {detalhe && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <StatusBadge status={detalhe.status} />
                <span className="text-muted-foreground">
                  {detalhe.clienteNome || "Sem cliente"} ·{" "}
                  {detalhe.mesaNumero ? `Mesa ${detalhe.mesaNumero}` : "Balcão"} ·{" "}
                  {detalhe.atendenteNome}
                </span>
              </div>
              <ul className="divide-y divide-border">
                {detalhe.itens.map((it) => (
                  <li
                    key={`${it.produtoId}-${it.observacao ?? ""}`}
                    className="flex justify-between py-2 text-sm"
                  >
                    <span>
                      {it.quantidade}x {it.produtoNome}
                    </span>
                    <span className="font-mono">{brl(it.subtotal)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between border-t border-border pt-3">
                <span className="font-semibold">Total</span>
                <span className="font-heading text-xl font-extrabold" data-testid="detalhe-total">
                  {brl(detalhe.total)}
                </span>
              </div>
              {detalhe.pagamento && (
                <p className="text-sm text-muted-foreground" data-testid="detalhe-pagamento">
                  Pago via {FORMA_LABEL[detalhe.pagamento.forma]}
                  {detalhe.pagamento.troco ? ` · Troco ${brl(detalhe.pagamento.troco)}` : ""}
                </p>
              )}
              {detalhe.canceladoMotivo && (
                <p className="text-sm text-destructive">Motivo: {detalhe.canceladoMotivo}</p>
              )}

              <div className="flex flex-wrap gap-2">
                {detalhe.status === "ABERTO" && (
                  <>
                    <Button
                      className="active:scale-95"
                      onClick={() => setPagando(true)}
                      data-testid="botao-confirmar-pagamento"
                    >
                      Confirmar Pagamento
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setAdicionando(true)}
                      data-testid="botao-adicionar-itens"
                    >
                      <Plus className="mr-1.5 size-4" /> Adicionar itens
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => setCancelando(true)}
                      data-testid="botao-cancelar-pedido"
                    >
                      Cancelar Pedido
                    </Button>
                  </>
                )}
                <Button
                  variant="outline"
                  onClick={() => setComanda(detalhe)}
                  data-testid="botao-ver-comanda"
                >
                  Ver/Imprimir Comanda
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={pagando} onOpenChange={(v) => !v && setPagando(false)}>
        <DialogContent data-testid="modal-pagamento">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl font-bold">
              Pagamento — {brl(detalhe?.total ?? 0)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Forma de pagamento</Label>
              <Select value={forma} onValueChange={(v: string) => setForma(v as FormaPagamento)}>
                <SelectTrigger data-testid="select-forma-pagamento">
                  <SelectValue>{(v) => FORMA_LABEL[v as FormaPagamento]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {FORMAS.map((f) => (
                    <SelectItem key={f} value={f} data-testid={`opcao-forma-${f.toLowerCase()}`}>
                      {FORMA_LABEL[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {forma === "DINHEIRO" && (
              <div className="space-y-2">
                <Label htmlFor="recebido">Valor recebido</Label>
                <Input
                  id="recebido"
                  type="number"
                  step="0.01"
                  min={0}
                  value={recebido}
                  onChange={(e) => setRecebido(e.target.value)}
                  placeholder={String(detalhe?.total ?? 0)}
                  data-testid="input-valor-recebido"
                />
                <p className="text-sm font-semibold text-primary" data-testid="troco-calculado">
                  Troco: {brl(troco)}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPagando(false)}>
              Voltar
            </Button>
            <Button
              disabled={pagar.isPending}
              onClick={() => pagar.mutate()}
              data-testid="botao-confirmar-pagamento-modal"
            >
              {pagar.isPending ? "Confirmando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelando} onOpenChange={(v) => !v && setCancelando(false)}>
        <DialogContent data-testid="modal-cancelar">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl font-bold">Cancelar Pedido</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo">Motivo do cancelamento *</Label>
            <Textarea
              id="motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              data-testid="input-motivo-cancelamento"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelando(false)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              disabled={motivo.trim().length < 3 || cancelar.isPending}
              onClick={() => cancelar.mutate()}
              data-testid="botao-confirmar-cancelamento"
            >
              {cancelar.isPending ? "Cancelando..." : "Confirmar cancelamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={adicionando} onOpenChange={(v) => !v && setAdicionando(false)}>
        <DialogContent
          className="max-h-[90dvh] overflow-y-auto overscroll-contain"
          data-testid="modal-adicionar-itens"
        >
          <DialogHeader>
            <DialogTitle className="font-heading text-xl font-bold">
              Somar itens à comanda {detalhe?.numeroComanda}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Os itens são somados à comanda já aberta — não é criado outro pedido.
            </p>
            {produtosAtivos.isLoading && <Loading />}
            {produtosAtivos.data?.length === 0 && (
              <VazioAviso texto="Nenhum produto ativo no cardápio." />
            )}
            <ul className="divide-y divide-border">
              {produtosAtivos.data?.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 py-2.5"
                  data-testid={`extra-produto-${p.id}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{p.nome}</span>
                    <span className="text-xs text-muted-foreground">{brl(p.preco)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Button
                      size="icon-xs"
                      variant="outline"
                      disabled={!extras[p.id]}
                      onClick={() =>
                        setExtras((a) => ({ ...a, [p.id]: Math.max(0, (a[p.id] ?? 0) - 1) }))
                      }
                      data-testid={`extra-menos-${p.id}`}
                    >
                      <Minus className="size-3" />
                    </Button>
                    <span
                      className="w-6 text-center font-mono text-sm font-bold"
                      data-testid={`extra-qtd-${p.id}`}
                    >
                      {extras[p.id] ?? 0}
                    </span>
                    <Button
                      size="icon-xs"
                      variant="outline"
                      onClick={() => setExtras((a) => ({ ...a, [p.id]: (a[p.id] ?? 0) + 1 }))}
                      data-testid={`extra-mais-${p.id}`}
                    >
                      <Plus className="size-3" />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-sm font-semibold text-muted-foreground">A somar</span>
              <span className="font-heading text-xl font-extrabold" data-testid="extras-total">
                {brl(totalExtras)}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAdicionando(false);
                setExtras({});
              }}
            >
              Voltar
            </Button>
            <Button
              disabled={totalExtras <= 0 || adicionarItens.isPending}
              onClick={() => adicionarItens.mutate()}
              data-testid="botao-confirmar-adicionar-itens"
            >
              {adicionarItens.isPending ? "Somando..." : "Somar à comanda"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ComandaModal
        pedido={comanda}
        estabelecimento={config.nomeEstabelecimento || "Império Da Cana"}
        aberto={!!comanda}
        onFechar={() => setComanda(null)}
      />
    </div>
  );
}
