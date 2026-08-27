import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErroAviso, Loading, RoleBadge, VazioAviso } from "@/components/Comuns";
import { useAuth } from "@/context/AuthContext";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut, mensagemErro } from "@/lib/api";
import { dataHora, ROLE_LABEL, type Role, type Usuario } from "@/lib/types";

export default function Funcionarios({ modoDev = false }: { modoDev?: boolean }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const souDev = user?.role === "DEV";
  const [nova, setNova] = useState(false);
  const [nome, setNome] = useState("");
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [role, setRole] = useState<Role>("ATENDENTE");
  const [resetar, setResetar] = useState<Usuario | null>(null);
  const [novaSenha, setNovaSenha] = useState("");

  const lista = useQuery({ queryKey: ["usuarios"], queryFn: () => apiGet<Usuario[]>("/usuarios") });
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["usuarios"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const criar = useMutation({
    mutationFn: () =>
      apiPost<Usuario>("/usuarios", { nome: nome.trim(), usuario: login.trim(), senha, role }),
    onSuccess: () => {
      toast.success("Funcionário cadastrado");
      setNova(false);
      setNome("");
      setLogin("");
      setSenha("");
      setRole("ATENDENTE");
      invalidar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const alternar = useMutation({
    mutationFn: (v: { id: number; ativo: boolean }) =>
      apiPatch<Usuario>(`/usuarios/${v.id}/status`, { ativo: v.ativo }),
    onSuccess: () => {
      toast.success("Status atualizado");
      invalidar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const trocarSenha = useMutation({
    mutationFn: () => apiPut<{ mensagem: string }>(`/usuarios/${resetar?.id}/senha`, { novaSenha }),
    onSuccess: () => {
      toast.success("Senha redefinida");
      setResetar(null);
      setNovaSenha("");
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const excluir = useMutation({
    mutationFn: (id: number) => apiDelete<{ mensagem: string }>(`/usuarios/${id}`),
    onSuccess: () => {
      toast.success("Usuário excluído");
      invalidar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const rolesDisponiveis: Role[] = souDev ? ["ATENDENTE", "ADMIN", "DEV"] : ["ATENDENTE"];

  return (
    <div className="space-y-6" data-testid={modoDev ? "pagina-usuarios" : "pagina-funcionarios"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold" data-testid="pagina-titulo">
            {modoDev ? "Usuários do Sistema" : "Funcionários"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {souDev
              ? "Todos os perfis, incluindo administradores e desenvolvedores."
              : "Administradores gerenciam apenas atendentes."}
          </p>
        </div>
        <Button onClick={() => setNova(true)} className="active:scale-95" data-testid="botao-novo-funcionario">
          <Plus className="mr-1.5 size-4" /> {modoDev ? "Novo Usuário" : "Novo Funcionário"}
        </Button>
      </div>

      {lista.isError && <ErroAviso texto="Não foi possível carregar os usuários." />}
      {lista.isLoading && <Loading />}

      {lista.data && !lista.isError && (
        <div className="rounded-xl border border-border bg-card">
          {lista.data.length === 0 ? (
            <VazioAviso texto="Nenhum usuário cadastrado." />
          ) : (
            <Table data-testid="tabela-funcionarios">
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.data.map((u) => (
                  <TableRow key={u.id} data-testid={`linha-usuario-${u.usuario}`}>
                    <TableCell className="font-semibold">{u.nome}</TableCell>
                    <TableCell className="font-mono text-xs">@{u.usuario}</TableCell>
                    <TableCell>
                      <RoleBadge role={u.role} />
                    </TableCell>
                    <TableCell>
                      <span
                        className={`text-xs font-bold ${u.ativo ? "text-primary" : "text-destructive"}`}
                        data-testid={`status-usuario-${u.usuario}`}
                      >
                        {u.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">{dataHora(u.criadoEm)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={alternar.isPending}
                          onClick={() => alternar.mutate({ id: u.id, ativo: !u.ativo })}
                          data-testid={`botao-alternar-status-${u.usuario}`}
                        >
                          {u.ativo ? "Desativar" : "Ativar"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setResetar(u)}
                          data-testid={`botao-resetar-senha-${u.usuario}`}
                        >
                          <KeyRound className="size-3.5" />
                        </Button>
                        {souDev && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            disabled={excluir.isPending}
                            onClick={() => {
                              if (
                                window.confirm(`Excluir ${u.nome} permanentemente?`) &&
                                window.confirm("Confirme novamente: esta ação não pode ser desfeita.")
                              ) {
                                excluir.mutate(u.id);
                              }
                            }}
                            data-testid={`botao-excluir-usuario-${u.usuario}`}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      <Dialog open={nova} onOpenChange={setNova}>
        <DialogContent data-testid="modal-novo-funcionario">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl font-bold">Novo Funcionário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="f-nome">Nome *</Label>
              <Input id="f-nome" value={nome} onChange={(e) => setNome(e.target.value)} data-testid="input-funcionario-nome" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="f-login">Usuário de acesso *</Label>
              <Input id="f-login" value={login} onChange={(e) => setLogin(e.target.value)} data-testid="input-funcionario-usuario" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="f-senha">Senha * (mín. 6 caracteres)</Label>
              <Input
                id="f-senha"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                data-testid="input-funcionario-senha"
              />
            </div>
            <div className="space-y-2">
              <Label>Perfil</Label>
              <Select value={role} onValueChange={(v: string) => setRole(v as Role)}>
                <SelectTrigger data-testid="select-funcionario-role">
                  <SelectValue>{(v) => ROLE_LABEL[v as Role]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {rolesDisponiveis.map((r) => (
                    <SelectItem key={r} value={r} data-testid={`opcao-role-${r.toLowerCase()}`}>
                      {ROLE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!souDev && (
                <p className="text-xs text-muted-foreground">
                  Administradores podem cadastrar apenas atendentes.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNova(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!nome.trim() || login.trim().length < 3 || senha.length < 6 || criar.isPending}
              onClick={() => criar.mutate()}
              data-testid="botao-salvar-funcionario"
            >
              {criar.isPending ? "Salvando..." : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetar} onOpenChange={(v) => !v && setResetar(null)}>
        <DialogContent data-testid="modal-resetar-senha">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl font-bold">
              Redefinir senha de {resetar?.nome}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="r-senha">Nova senha (mín. 6 caracteres)</Label>
            <Input
              id="r-senha"
              type="password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              data-testid="input-resetar-senha"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetar(null)}>
              Cancelar
            </Button>
            <Button
              disabled={novaSenha.length < 6 || trocarSenha.isPending}
              onClick={() => trocarSenha.mutate()}
              data-testid="botao-confirmar-reset-senha"
            >
              {trocarSenha.isPending ? "Salvando..." : "Redefinir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
