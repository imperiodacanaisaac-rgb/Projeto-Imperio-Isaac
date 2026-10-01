import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut, ApiError, TOKEN_KEY } from "@/lib/api";
import type { Configuracao, LoginOut, Usuario } from "@/lib/types";

interface AuthValor {
  user: Usuario | null;
  carregando: boolean;
  tema: "claro" | "escuro";
  config: Record<string, string>;
  entrar: (usuario: string, senha: string) => Promise<Usuario>;
  sair: () => void;
  alternarTema: () => void;
  atualizarUser: (u: Usuario) => void;
  recarregarConfig: () => void;
}

const AuthContext = createContext<AuthValor | null>(null);

const TEMA_KEY = "imperio_tema";
const USER_KEY = "imperio_user";

function lerUsuarioSalvo(): Usuario | null {
  // Perfil espelhado no localStorage: se /auth/me falhar (queda de rede, 500 ou 503 de
  // cota do Firebase), o atendente continua dentro do sistema em vez de cair no login.
  try {
    const cru = localStorage.getItem(USER_KEY);
    return cru ? (JSON.parse(cru) as Usuario) : null;
  } catch {
    return null;
  }
}

function salvarUsuario(u: Usuario | null): void {
  if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
  else localStorage.removeItem(USER_KEY);
}

function aplicarTema(tema: "claro" | "escuro") {
  document.documentElement.classList.toggle("dark", tema === "escuro");
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<Usuario | null>(() =>
    localStorage.getItem(TOKEN_KEY) ? lerUsuarioSalvo() : null,
  );
  const [carregando, setCarregando] = useState(true);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [tema, setTema] = useState<"claro" | "escuro">(
    () => (localStorage.getItem(TEMA_KEY) as "claro" | "escuro") || "claro",
  );

  useEffect(() => {
    aplicarTema(tema);
    localStorage.setItem(TEMA_KEY, tema);
  }, [tema]);

  const recarregarConfig = useCallback(() => {
    apiGet<Configuracao[]>("/configuracoes")
      .then((lista) =>
        setConfig(Object.fromEntries(lista.map((c) => [c.chave, c.valor]))),
      )
      .catch(() => setConfig({}));
  }, []);

  useEffect(() => {
    recarregarConfig();
  }, [recarregarConfig]);

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      setCarregando(false);
      return;
    }
    apiGet<Usuario>("/auth/me")
      .then((u) => {
        setUser(u);
        salvarUsuario(u);
        setTema(u.tema === "escuro" ? "escuro" : "claro");
      })
      .catch((err) => {
        // Só derruba a sessão quando o servidor REJEITA o token (401). Em queda de
        // rede, 500 ou 503 (cota do Firebase) o token e o perfil salvo são mantidos:
        // o atendente continua logado e a próxima tentativa recupera o perfil.
        if (err instanceof ApiError && err.status === 401) {
          localStorage.removeItem(TOKEN_KEY);
          salvarUsuario(null);
          setUser(null);
        }
      })
      .finally(() => setCarregando(false));
  }, []);

  const entrar = useCallback(
    async (usuario: string, senha: string) => {
      const out = await apiPost<LoginOut>("/auth/login", { usuario, senha });
      localStorage.setItem(TOKEN_KEY, out.token);
      setUser(out.user);
      salvarUsuario(out.user);
      setTema(out.user.tema === "escuro" ? "escuro" : "claro");
      qc.clear();
      return out.user;
    },
    [qc],
  );

  const sair = useCallback(() => {
    // Único caminho de saída: clique explícito no botão "Sair".
    localStorage.removeItem(TOKEN_KEY);
    salvarUsuario(null);
    setUser(null);
    qc.clear();
  }, [qc]);

  const alternarTema = useCallback(() => {
    const novo = tema === "claro" ? "escuro" : "claro";
    setTema(novo);
    if (user) {
      apiPut<Usuario>(`/usuarios/${user.id}/tema`, { tema: novo })
        .then((u) => {
          setUser(u);
          salvarUsuario(u);
        })
        .catch(() => undefined);
    }
  }, [tema, user]);

  const valor = useMemo<AuthValor>(
    () => ({
      user,
      carregando,
      tema,
      config,
      entrar,
      sair,
      alternarTema,
      atualizarUser: (u: Usuario) => {
        setUser(u);
        salvarUsuario(u);
      },
      recarregarConfig,
    }),
    [user, carregando, tema, config, entrar, sair, alternarTema, recarregarConfig],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValor {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de AuthProvider");
  return ctx;
}
