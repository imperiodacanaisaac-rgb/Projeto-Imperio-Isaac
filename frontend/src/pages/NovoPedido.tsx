import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ComandaModal } from "@/components/ComandaModal";
import { ErroAviso, Loading } from "@/components/Comuns";
import { useAuth } from "@/context/AuthContext";
import { apiGet, apiPost, mensagemErro } from "@/lib/api";
import { brl, CATEGORIA_LABEL, type Mesa, type Pedido, type Produto } from "@/lib/types";
import { iconePadraoCategoria, trocarPorPlaceholder } from "@/lib/iconesProdutos";

interface LinhaCarrinho {
  produtoId: number;
  nome: string;
  preco: number;
  quantidade: number;
}

const CATEGORIAS = ["caldo", "pastel", "bebida", "outro"];

export default function NovoPedido() {
  const qc = useQueryClient();
  const { config } = useAuth();
  const [cliente, setCliente] = useState("");
  const [mesaId, setMesaId] = useState("balcao");
  const [observacao, setObservacao] = useState("");
  const [carrinho, setCarrinho] = useState<LinhaCarrinho[]>([]);
  const [criado, setCriado] = useState<Pedido | null>(null);

  const produtos = useQuery({
    queryKey: ["produtos", "ativos"],
    queryFn: () => apiGet<Produto[]>("/produtos?ativo=true"),
  });
  const mesas = useQuery({ queryKey: ["mesas"], queryFn: () => apiGet<Mesa[]>("/mesas") });

  const total = useMemo(
    () => carrinho.reduce((s, l) => s + l.preco * l.quantidade, 0),
    [carrinho],
  );

  const mesasDisponiveis = (mesas.data ?? []).filter((m) => m.status !== "MANUTENCAO");
  const rotuloMesa = (v: string) =>
    v === "balcao"
      ? "Sem mesa / Balcão"
      : `Mesa ${mesasDisponiveis.find((m) => String(m.id) === v)?.numero ?? v}`;

  function adicionar(p: Produto) {
    setCarrinho((atual) => {
      const existe = atual.find((l) => l.produtoId === p.id);
      if (existe) {
        return atual.map((l) =>
          l.produtoId === p.id ? { ...l, quantidade: l.quantidade + 1 } : l,
        );
      }
      return [...atual, { produtoId: p.id, nome: p.nome, preco: p.preco, quantidade: 1 }];
    });
  }

  function mudarQtd(produtoId: number, delta: number) {
    setCarrinho((atual) =>
      atual
        .map((l) => (l.produtoId === produtoId ? { ...l, quantidade: l.quantidade + delta } : l))
        .filter((l) => l.quantidade > 0),
    );
  }

  const criar = useMutation({
    mutationFn: () =>
      apiPost<Pedido>("/pedidos", {
        clienteNome: cliente.trim() || null,
        mesaId: mesaId === "balcao" ? null : Number(mesaId),
        observacao: observacao.trim() || null,
        itens: carrinho.map((l) => ({ produtoId: l.produtoId, quantidade: l.quantidade })),
      }),
    onSuccess: (pedido) => {
      toast.success(`Comanda ${pedido.numeroComanda} gerada`);
      setCriado(pedido);
      setCarrinho([]);
      setCliente("");
      setObservacao("");
      setMesaId("balcao");
      qc.invalidateQueries({ queryKey: ["mesas"] });
      qc.invalidateQueries({ queryKey: ["pedidos"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <div className="space-y-6" data-testid="pagina-novo-pedido">
      <div>
        <h1 className="font-heading text-2xl font-bold" data-testid="pagina-titulo">
          {config.textoBotaoNovoPedido || "Novo Pedido"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Monte o pedido e gere a comanda automaticamente.
        </p>
      </div>

      {produtos.isError && <ErroAviso texto="Não foi possível carregar o cardápio." />}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <div className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cliente">Cliente (opcional)</Label>
              <Input
                id="cliente"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                placeholder="Nome do cliente"
                data-testid="input-cliente-nome"
              />
            </div>
            <div className="space-y-2">
              <Label>Mesa</Label>
              <Select value={mesaId} onValueChange={(v: string) => setMesaId(v)}>
                <SelectTrigger data-testid="select-mesa">
                  <SelectValue>{(v) => rotuloMesa(v as string)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="balcao" data-testid="opcao-mesa-balcao">
                    Sem mesa / Balcão
                  </SelectItem>
                  {mesasDisponiveis.map((m) => (
                    <SelectItem
                      key={m.id}
                      value={String(m.id)}
                      data-testid={`opcao-mesa-${m.numero}`}
                    >
                      Mesa {m.numero}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="observacao">Observação do pedido (opcional)</Label>
              <Textarea
                id="observacao"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={2}
                data-testid="input-observacao-pedido"
              />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-heading text-lg font-bold">Cardápio</h2>
            {produtos.isLoading && <Loading />}
            {produtos.data && (
              <Tabs defaultValue="caldo" className="mt-3">
                <TabsList variant="line" data-testid="abas-categorias">
                  {CATEGORIAS.map((c) => (
                    <TabsTrigger key={c} value={c} data-testid={`aba-${c}`}>
                      {CATEGORIA_LABEL[c]}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {CATEGORIAS.map((c) => {
                  const lista = produtos.data.filter((p) => p.categoria === c);
                  return (
                    <TabsContent key={c} value={c} className="mt-4">
                      {lista.length === 0 ? (
                        <p className="py-6 text-sm text-muted-foreground">
                          Nenhum produto ativo nesta categoria.
                        </p>
                      ) : (
                        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                          {lista.map((p) => (
                            <button
                              key={p.id}
                              onClick={() => adicionar(p)}
                              className="flex flex-col rounded-lg border border-border p-3 text-left transition-colors duration-150 hover:border-primary hover:bg-accent/50 active:scale-95"
                              data-testid={`produto-adicionar-${p.id}`}
                            >
                              <span className="mb-2 flex items-center gap-2">
                                <img
                                  src={p.imagemUrl || iconePadraoCategoria(p.categoria)}
                                  onError={trocarPorPlaceholder}
                                  alt={p.nome}
                                  loading="lazy"
                                  className="size-10 shrink-0 rounded-md border border-border object-cover"
                                  data-testid={`cardapio-imagem-${p.id}`}
                                />
                                <span className="font-heading text-sm font-bold">{p.nome}</span>
                              </span>
                              {p.descricao && (
                                <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                  {p.descricao}
                                </span>
                              )}
                              <span className="mt-2 flex items-center justify-between">
                                <span className="font-mono text-sm font-extrabold text-primary">
                                  {brl(p.preco)}
                                </span>
                                <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                  <Plus className="size-4" />
                                </span>
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </TabsContent>
                  );
                })}
              </Tabs>
            )}
          </div>
        </div>

        <aside
          className="h-fit rounded-xl border border-border bg-card p-5 lg:sticky lg:top-20"
          data-testid="carrinho"
        >
          <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
            <ShoppingCart className="size-4" /> Carrinho
          </h2>
          {carrinho.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground" data-testid="carrinho-vazio">
              Nenhum item adicionado. Toque nos produtos do cardápio.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border" data-testid="carrinho-itens">
              {carrinho.map((l) => (
                <li
                  key={l.produtoId}
                  className="animate-cart-in py-3"
                  data-testid={`carrinho-item-${l.produtoId}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold">{l.nome}</span>
                    <button
                      onClick={() => setCarrinho((a) => a.filter((x) => x.produtoId !== l.produtoId))}
                      className="text-destructive transition-colors duration-150 hover:opacity-70"
                      aria-label="Remover item"
                      data-testid={`carrinho-remover-${l.produtoId}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        size="icon-xs"
                        variant="outline"
                        onClick={() => mudarQtd(l.produtoId, -1)}
                        data-testid={`carrinho-menos-${l.produtoId}`}
                      >
                        <Minus className="size-3" />
                      </Button>
                      <span
                        className="w-6 text-center font-mono text-sm font-bold"
                        data-testid={`carrinho-qtd-${l.produtoId}`}
                      >
                        {l.quantidade}
                      </span>
                      <Button
                        size="icon-xs"
                        variant="outline"
                        onClick={() => mudarQtd(l.produtoId, 1)}
                        data-testid={`carrinho-mais-${l.produtoId}`}
                      >
                        <Plus className="size-3" />
                      </Button>
                    </div>
                    <span className="font-mono text-sm font-bold">
                      {brl(l.preco * l.quantidade)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Total
            </span>
            <span className="font-heading text-2xl font-extrabold" data-testid="carrinho-total">
              {brl(total)}
            </span>
          </div>

          <Button
            className="mt-4 w-full active:scale-95"
            disabled={carrinho.length === 0 || criar.isPending}
            onClick={() => criar.mutate()}
            data-testid="botao-finalizar-pedido"
          >
            {criar.isPending ? "Gerando comanda..." : "Finalizar Pedido / Gerar Comanda"}
          </Button>
        </aside>
      </div>

      <ComandaModal
        pedido={criado}
        estabelecimento={config.nomeEstabelecimento || "Império Da Cana"}
        aberto={!!criado}
        onFechar={() => setCriado(null)}
      />
    </div>
  );
}
