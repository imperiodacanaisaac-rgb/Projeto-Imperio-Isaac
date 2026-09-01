import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErroAviso, Loading } from "@/components/Comuns";
import { useAuth } from "@/context/AuthContext";
import { apiGet, apiPut, mensagemErro } from "@/lib/api";
import type { Configuracao } from "@/lib/types";

function preview(mascara: string, proximo: number): string {
  const hashes = (mascara.match(/#/g) ?? []).length;
  if (hashes === 0) return "máscara inválida";
  return mascara.replace(/#+/, String(proximo).padStart(hashes, "0"));
}

export default function Configuracoes() {
  const qc = useQueryClient();
  const { recarregarConfig } = useAuth();
  const [valores, setValores] = useState<Record<string, string>>({});
  const [resetAberto, setResetAberto] = useState(false);

  const config = useQuery({
    queryKey: ["configuracoes"],
    queryFn: () => apiGet<Configuracao[]>("/configuracoes"),
  });

  const proxima = useQuery({
    queryKey: ["comanda", "proxima"],
    queryFn: () => apiGet<{ proxima: string }>("/comanda/proxima"),
  });

  useEffect(() => {
    if (config.data) {
      setValores(Object.fromEntries(config.data.map((c) => [c.chave, c.valor])));
    }
  }, [config.data]);

  const salvar = useMutation({
    mutationFn: (v: { chave: string; valor: string }) =>
      apiPut<Configuracao>(`/configuracoes/${v.chave}`, { valor: v.valor }),
    onSuccess: () => {
      toast.success("Configuração salva");
      qc.invalidateQueries({ queryKey: ["configuracoes"] });
      qc.invalidateQueries({ queryKey: ["comanda"] });
      recarregarConfig();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const resetar = useMutation({
    mutationFn: () =>
      apiPut<{ mensagem: string }>("/configuracoes/resetar-contador-comanda", {
        confirmar: true,
      }),
    onSuccess: () => {
      toast.success("Contador de comandas resetado");
      setResetAberto(false);
      qc.invalidateQueries({ queryKey: ["comanda"] });
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const mascara = valores.mascaraComanda ?? "###";
  const numeroAtual = Number((proxima.data?.proxima ?? "1").replace(/\D/g, "")) || 1;

  const campos: { chave: string; label: string; tipo?: string }[] = [
    { chave: "limiteUsuarios", label: "Limite de usuários do estabelecimento", tipo: "number" },
    { chave: "nomeEstabelecimento", label: "Nome do estabelecimento" },
    { chave: "corPrimaria", label: "Cor primária", tipo: "color" },
    { chave: "corSecundaria", label: "Cor secundária", tipo: "color" },
    { chave: "logoUrl", label: "Logo (URL)" },
    { chave: "textoBotaoNovoPedido", label: 'Texto do botão "Novo Pedido"' },
  ];

  return (
    <div className="max-w-3xl space-y-6" data-testid="pagina-configuracoes">
      <div>
        <h1 className="font-heading text-2xl font-bold" data-testid="pagina-titulo">
          Configurações do Sistema
        </h1>
        <p className="text-sm text-muted-foreground">
          Personalização visual e regras de geração de comanda (apenas Desenvolvedor).
        </p>
      </div>

      {config.isError && <ErroAviso texto="Não foi possível carregar as configurações." />}
      {config.isLoading && <Loading />}

      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h2 className="font-heading text-lg font-bold">Máscara da comanda</h2>
        <div className="space-y-2">
          <Label htmlFor="mascara">Máscara (use "#" para os dígitos)</Label>
          <Input
            id="mascara"
            value={mascara}
            onChange={(e) => setValores({ ...valores, mascaraComanda: e.target.value })}
            data-testid="input-mascara-comanda"
          />
          <p className="text-sm font-semibold text-primary" data-testid="preview-proxima-comanda">
            Próxima comanda: {preview(mascara, numeroAtual)}
          </p>
          <p className="text-xs text-muted-foreground">
            Exemplos: "###" → 007 · "P-###" → P-015 · "A###B" → A042B
          </p>
        </div>
        <Button
          className="active:scale-95"
          disabled={!mascara.includes("#") || salvar.isPending}
          onClick={() => salvar.mutate({ chave: "mascaraComanda", valor: mascara })}
          data-testid="botao-salvar-mascara"
        >
          {salvar.isPending ? "Salvando..." : "Salvar máscara"}
        </Button>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h2 className="font-heading text-lg font-bold">
          Personalização visual e limites
        </h2>
        <p className="text-xs text-muted-foreground">
          O limite de usuários é aplicado no backend quando o administrador cadastra
          funcionários. O Desenvolvedor não é limitado.
        </p>
        {campos.map((c) => (
          <div key={c.chave} className="space-y-2">
            <Label htmlFor={c.chave}>{c.label}</Label>
            <div className="flex gap-2">
              <Input
                id={c.chave}
                type={c.tipo ?? "text"}
                value={valores[c.chave] ?? ""}
                onChange={(e) => setValores({ ...valores, [c.chave]: e.target.value })}
                data-testid={`input-config-${c.chave}`}
              />
              <Button
                variant="outline"
                disabled={salvar.isPending}
                onClick={() => salvar.mutate({ chave: c.chave, valor: valores[c.chave] ?? "" })}
                data-testid={`botao-salvar-${c.chave}`}
              >
                Salvar
              </Button>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-5">
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-destructive">
          <AlertTriangle className="size-4" /> Zona de risco
        </h2>
        <p className="text-sm text-muted-foreground">
          Resetar o contador faz as próximas comandas voltarem a começar do número 1, o que pode
          gerar números repetidos no histórico impresso do dia.
        </p>
        <Button
          variant="destructive"
          onClick={() => setResetAberto(true)}
          data-testid="botao-resetar-contador"
        >
          Resetar contador de comanda
        </Button>
      </section>

      <Dialog open={resetAberto} onOpenChange={setResetAberto}>
        <DialogContent data-testid="modal-resetar-contador">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl font-bold">
              Resetar contador de comandas?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            As próximas comandas voltarão a ser numeradas a partir de 1. Esta ação é registrada nos
            logs do sistema e não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetAberto(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={resetar.isPending}
              onClick={() => resetar.mutate()}
              data-testid="botao-confirmar-reset-contador"
            >
              {resetar.isPending ? "Resetando..." : "Confirmar reset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
