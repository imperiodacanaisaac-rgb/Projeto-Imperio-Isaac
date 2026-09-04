// Impressão de comandas em impressora térmica de 58 mm.
//
// LIMITAÇÕES REAIS DO AMBIENTE (não simuladas):
// - Web Bluetooth (`navigator.bluetooth`) existe em Chrome/Edge/Opera desktop e
//   Chrome Android, sob HTTPS. NÃO existe em iOS/Safari nem em Firefox.
// - WebUSB (`navigator.usb`) tem suporte semelhante e, no Linux/Android, exige
//   que o dispositivo não esteja capturado pelo driver de impressora do sistema.
// - Quando nenhuma das duas APIs existe, o único caminho real é a impressão pelo
//   sistema operacional (`window.print`) com CSS de 58 mm.
//
// A detecção abaixo lê as APIs de verdade: se o navegador não expõe a API, a
// opção não é oferecida ao usuário.

const LARGURA_COLUNAS = 32; // 58 mm em fonte A (~32 caracteres por linha)

// ---------- tipos mínimos das APIs (evita `any` no strict mode) ----------
interface BluetoothCharacteristic {
  writeValue?: (v: BufferSource) => Promise<void>;
  writeValueWithoutResponse?: (v: BufferSource) => Promise<void>;
}
interface BluetoothService {
  getCharacteristics: () => Promise<BluetoothCharacteristic[]>;
}
interface BluetoothServer {
  getPrimaryServices: () => Promise<BluetoothService[]>;
}
interface BluetoothDeviceLike {
  name?: string;
  gatt?: { connect: () => Promise<BluetoothServer> };
}
interface BluetoothLike {
  requestDevice: (opts: {
    filters?: { services: string[] }[];
    acceptAllDevices?: boolean;
    optionalServices?: string[];
  }) => Promise<BluetoothDeviceLike>;
}
interface UsbEndpoint {
  endpointNumber: number;
  direction: string;
  type: string;
}
interface UsbAlternate {
  endpoints: UsbEndpoint[];
}
interface UsbInterface {
  interfaceNumber: number;
  alternate: UsbAlternate;
}
interface UsbConfiguration {
  interfaces: UsbInterface[];
}
interface UsbDeviceLike {
  productName?: string;
  manufacturerName?: string;
  configuration: UsbConfiguration | null;
  open: () => Promise<void>;
  selectConfiguration: (n: number) => Promise<void>;
  claimInterface: (n: number) => Promise<void>;
  transferOut: (endpoint: number, data: BufferSource) => Promise<unknown>;
  close: () => Promise<void>;
}
interface UsbLike {
  requestDevice: (opts: { filters: { classCode?: number }[] }) => Promise<UsbDeviceLike>;
}

function bluetoothApi(): BluetoothLike | null {
  const nav = navigator as unknown as { bluetooth?: BluetoothLike };
  return nav.bluetooth ?? null;
}

function usbApi(): UsbLike | null {
  const nav = navigator as unknown as { usb?: UsbLike };
  return nav.usb ?? null;
}

export interface SuporteImpressao {
  bluetooth: boolean;
  usb: boolean;
  sistema: boolean;
  contextoSeguro: boolean;
}

export function detectarSuporte(): SuporteImpressao {
  const seguro = window.isSecureContext;
  return {
    bluetooth: !!bluetoothApi() && seguro,
    usb: !!usbApi() && seguro,
    sistema: typeof window.print === "function",
    contextoSeguro: seguro,
  };
}

// ---------- geração do texto ESC/POS ----------
export interface ItemComanda {
  quantidade: number;
  produtoNome: string;
  observacao: string | null;
  subtotal: number;
}

export interface DadosComanda {
  estabelecimento: string;
  numeroComanda: string;
  clienteNome: string | null;
  mesaNumero: number | null;
  atendenteNome: string;
  criadoEm: string;
  itens: ItemComanda[];
  total: number;
  formaPagamento?: string | null;
  troco?: number | null;
}

const real = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function linhaDupla(esquerda: string, direita: string): string {
  const espaco = Math.max(1, LARGURA_COLUNAS - esquerda.length - direita.length);
  if (esquerda.length + direita.length + 1 > LARGURA_COLUNAS) {
    const corte = LARGURA_COLUNAS - direita.length - 1;
    return `${esquerda.slice(0, Math.max(0, corte))} ${direita}`;
  }
  return `${esquerda}${" ".repeat(espaco)}${direita}`;
}

function centralizar(texto: string): string {
  const pad = Math.max(0, Math.floor((LARGURA_COLUNAS - texto.length) / 2));
  return " ".repeat(pad) + texto;
}

