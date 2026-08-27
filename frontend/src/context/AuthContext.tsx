import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut, TOKEN_KEY } from "@/lib/api";
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

function aplicarTema(tema: "claro" | "escuro") {
  document.documentElement.classList.toggle("dark", tema === "escuro");
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<Usuario | null>(null);
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
        setTema(u.tema === "escuro" ? "escuro" : "claro");
      })
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setCarregando(false));
  }, []);

  const entrar = useCallback(
    async (usuario: string, senha: string) => {
      const out = await apiPost<LoginOut>("/auth/login", { usuario, senha });
      localStorage.setItem(TOKEN_KEY, out.token);
      setUser(out.user);
      setTema(out.user.tema === "escuro" ? "escuro" : "claro");
      qc.clear();
      return out.user;
    },
    [qc],
  );

  const sair = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    qc.clear();
  }, [qc]);

  const alternarTema = useCallback(() => {
    const novo = tema === "claro" ? "escuro" : "claro";
    setTema(novo);
    if (user) {
      apiPut<Usuario>(`/usuarios/${user.id}/tema`, { tema: novo })
        .then(setUser)
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
      atualizarUser: setUser,
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
