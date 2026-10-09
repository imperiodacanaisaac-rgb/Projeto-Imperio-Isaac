import { Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/AuthContext";
import Layout from "@/components/Layout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Mesas from "@/pages/Mesas";
import NovoPedido from "@/pages/NovoPedido";
import Pedidos from "@/pages/Pedidos";
import Perfil from "@/pages/Perfil";
import NotFound from "@/pages/NotFound";
import { Loading } from "@/components/Comuns";
import type { Role } from "@/lib/types";

// Telas de gestão/DEV entram sob demanda: o atendente (tablet do caixa) baixa só o
// essencial, deixando o carregamento inicial mais leve.
const Funcionarios = lazy(() => import("@/pages/Funcionarios"));
const Produtos = lazy(() => import("@/pages/Produtos"));
const Caixa = lazy(() => import("@/pages/Caixa"));
const Relatorios = lazy(() => import("@/pages/Relatorios"));
const Configuracoes = lazy(() => import("@/pages/Configuracoes"));
const Logs = lazy(() => import("@/pages/Logs"));

// Fora do componente: referências estáveis entre renders.
const ROLES_GESTAO: Role[] = ["ADMIN", "DEV"];
const ROLES_DEV: Role[] = ["DEV"];

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" richColors />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/mesas" element={<Mesas />} />
          <Route path="/pedidos/novo" element={<NovoPedido />} />
          <Route path="/pedidos" element={<Pedidos />} />
          <Route path="/perfil" element={<Perfil />} />
          <Route
            path="/funcionarios"
            element={
              <ProtectedRoute roles={ROLES_GESTAO}>
                <Suspense fallback={<Loading />}><Funcionarios /></Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/produtos"
            element={
              <ProtectedRoute roles={ROLES_GESTAO}>
                <Suspense fallback={<Loading />}><Produtos /></Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/caixa"
            element={
              <ProtectedRoute roles={ROLES_GESTAO}>
                <Suspense fallback={<Loading />}><Caixa /></Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/relatorios"
            element={
              <ProtectedRoute roles={ROLES_GESTAO}>
                <Suspense fallback={<Loading />}><Relatorios /></Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/usuarios"
            element={
              <ProtectedRoute roles={ROLES_DEV}>
                <Suspense fallback={<Loading />}><Funcionarios modoDev /></Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/configuracoes"
            element={
              <ProtectedRoute roles={ROLES_DEV}>
                <Suspense fallback={<Loading />}><Configuracoes /></Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/logs"
            element={
              <ProtectedRoute roles={ROLES_DEV}>
                <Suspense fallback={<Loading />}><Logs /></Suspense>
              </ProtectedRoute>
            }
          />
          <Route path="/404" element={<NotFound />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  );
}
