import { Routes, Route, Navigate } from "react-router-dom";
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
import Funcionarios from "@/pages/Funcionarios";
import Produtos from "@/pages/Produtos";
import Caixa from "@/pages/Caixa";
import Relatorios from "@/pages/Relatorios";
import Configuracoes from "@/pages/Configuracoes";
import Logs from "@/pages/Logs";
import NotFound from "@/pages/NotFound";

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
              <ProtectedRoute roles={["ADMIN", "DEV"]}>
                <Funcionarios />
              </ProtectedRoute>
            }
          />
          <Route
            path="/produtos"
            element={
              <ProtectedRoute roles={["ADMIN", "DEV"]}>
                <Produtos />
              </ProtectedRoute>
            }
          />
          <Route
            path="/caixa"
            element={
              <ProtectedRoute roles={["ADMIN", "DEV"]}>
                <Caixa />
              </ProtectedRoute>
            }
          />
          <Route
            path="/relatorios"
            element={
              <ProtectedRoute roles={["ADMIN", "DEV"]}>
                <Relatorios />
              </ProtectedRoute>
            }
          />
          <Route
            path="/usuarios"
            element={
              <ProtectedRoute roles={["DEV"]}>
                <Funcionarios modoDev />
              </ProtectedRoute>
            }
          />
          <Route
            path="/configuracoes"
            element={
              <ProtectedRoute roles={["DEV"]}>
                <Configuracoes />
              </ProtectedRoute>
            }
          />
          <Route
            path="/logs"
            element={
              <ProtectedRoute roles={["DEV"]}>
                <Logs />
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
