import { Navigate, useLocation } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";
import { Loading } from "@/components/Comuns";
import { useAuth } from "@/context/AuthContext";
import type { Role } from "@/lib/types";

export function ProtectedRoute({
  roles,
  children,
}: {
  roles?: Role[];
  children: React.ReactNode;
}) {
  const { user, carregando } = useAuth();
  const location = useLocation();

  if (carregando) return <Loading texto="Verificando sessão..." />;
  if (!user) return <Navigate to="/login" replace state={{ de: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <AcessoNegado />;
  return <>{children}</>;
}

export function AcessoNegado() {
  return (
    <div
      className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center"
      data-testid="acesso-negado"
    >
      <ShieldAlert className="size-14 text-destructive" />
      <h1 className="font-heading text-2xl font-bold">Acesso Negado</h1>
      <p className="text-sm text-muted-foreground">
        Você não tem permissão para acessar esta área. Fale com o administrador do
        estabelecimento se precisar deste acesso.
      </p>
      <Link to="/" className={buttonVariants({ variant: "default" })} data-testid="link-voltar-inicio">
        Voltar ao início
      </Link>
    </div>
  );
}
