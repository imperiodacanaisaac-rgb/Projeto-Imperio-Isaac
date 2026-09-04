import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  CircleDollarSign,
  HelpCircle,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Menu,
  Moon,
  Package,
  ScrollText,
  Settings,
  ShoppingCart,
  Sun,
  Table2,
  User,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { RoleBadge } from "@/components/Comuns";
import { GuiaRapido } from "@/components/GuiaRapido";
import type { Role } from "@/lib/types";

interface ItemNav {
  para: string;
  label: string;
  testId: string;
  icone: React.ComponentType<{ className?: string }>;
  roles: Role[];
}

const ITENS: ItemNav[] = [
  { para: "/", label: "Dashboard", testId: "nav-dashboard", icone: LayoutDashboard, roles: ["ATENDENTE", "ADMIN", "DEV"] },
  { para: "/mesas", label: "Mesas", testId: "nav-mesas", icone: Table2, roles: ["ATENDENTE", "ADMIN", "DEV"] },
  { para: "/pedidos/novo", label: "Novo Pedido", testId: "nav-novo-pedido", icone: ShoppingCart, roles: ["ATENDENTE", "ADMIN", "DEV"] },
  { para: "/pedidos", label: "Pedidos", testId: "nav-pedidos", icone: ClipboardList, roles: ["ATENDENTE", "ADMIN", "DEV"] },
  { para: "/funcionarios", label: "Funcionários", testId: "nav-funcionarios", icone: Users, roles: ["ADMIN", "DEV"] },
  { para: "/produtos", label: "Produtos", testId: "nav-produtos", icone: Package, roles: ["ADMIN", "DEV"] },
  { para: "/caixa", label: "Caixa", testId: "nav-caixa", icone: CircleDollarSign, roles: ["ADMIN", "DEV"] },
  { para: "/relatorios", label: "Relatórios", testId: "nav-relatorios", icone: BarChart3, roles: ["ADMIN", "DEV"] },
  { para: "/usuarios", label: "Usuários", testId: "nav-usuarios", icone: ListOrdered, roles: ["DEV"] },
  { para: "/configuracoes", label: "Configurações", testId: "nav-configuracoes", icone: Settings, roles: ["DEV"] },
  { para: "/logs", label: "Logs", testId: "nav-logs", icone: ScrollText, roles: ["DEV"] },
  { para: "/perfil", label: "Meu Perfil", testId: "nav-meu-perfil", icone: User, roles: ["ATENDENTE", "ADMIN", "DEV"] },
];

export default function Layout() {
  const { user, config, tema, alternarTema, sair } = useAuth();
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [guia, setGuia] = useState(false);

  const nomeLoja = config.nomeEstabelecimento || "Império Da Cana";
  const itens = ITENS.filter((i) => (user ? i.roles.includes(user.role) : false));

  // Data do dia exibida na barra superior.
  const dataDeHoje = new Date().toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-background">
      <header
        className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border bg-card/90 px-4 backdrop-blur-md"
        data-testid="topbar"
      >
        <button
          className="rounded-lg p-2 transition-colors duration-150 hover:bg-accent md:hidden"
          onClick={() => setAberto((v) => !v)}
          aria-label="Abrir menu"
          data-testid="botao-menu-mobile"
        >
          {aberto ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>

        <Link to="/" className="flex min-w-0 items-center gap-2" data-testid="topbar-logo">
          <img
            src="/marca/icone.png"
            alt=""
            aria-hidden
            className="size-9 shrink-0 object-contain"
          />
          <span
            className="truncate font-heading text-base font-bold sm:text-lg"
            data-testid="topbar-estabelecimento"
          >
            {nomeLoja}
          </span>
        </Link>

        <span
          className="ml-2 hidden shrink-0 items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2.5 py-1.5 text-xs font-semibold sm:flex"
          data-testid="topbar-data"
        >
          <CalendarDays className="size-3.5 text-primary" />
          {dataDeHoje}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 sm:flex">
            <span className="text-sm font-semibold" data-testid="topbar-usuario-nome">
              {user?.nome}
            </span>
            {user && <RoleBadge role={user.role} />}
          </div>
          <button
            onClick={alternarTema}
            className="rounded-lg p-2 transition-colors duration-150 hover:bg-accent"
            aria-label="Alternar tema"
            data-testid="botao-alternar-tema"
          >
            {tema === "claro" ? <Moon className="size-5" /> : <Sun className="size-5" />}
          </button>
          <button
            onClick={() => setGuia(true)}
            className="rounded-lg p-2 transition-colors duration-150 hover:bg-accent"
            aria-label="Guia rápido"
            data-testid="botao-guia-rapido"
          >
            <HelpCircle className="size-5" />
          </button>
          <button
            onClick={() => {
              sair();
              navigate("/login");
            }}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-semibold text-destructive transition-colors duration-150 hover:bg-destructive/10"
            data-testid="botao-logout"
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </header>

      <div className="flex">
        <aside
          className={`fixed inset-y-16 left-0 z-30 w-60 shrink-0 overflow-y-auto border-r border-sidebar-border bg-sidebar p-3 transition-transform duration-200 md:sticky md:top-16 md:h-[calc(100vh-4rem)] md:translate-x-0 ${
            aberto ? "translate-x-0" : "-translate-x-full"
          }`}
          data-testid="sidebar"
        >
          <nav className="flex flex-col gap-1">
            {itens.map((item) => (
              <NavLink
                key={item.para}
                to={item.para}
                end={item.para === "/"}
                onClick={() => setAberto(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors duration-150 ${
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
                  }`
                }
                data-testid={item.testId}
              >
                <item.icone className="size-4 shrink-0" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        {aberto && (
          <button
            className="fixed inset-0 top-16 z-20 bg-black/40 md:hidden"
            onClick={() => setAberto(false)}
            aria-label="Fechar menu"
          />
        )}

        <main className="min-w-0 flex-1 p-4 sm:p-6" data-testid="conteudo-principal">
          <p
            className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground sm:hidden"
            data-testid="data-hoje-mobile"
          >
            <CalendarDays className="size-3.5 text-primary" />
            {dataDeHoje}
          </p>
          <Outlet />
        </main>
      </div>

      <GuiaRapido aberto={guia} onFechar={() => setGuia(false)} role={user?.role ?? "ATENDENTE"} />
    </div>
  );
}
