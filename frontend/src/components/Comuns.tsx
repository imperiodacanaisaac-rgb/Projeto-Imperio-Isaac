import { Loader2 } from "lucide-react";

export function Loading({ texto = "Carregando..." }: { texto?: string }) {
  return (
    <div
      className="flex items-center gap-3 py-10 text-muted-foreground"
      data-testid="loading-spinner"
    >
      <Loader2 className="size-5 animate-spin text-primary" />
      <span className="text-sm">{texto}</span>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const mapa: Record<string, string> = {
    ABERTO: "bg-[#fef08a] text-[#713f12] dark:bg-[#3b2a05] dark:text-[#fef08a]",
    PAGO: "bg-[#dcfce7] text-[#14532d] dark:bg-[#064e3b] dark:text-[#a7f3d0]",
    CANCELADO: "bg-[#fee2e2] text-[#991b1b] dark:bg-[#450a0a] dark:text-[#fca5a5]",
  };
  const label: Record<string, string> = {
    ABERTO: "Aberto",
    PAGO: "Pago",
    CANCELADO: "Cancelado",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${mapa[status] ?? "bg-muted text-muted-foreground"}`}
      data-testid={`status-badge-${status.toLowerCase()}`}
    >
      {label[status] ?? status}
    </span>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const mapa: Record<string, string> = {
    DEV: "bg-[#ede9fe] text-[#5b21b6] dark:bg-[#2e1065] dark:text-[#c4b5fd]",
    ADMIN: "bg-[#fef08a] text-[#713f12] dark:bg-[#3b2a05] dark:text-[#fef08a]",
    ATENDENTE: "bg-[#dcfce7] text-[#14532d] dark:bg-[#064e3b] dark:text-[#a7f3d0]",
  };
  const label: Record<string, string> = {
    DEV: "Desenvolvedor",
    ADMIN: "Administrador",
    ATENDENTE: "Atendente",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${mapa[role] ?? "bg-muted"}`}
      data-testid={`role-badge-${role.toLowerCase()}`}
    >
      {label[role] ?? role}
    </span>
  );
}

export function KpiCard({
  titulo,
  valor,
  detalhe,
  testId,
  destaque,
}: {
  titulo: string;
  valor: string;
  detalhe?: string;
  testId: string;
  destaque?: "verde" | "dourado";
}) {
  const barra =
    destaque === "dourado" ? "bg-[#facc15]" : destaque === "verde" ? "bg-[#16a34a]" : "bg-border";
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow duration-200 hover:shadow-md"
      data-testid={testId}
    >
      <div className={`absolute inset-x-0 top-0 h-1 ${barra}`} />
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {titulo}
      </p>
      <p className="mt-2 font-heading text-3xl font-extrabold text-foreground">{valor}</p>
      {detalhe && <p className="mt-1 text-xs text-muted-foreground">{detalhe}</p>}
    </div>
  );
}

export function VazioAviso({ texto, testId }: { texto: string; testId?: string }) {
  return (
    <p className="py-8 text-center text-sm text-muted-foreground" data-testid={testId}>
      {texto}
    </p>
  );
}

export function ErroAviso({ texto }: { texto: string }) {
  return (
    <div
      className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      data-testid="erro-aviso"
    >
      {texto}
    </div>
  );
}