/** Texto puro da comanda, já quebrado em 32 colunas (58 mm). */
export function montarTextoComanda(d: DadosComanda): string {
  const l: string[] = [];
  const sep = "-".repeat(LARGURA_COLUNAS);
  l.push(centralizar(d.estabelecimento.toUpperCase()));
  l.push(centralizar("Caldo de cana & pastel"));
  l.push(sep);
  l.push(centralizar(`COMANDA ${d.numeroComanda}`));
  l.push(centralizar(new Date(d.criadoEm).toLocaleDateString("pt-BR")));
  l.push(sep);
  l.push(`Cliente: ${d.clienteNome || "Nao informado"}`);
  l.push(`Mesa...: ${d.mesaNumero ? `Mesa ${d.mesaNumero}` : "Balcao"}`);
  l.push(`Atend..: ${d.atendenteNome}`);
  l.push(
    `Data...: ${new Date(d.criadoEm).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    })}`,
  );
  l.push(sep);
  for (const it of d.itens) {
    l.push(linhaDupla(`${it.quantidade}x ${it.produtoNome}`, real(it.subtotal)));
    if (it.observacao) l.push(`   obs: ${it.observacao}`);
  }
  l.push(sep);
  l.push(linhaDupla("TOTAL", `R$ ${real(d.total)}`));
  if (d.formaPagamento) l.push(`Pagamento: ${d.formaPagamento}`);
  if (d.troco != null && d.troco > 0) l.push(linhaDupla("Troco", `R$ ${real(d.troco)}`));
  l.push(sep);
  l.push(centralizar("Obrigado pela preferencia!"));
  return l.join("\n");
}

/** Bytes ESC/POS: init, texto (CP860 aproximado via ASCII), corte e avanço. */
export function montarBytesEscPos(d: DadosComanda): Uint8Array<ArrayBuffer> {
  const texto = montarTextoComanda(d)
    // impressoras térmicas simples não têm acentuação confiável
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const ESC = 0x1b;
  const GS = 0x1d;
  const inicio = [ESC, 0x40]; // inicializa
  const corpo = Array.from(new TextEncoder().encode(texto + "\n"));
  const fim = [0x0a, 0x0a, 0x0a, GS, 0x56, 0x00]; // avança e corta
  const bytes = [...inicio, ...corpo, ...fim];
  const buffer = new ArrayBuffer(bytes.length);
  const view = new Uint8Array(buffer);
  view.set(bytes);
  return view;
}

// ---------- caminho 1: Bluetooth (Web Bluetooth + ESC/POS) ----------
const SERVICOS_SERIAL = [
  "000018f0-0000-1000-8000-00805f9b34fb", // serial comum em impressoras térmicas
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
];

export async function imprimirBluetooth(d: DadosComanda): Promise<string> {
  const bt = bluetoothApi();
  if (!bt) throw new Error("Este navegador não oferece Web Bluetooth.");

  const device = await bt.requestDevice({
    acceptAllDevices: true,
    optionalServices: SERVICOS_SERIAL,
  });
  if (!device.gatt) throw new Error("O dispositivo selecionado não expõe GATT.");

  const server = await device.gatt.connect();
  const services = await server.getPrimaryServices();

  let alvo: BluetoothCharacteristic | null = null;
  for (const s of services) {
    const chars = await s.getCharacteristics().catch(() => []);
    for (const c of chars) {
      if (c.writeValue || c.writeValueWithoutResponse) {
        alvo = c;
        break;
      }
    }
    if (alvo) break;
  }
  if (!alvo) {
    throw new Error(
      "Não encontramos um canal de escrita na impressora. Verifique se ela está pareada e ligada.",
    );
  }

  const bytes = montarBytesEscPos(d);
  // impressoras térmicas costumam limitar o pacote a ~180 bytes
  const passo = 180;
  for (let i = 0; i < bytes.length; i += passo) {
    const parte = bytes.slice(i, i + passo);
    if (alvo.writeValueWithoutResponse) await alvo.writeValueWithoutResponse(parte);
    else if (alvo.writeValue) await alvo.writeValue(parte);
    await new Promise((r) => setTimeout(r, 40));
  }
  return device.name || "impressora Bluetooth";
}

// ---------- caminho 2: USB (WebUSB + ESC/POS) ----------
export async function imprimirUsb(d: DadosComanda): Promise<string> {
  const usb = usbApi();
  if (!usb) throw new Error("Este navegador não oferece WebUSB.");

  const device = await usb.requestDevice({ filters: [{ classCode: 7 }, {}] });
  await device.open();
  if (!device.configuration) await device.selectConfiguration(1);

  const iface = device.configuration?.interfaces.find((i) =>
    i.alternate.endpoints.some((e) => e.direction === "out" && e.type === "bulk"),
  );
  if (!iface) {
    await device.close();
    throw new Error("A impressora USB não expôs um canal de saída compatível.");
  }
  const endpoint = iface.alternate.endpoints.find(
    (e) => e.direction === "out" && e.type === "bulk",
  );
  await device.claimInterface(iface.interfaceNumber);
  await device.transferOut(endpoint!.endpointNumber, montarBytesEscPos(d));
  await device.close();
  return device.productName || "impressora USB";
}

// ---------- caminho 3: impressão pelo sistema operacional ----------
export function imprimirPeloSistema(): void {
  window.print();
}
