import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErroAviso, Loading, VazioAviso } from "@/components/Comuns";
import { apiGet } from "@/lib/api";
import { dataHora, type LogAtividade, type Usuario } from "@/lib/types";

export default function Logs() {
  const [usuarioId, setUsuarioId] = useState("TODOS");
  const [acao, setAcao] = useState("");

  const query = new URLSearchParams();
  if (usuarioId !== "TODOS") query.set("usuarioId", usuarioId);
  if (acao.trim()) query.set("acao", acao.trim().toUpperCase());

  const logs = useQuery({
    queryKey: ["logs", query.toString()],
    queryFn: () => apiGet<LogAtividade[]>(`/logs?${query.toString()}`),
  });

  const usuarios = useQuery({
    queryKey: ["usuarios"],
    queryFn: () => apiGet<Usuario[]>("/usuarios"),
  });

  const nomeUsuario = (v: string) =>
    v === "TODOS"
      ? "Todos os usuários"
      : (usuarios.data?.find((u) => String(u.id) === v)?.nome ?? v);

  return (
    <div className="space-y-6" data-testid="pagina-logs">
      <div>
        <h1 className="font-heading text-2xl font-bold" data-testid="pagina-titulo">
          Logs de Atividade
        </h1>
        <p className="text-sm text-muted-foreground">
          Histórico cronológico das ações realizadas no sistema.
        </p>
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Usuário</Label>
          <Select value={usuarioId} onValueChange={(v: string) => setUsuarioId(v)}>
            <SelectTrigger data-testid="filtro-log-usuario">
              <SelectValue>{(v) => nomeUsuario(v as string)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todos os usuários</SelectItem>
              {usuarios.data?.map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="acao">Tipo de ação</Label>
          <Input
            id="acao"
            value={acao}
            onChange={(e) => setAcao(e.target.value)}
            placeholder="ex.: CRIOU_PEDIDO"
            data-testid="filtro-log-acao"
          />
        </div>
      </div>

      {logs.isError && <ErroAviso texto="Não foi possível carregar os logs." />}
      {logs.isLoading && <Loading />}

      {logs.data && !logs.isError && (
        <div className="rounded-xl border border-border bg-card">
          {logs.data.length === 0 ? (
            <VazioAviso texto="Nenhum log encontrado." testId="logs-vazio" />
          ) : (
            <Table data-testid="tabela-logs">
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Detalhes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.data.map((l) => (
                  <TableRow key={l.id} data-testid={`linha-log-${l.id}`}>
                    <TableCell className="text-xs">{dataHora(l.criadoEm)}</TableCell>
                    <TableCell className="text-sm font-semibold">{l.usuarioNome}</TableCell>
                    <TableCell className="font-mono text-xs">{l.acao}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {l.detalhes ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}
