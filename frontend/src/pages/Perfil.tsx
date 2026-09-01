import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RoleBadge } from "@/components/Comuns";
import { useAuth } from "@/context/AuthContext";
import { apiPut, mensagemErro } from "@/lib/api";
import { dataHora, type Usuario } from "@/lib/types";

export default function Perfil() {
  const { user, atualizarUser, tema, alternarTema } = useAuth();
  const qc = useQueryClient();
  const [nome, setNome] = useState(user?.nome ?? "");
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");

  const salvarNome = useMutation({
    mutationFn: () => apiPut<Usuario>(`/usuarios/${user?.id}`, { nome: nome.trim() }),
    onSuccess: (u) => {
      atualizarUser(u);
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      toast.success("Perfil atualizado");
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const trocarSenha = useMutation({
    mutationFn: () =>
      apiPut<{ mensagem: string }>(`/usuarios/${user?.id}/senha`, { senhaAtual, novaSenha }),
    onSuccess: () => {
      toast.success("Senha alterada com sucesso");
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmacao("");
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  if (!user) return null;

  // Atendentes não alteram os próprios dados de acesso (regra também aplicada na API).
  const somenteLeitura = user.role === "ATENDENTE";

  return (
    <div className="max-w-2xl space-y-6" data-testid="pagina-perfil">
      <div>
        <h1 className="font-heading text-2xl font-bold" data-testid="pagina-titulo">
          Meu Perfil
        </h1>
        <p className="text-sm text-muted-foreground">Seus dados de acesso e preferências.</p>
      </div>

      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <RoleBadge role={user.role} />
          <span className="text-sm text-muted-foreground" data-testid="perfil-usuario">
            @{user.usuario} · criado em {dataHora(user.criadoEm)}
          </span>
        </div>
        <div className="space-y-2">
          <Label htmlFor="nome">Nome</Label>
          <Input
            id="nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            disabled={somenteLeitura}
            data-testid="input-perfil-nome"
          />
        </div>
        {somenteLeitura ? (
          <p
            className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
            data-testid="aviso-perfil-somente-leitura"
          >
            Seus dados de acesso (nome, usuário e senha) são gerenciados pelo administrador.
            Solicite a alteração a ele. Você pode apenas alternar o tema abaixo.
          </p>
        ) : (
          <Button
            className="active:scale-95"
            disabled={!nome.trim() || salvarNome.isPending}
            onClick={() => salvarNome.mutate()}
            data-testid="botao-salvar-perfil"
          >
            {salvarNome.isPending ? "Salvando..." : "Salvar nome"}
          </Button>
        )}
      </section>

      {!somenteLeitura && (
      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h2 className="font-heading text-lg font-bold">Alterar senha</h2>
        <div className="space-y-2">
          <Label htmlFor="atual">Senha atual</Label>
          <Input
            id="atual"
            type="password"
            value={senhaAtual}
            onChange={(e) => setSenhaAtual(e.target.value)}
            data-testid="input-senha-atual"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nova">Nova senha (mín. 6 caracteres)</Label>
          <Input
            id="nova"
            type="password"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            data-testid="input-nova-senha"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="conf">Confirmar nova senha</Label>
          <Input
            id="conf"
            type="password"
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
            data-testid="input-confirmar-senha"
          />
        </div>
        {novaSenha && confirmacao && novaSenha !== confirmacao && (
          <p className="text-sm text-destructive">As senhas não coincidem.</p>
        )}
        <Button
          className="active:scale-95"
          disabled={
            !senhaAtual ||
            novaSenha.length < 6 ||
            novaSenha !== confirmacao ||
            trocarSenha.isPending
          }
          onClick={() => trocarSenha.mutate()}
          data-testid="botao-alterar-senha"
        >
          {trocarSenha.isPending ? "Alterando..." : "Alterar senha"}
        </Button>
      </section>
      )}

      <section className="flex items-center justify-between rounded-xl border border-border bg-card p-5">
        <div>
          <h2 className="font-heading text-lg font-bold">Tema</h2>
          <p className="text-sm text-muted-foreground">
            Atualmente em modo {tema === "claro" ? "claro" : "escuro"}.
          </p>
        </div>
        <Button variant="outline" onClick={alternarTema} data-testid="botao-tema-perfil">
          Alternar tema
        </Button>
      </section>
    </div>
  );
}
