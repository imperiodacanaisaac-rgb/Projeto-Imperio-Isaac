import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErroAviso } from "@/components/Comuns";
import { useAuth } from "@/context/AuthContext";
import { mensagemErro } from "@/lib/api";

export default function Login() {
  const { entrar, config } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(params.get("expirada") ? "Sessão expirada, faça login novamente" : "");
  const [enviando, setEnviando] = useState(false);

  const nomeLoja = config.nomeEstabelecimento || "Império Da Cana";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!usuario.trim() || !senha) {
      setErro("Informe usuário e senha");
      return;
    }
    setEnviando(true);
    setErro("");
    try {
      await entrar(usuario.trim(), senha);
      navigate("/", { replace: true });
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#064e3b] p-12 text-white lg:flex">
        <img
          src="/marca/login-hero.jpg"
          alt="Caldo de cana e pastéis do Império Da Cana"
          className="absolute inset-0 size-full object-cover opacity-45"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-[#064e3b] via-[#064e3b]/70 to-[#064e3b]/20"
          aria-hidden
        />
        <div
          className="absolute -left-16 bottom-0 size-72 rounded-full bg-[#facc15]/20 blur-3xl"
          aria-hidden
        />
        <div className="relative">
          <img
            src="/marca/logo-full.jpg"
            alt="Império Da Cana"
            className="w-full max-w-md rounded-xl shadow-2xl"
            data-testid="login-logo"
          />
        </div>
        <div className="relative max-w-md">
          <h2 className="font-heading text-4xl font-extrabold leading-tight">
            Caldo moído na hora,
            <span className="text-[#facc15]"> gestão em tempo real.</span>
          </h2>
          <p className="mt-4 text-sm text-white/70">
            Comandas, mesas, caixa e relatórios do seu estabelecimento em um só painel.
          </p>
        </div>
        <p className="relative text-xs text-white/50">{nomeLoja} · Sistema de Gestão</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <form
          onSubmit={submit}
          className="w-full max-w-sm space-y-5"
          data-testid="formulario-login"
        >
          <div className="space-y-1.5">
            <img
              src="/marca/logo-full.jpg"
              alt="Império Da Cana"
              className="mb-3 w-full rounded-xl lg:hidden"
              data-testid="login-logo-mobile"
            />
            <p className="text-sm text-muted-foreground">Entre com seu usuário e senha.</p>
          </div>

          {erro && <ErroAviso texto={erro} />}

          <div className="space-y-2">
            <Label htmlFor="usuario">Usuário</Label>
            <Input
              id="usuario"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="ex.: atendente"
              autoComplete="username"
              data-testid="input-usuario"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="senha">Senha</Label>
            <Input
              id="senha"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••"
              autoComplete="current-password"
              data-testid="input-senha"
            />
          </div>

          <Button
            type="submit"
            className="w-full active:scale-95"
            disabled={enviando}
            data-testid="botao-entrar"
          >
            {enviando ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <LogIn className="mr-1.5 size-4" />
            )}
            Entrar
          </Button>

          <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">Acessos de demonstração</p>
            <p>dev / dev123 — admin / admin123 — atendente / atendente123</p>
          </div>
        </form>
      </div>
    </div>
  );
}
