import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DoorOpen, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErroAviso, Loading, StatusBadge } from "@/components/Comuns";
import { apiDelete, apiGet, apiPatch, apiPost, mensagemErro } from "@/lib/api";
import {
  brl,
  MESA_COR,
  MESA_LABEL,
  type Mesa,
  type Pedido,
  type StatusMesa,
} from "@/lib/types";

const STATUS: StatusMesa[] = ["LIVRE", "OCUPADA", "RESERVADA", "MANUTENCAO"];

export default function Mesas() {
  const qc = useQueryClient();
  const [novaAberta, setNovaAberta] = useState(false);
  const [numero, setNumero] = useState("");
  const [capacidade, setCapacidade] = useState("");
  const [detalhe, setDetalhe] = useState<Mesa | null>(null);

  const mesas = useQuery({ queryKey: ["mesas"], queryFn: () => apiGet<Mesa[]>("/mesas") });

  const pedidosMesa = useQuery({
    queryKey: ["pedidos", "mesa", detalhe?.id],
    queryFn: () => apiGet<Pedido[]>(`/pedidos?mesaId=${detalhe?.id}&status=ABERTO`),
    enabled: !!detalhe,
  });

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["mesas"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const criar = useMutation({
    mutationFn: (body: { numero: number; capacidade: number | null }) =>
      apiPost<Mesa>("/mesas", body),
    onSuccess: () => {
      toast.success("Mesa criada com sucesso");
      setNovaAberta(false);
      setNumero("");
      setCapacidade("");
      invalidar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const mudarStatus = useMutation({
    mutationFn: (v: { id: number; status: StatusMesa }) =>
      apiPatch<Mesa>(`/mesas/${v.id}/status`, { status: v.status }),
    onSuccess: () => {
      toast.success("Status da mesa atualizado");
      invalidar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const excluir = useMutation({
    mutationFn: (id: number) => apiDelete<{ mensagem: string }>(`/mesas/${id}`),
    onSuccess: () => {
      toast.success("Mesa excluída");
      setDetalhe(null);
      invalidar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const liberar = useMutation({
    mutationFn: (id: number) => apiPatch<Mesa>(`/mesas/${id}/liberar`, {}),
    onSuccess: (m) => {
      toast.success(`Mesa ${m.numero} liberada`);
      setDetalhe(m);
      invalidar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <div className="space-y-6" data-testid="pagina-mesas">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold" data-testid="pagina-titulo">
            Mesas
          </h1>
          <p className="text-sm text-muted-foreground">
            Verde = livre · Vermelho = ocupada · Amarelo = reservada · Cinza = manutenção
          </p>
        </div>
        <Button
          onClick={() => setNovaAberta(true)}
          className="active:scale-95"
          data-testid="botao-nova-mesa"
        >
          <Plus className="mr-1.5 size-4" /> Nova Mesa
        </Button>
      </div>

      {mesas.isError && <ErroAviso texto="Não foi possível carregar as mesas." />}
      {mesas.isLoading && <Loading />}

      {mesas.data && !mesas.isError && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" data-testid="grade-mesas">
          {mesas.data.map((m) => (
            <button
              key={m.id}
              onClick={() => setDetalhe(m)}
              className={`rounded-xl border-2 p-4 text-left transition-transform duration-150 hover:-translate-y-0.5 active:scale-95 ${MESA_COR[m.status]}`}
              data-testid={`mesa-card-${m.numero}`}
            >
              <p className="font-heading text-2xl font-extrabold">Mesa {m.numero}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-wide">
                {MESA_LABEL[m.status]}
              </p>
              {m.capacidade && (
                <p className="mt-1 text-xs opacity-80">{m.capacidade} lugares</p>
              )}
            </button>
          ))}
        </div>
      )}

      <Dialog open={novaAberta} onOpenChange={setNovaAberta}>
        <DialogContent data-testid="modal-nova-mesa">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl font-bold">Nova Mesa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mesa-numero">Número da mesa *</Label>
              <Input
                id="mesa-numero"
                type="number"
                min={1}
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                data-testid="input-mesa-numero"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mesa-capacidade">Capacidade (opcional)</Label>
              <Input
                id="mesa-capacidade"
                type="number"
                min={1}
                value={capacidade}
                onChange={(e) => setCapacidade(e.target.value)}
                data-testid="input-mesa-capacidade"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovaAberta(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!numero || criar.isPending}
              onClick={() =>
                criar.mutate({
                  numero: Number(numero),
                  capacidade: capacidade ? Number(capacidade) : null,
                })
              }
              data-testid="botao-salvar-mesa"
            >
              {criar.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detalhe} onOpenChange={(v) => !v && setDetalhe(null)}>
        <DialogContent data-testid="modal-detalhe-mesa">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl font-bold">
              Mesa {detalhe?.numero}
            </DialogTitle>
          </DialogHeader>
          {detalhe && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Status da mesa</Label>
                <Select
                  value={detalhe.status}
                  onValueChange={(v: string) =>
                    mudarStatus.mutate({ id: detalhe.id, status: v as StatusMesa })
                  }
                >
                  <SelectTrigger data-testid="select-status-mesa">
                    <SelectValue>{(v) => MESA_LABEL[v as StatusMesa]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS.map((s) => (
                      <SelectItem key={s} value={s} data-testid={`opcao-status-${s.toLowerCase()}`}>
                        {MESA_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <p className="text-sm font-semibold">Pedidos em aberto</p>
                {pedidosMesa.isLoading && <Loading texto="Buscando pedidos..." />}
                {pedidosMesa.data && pedidosMesa.data.length === 0 && (
                  <p className="py-2 text-sm text-muted-foreground" data-testid="mesa-sem-pedidos">
                    Nenhum pedido em aberto nesta mesa.
                  </p>
                )}
                <ul className="divide-y divide-border" data-testid="mesa-pedidos-lista">
                  {pedidosMesa.data?.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 py-2 text-sm">
                      <span className="font-mono font-bold">{p.numeroComanda}</span>
                      <StatusBadge status={p.status} />
                      <span className="ml-auto font-bold">{brl(p.total)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">
                  O pagamento <strong>não libera</strong> a mesa: o cliente pode continuar sentado
                  e fazer novos pedidos. Libere a mesa manualmente quando ele for embora.
                </p>
                <Button
                  className="mt-3 w-full active:scale-95"
                  disabled={detalhe.status === "LIVRE" || liberar.isPending}
                  onClick={() => liberar.mutate(detalhe.id)}
                  data-testid="botao-liberar-mesa"
                >
                  <DoorOpen className="mr-1.5 size-4" />
                  {liberar.isPending
                    ? "Liberando..."
                    : detalhe.status === "LIVRE"
                      ? "Mesa já está livre"
                      : "Liberar mesa"}
                </Button>
              </div>

              <Button
                variant="destructive"
                className="w-full active:scale-95"
                disabled={excluir.isPending}
                onClick={() => {
                  if (window.confirm(`Excluir a Mesa ${detalhe.numero}? Esta ação é permanente.`)) {
                    excluir.mutate(detalhe.id);
                  }
                }}
                data-testid="botao-excluir-mesa"
              >
                <Trash2 className="mr-1.5 size-4" />
                {excluir.isPending ? "Excluindo..." : "Excluir mesa"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
