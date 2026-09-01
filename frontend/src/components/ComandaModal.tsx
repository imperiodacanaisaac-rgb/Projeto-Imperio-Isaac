import { useState } from "react";
import { Bluetooth, Loader2, Printer, Usb } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { brl, dataHora, FORMA_LABEL } from "@/lib/types";
import type { Pedido } from "@/lib/types";
import {
  detectarSuporte,
  imprimirBluetooth,
  imprimirPeloSistema,
  imprimirUsb,
  type DadosComanda,
} from "@/lib/impressao";

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
  const [escolhendo, setEscolhendo] = useState(false);
  const [enviando, setEnviando] = useState<"bluetooth" | "usb" | null>(null);
  const suporte = detectarSuporte();

  if (!pedido) return null;

  const dados: DadosComanda = {
    estabelecimento,
    numeroComanda: pedido.numeroComanda,
    clienteNome: pedido.clienteNome,
    mesaNumero: pedido.mesaNumero,
    atendenteNome: pedido.atendenteNome,
    criadoEm: pedido.criadoEm,
    itens: pedido.itens.map((i) => ({
      quantidade: i.quantidade,
      produtoNome: i.produtoNome,
      observacao: i.observacao,
      subtotal: i.subtotal,
    })),
    total: pedido.total,
    formaPagamento: pedido.pagamento ? FORMA_LABEL[pedido.pagamento.forma] : null,
    troco: pedido.pagamento?.troco ?? null,
  };

  async function enviar(via: "bluetooth" | "usb") {
    setEnviando(via);
    try {
      const nome = via === "bluetooth" ? await imprimirBluetooth(dados) : await imprimirUsb(dados);
      toast.success(`Comanda enviada para ${nome}`);
      setEscolhendo(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao enviar para a impressora";
      if (/cancelled|cancelado|No device selected/i.test(msg)) {
        toast.info("Nenhum dispositivo selecionado");
      } else {
        toast.error(msg);
      }
    } finally {
      setEnviando(null);
    }
  }

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

        {!escolhendo ? (
          <div className="no-print flex gap-2">
            <Button
              className="flex-1 active:scale-95"
              onClick={() => setEscolhendo(true)}
              data-testid="botao-imprimir-comanda"
            >
              <Printer className="mr-1.5 size-4" /> Imprimir
            </Button>
            <Button variant="outline" onClick={onFechar} data-testid="botao-fechar-comanda">
              Fechar
            </Button>
          </div>
        ) : (
          <div className="no-print space-y-2" data-testid="seletor-impressora">
            <p className="text-sm font-semibold">Selecionar impressora (58 mm)</p>

            <Button
              variant="outline"
              className="w-full justify-start"
              disabled={!suporte.bluetooth || enviando !== null}
              onClick={() => enviar("bluetooth")}
              data-testid="botao-imprimir-bluetooth"
            >
              {enviando === "bluetooth" ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Bluetooth className="mr-1.5 size-4" />
              )}
              Impressora Bluetooth (ESC/POS)
            </Button>

            <Button
              variant="outline"
              className="w-full justify-start"
              disabled={!suporte.usb || enviando !== null}
              onClick={() => enviar("usb")}
              data-testid="botao-imprimir-usb"
            >
              {enviando === "usb" ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Usb className="mr-1.5 size-4" />
              )}
              Impressora USB (ESC/POS)
            </Button>

            <Button
              className="w-full justify-start"
              disabled={enviando !== null}
              onClick={() => {
                imprimirPeloSistema();
                setEscolhendo(false);
              }}
              data-testid="botao-imprimir-sistema"
            >
              <Printer className="mr-1.5 size-4" /> Imprimir pelo sistema (58 mm)
            </Button>

            {(!suporte.bluetooth || !suporte.usb) && (
              <p
                className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground"
                data-testid="aviso-suporte-impressao"
              >
                {!suporte.contextoSeguro
                  ? "Bluetooth e USB exigem conexão segura (HTTPS)."
                  : "Seu navegador não oferece " +
                    [!suporte.bluetooth && "Bluetooth", !suporte.usb && "USB"]
                      .filter(Boolean)
                      .join(" nem ") +
                    " para impressão direta. Use Chrome no Android ou no computador, ou imprima pelo sistema."}
              </p>
            )}

            <Button
              variant="ghost"
              className="w-full"
              disabled={enviando !== null}
              onClick={() => setEscolhendo(false)}
              data-testid="botao-voltar-impressao"
            >
              Voltar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
