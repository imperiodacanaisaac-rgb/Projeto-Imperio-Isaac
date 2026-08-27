import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CreditCard,
  Moon,
  Palette,
  ShoppingCart,
  Table2,
  UserPlus,
  XCircle,
} from "lucide-react";
import type { Role } from "@/lib/types";

const PASSOS = [
  {
    icone: ShoppingCart,
    titulo: "1. Registrar um novo pedido",
    texto:
      'Menu "Novo Pedido" → informe o cliente (opcional), escolha a mesa ou "Balcão", toque em "+" nos produtos, confira o carrinho e clique em "Finalizar Pedido". A comanda é gerada automaticamente.',
  },
  {
    icone: Table2,
    titulo: "2. Criar uma mesa",
    texto:
      'Menu "Mesas" → botão "+ Nova Mesa" → informe o número (único) e a capacidade (opcional). A mesa aparece na grade imediatamente.',
  },
  {
    icone: CreditCard,
    titulo: "3. Confirmar pagamento e ver o troco",
    texto:
      'Em "Pedidos", abra o pedido e clique em "Confirmar Pagamento". Escolha a forma; se for Dinheiro, informe o valor recebido e o troco é calculado automaticamente. A venda entra no caixa e a mesa é liberada.',
  },
  {
    icone: XCircle,
    titulo: "4. Cancelar um pedido",
    texto:
      'Abra o pedido em aberto e clique em "Cancelar Pedido". O motivo é obrigatório. A mesa é liberada se não houver outro pedido aberto nela.',
  },
  {
    icone: Moon,
    titulo: "5. Trocar tema claro/escuro",
    texto:
      "Use o ícone de lua/sol na barra superior. A escolha fica salva no seu perfil e continua após recarregar a página.",
  },
];

const CORES = [
  { cor: "#16a34a", label: "Livre", texto: "Mesa disponível para novos pedidos" },
  { cor: "#dc2626", label: "Ocupada", texto: "Existe pedido em aberto vinculado" },
  { cor: "#eab308", label: "Reservada", texto: "Reserva manual feita pelo atendente" },
  { cor: "#64748b", label: "Manutenção", texto: "Mesa indisponível temporariamente" },
];

const EXTRA: Record<Role, { icone: typeof Palette; titulo: string; texto: string } | null> = {
  DEV: {
    icone: Palette,
    titulo: "Extra (Desenvolvedor): máscara da comanda",
    texto:
      'Em "Configurações", altere a máscara (ex.: "###", "P-###", "A###B"). O preview mostra o próximo número. Só o Desenvolvedor pode alterar ou resetar o contador.',
  },
  ADMIN: {
    icone: UserPlus,
    titulo: "Extra (Administrador): cadastrar funcionário",
    texto:
      'Em "Funcionários", clique em "+ Novo Funcionário", informe nome, usuário e senha (mín. 6 caracteres). Administradores só podem criar Atendentes.',
  },
  ATENDENTE: null,
};

export function GuiaRapido({
  aberto,
  onFechar,
  role,
}: {
  aberto: boolean;
  onFechar: () => void;
  role: Role;
}) {
  const extra = EXTRA[role];
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
        data-testid="guia-rapido-modal"
      >
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl font-bold">Guia Rápido</DialogTitle>
          <DialogDescription>Como usar o sistema no dia a dia do balcão.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {PASSOS.map((p) => (
            <div key={p.titulo} className="flex gap-3 rounded-lg border border-border p-3">
              <p.icone className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <p className="font-heading text-sm font-bold">{p.titulo}</p>
                <p className="mt-1 text-sm text-muted-foreground">{p.texto}</p>
              </div>
            </div>
          ))}

          <div className="rounded-lg border border-border p-3">
            <p className="font-heading text-sm font-bold">6. Cores de status das mesas</p>
            <ul className="mt-2 space-y-1.5">
              {CORES.map((c) => (
                <li key={c.label} className="flex items-center gap-2 text-sm">
                  <span
                    className="size-3.5 shrink-0 rounded-full"
                    style={{ backgroundColor: c.cor }}
                  />
                  <strong>{c.label}:</strong>
                  <span className="text-muted-foreground">{c.texto}</span>
                </li>
              ))}
            </ul>
          </div>

          {extra && (
            <div className="flex gap-3 rounded-lg border border-[#facc15] bg-[#facc15]/10 p-3">
              <extra.icone className="mt-0.5 size-5 shrink-0 text-[#a16207]" />
              <div>
                <p className="font-heading text-sm font-bold">{extra.titulo}</p>
                <p className="mt-1 text-sm text-muted-foreground">{extra.texto}</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
