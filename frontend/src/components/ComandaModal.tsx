import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { brl, dataHora, FORMA_LABEL } from "@/lib/types";
import type { Pedido } from "@/lib/types";

export function ComandaModal({
  pedido,
  estabelecimento,
  aberto,
  onFechar,
}: {
  pedido: Pedido | null;
  estabelecimento: string;
  aberto: boolean;
  onFechar: () => void;
}) {
  if (!pedido) return null;
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="sm:max-w-sm" data-testid="comanda-modal">
        <DialogHeader className="no-print">
          <DialogTitle className="font-heading text-xl font-bold">
            Comanda {pedido.numeroComanda}
          </DialogTitle>
        </DialogHeader>

        <div
          className="comanda-paper comanda-print animate-paper-feed rounded-md border border-dashed border-[#a8a29e] p-4 text-[13px]"
          data-testid="comanda-conteudo"
        >
          <p className="text-center font-bold uppercase tracking-widest">{estabelecimento}</p>
          <p className="mt-1 text-center text-[11px]">Caldo de cana &amp; pastel</p>
          <p className="my-2 border-y border-dashed border-[#a8a29e] py-1 text-center text-base font-bold">
            COMANDA {pedido.numeroComanda}
          </p>
          <p>Cliente: {pedido.clienteNome || "Não informado"}</p>
          <p>Mesa: {pedido.mesaNumero ? `Mesa ${pedido.mesaNumero}` : "Balcão"}</p>
          <p>Atendente: {pedido.atendenteNome}</p>
          <p>Data: {dataHora(pedido.criadoEm)}</p>
          <div className="my-2 border-t border-dashed border-[#a8a29e]" />
          {pedido.itens.map((it, idx) => (
            <div key={`${it.produtoId}-${idx}`} className="flex justify-between gap-2">
              <span>
                {it.quantidade}x {it.produtoNome}
                {it.observacao ? ` (${it.observacao})` : ""}
              </span>
              <span>{brl(it.subtotal)}</span>
            </div>
          ))}
          <div className="my-2 border-t border-dashed border-[#a8a29e]" />
          <div className="flex justify-between text-base font-bold">
            <span>TOTAL</span>
            <span data-testid="comanda-total">{brl(pedido.total)}</span>
          </div>
          {pedido.pagamento && (
            <div className="mt-2 text-[12px]">
              <p>Pagamento: {FORMA_LABEL[pedido.pagamento.forma]}</p>
              {pedido.pagamento.troco !== null && pedido.pagamento.troco > 0 && (
                <p>Troco: {brl(pedido.pagamento.troco)}</p>
              )}
            </div>
          )}
          <p className="mt-3 text-center text-[11px]">Obrigado pela preferência!</p>
        </div>

        <div className="no-print flex gap-2">
          <Button
            className="flex-1 active:scale-95"
            onClick={() => window.print()}
            data-testid="botao-imprimir-comanda"
          >
            <Printer className="mr-1.5 size-4" /> Imprimir
          </Button>
          <Button variant="outline" onClick={onFechar} data-testid="botao-fechar-comanda">
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
