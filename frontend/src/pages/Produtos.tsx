import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ErroAviso, Loading, VazioAviso } from "@/components/Comuns";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut, mensagemErro } from "@/lib/api";
import { brl, CATEGORIA_LABEL, type Produto } from "@/lib/types";

const CATEGORIAS = ["caldo", "pastel", "bebida", "outro"];

interface Formulario {
  nome: string;
  descricao: string;
  preco: string;
  categoria: string;
  imagemUrl: string;
  ordem: string;
}

const VAZIO: Formulario = {
  nome: "",
  descricao: "",
  preco: "",
  categoria: "caldo",
  imagemUrl: "",
  ordem: "0",
};

export default function Produtos() {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<Produto | null>(null);
  const [form, setForm] = useState<Formulario>(VAZIO);

  const produtos = useQuery({
    queryKey: ["produtos"],
    queryFn: () => apiGet<Produto[]>("/produtos"),
  });

  const invalidar = () => qc.invalidateQueries({ queryKey: ["produtos"] });

  function abrirNovo() {
    setEditando(null);
    setForm(VAZIO);
    setAberto(true);
  }

  function abrirEdicao(p: Produto) {
    setEditando(p);
    setForm({
      nome: p.nome,
      descricao: p.descricao ?? "",
      preco: String(p.preco),
      categoria: p.categoria,
      imagemUrl: p.imagemUrl ?? "",
      ordem: String(p.ordem),
    });
    setAberto(true);
  }

  const salvar = useMutation({
    mutationFn: () => {
      const body = {
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
        preco: Number(form.preco),
        categoria: form.categoria,
        imagemUrl: form.imagemUrl.trim() || null,
        ordem: Number(form.ordem) || 0,
      };
      return editando
        ? apiPut<Produto>(`/produtos/${editando.id}`, body)
        : apiPost<Produto>("/produtos", body);
    },
    onSuccess: () => {
      toast.success(editando ? "Produto atualizado" : "Produto criado");
      setAberto(false);
      invalidar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const alternar = useMutation({
    mutationFn: (v: { id: number; ativo: boolean }) =>
      apiPatch<Produto>(`/produtos/${v.id}/status`, { ativo: v.ativo }),
    onSuccess: () => {
      toast.success("Status do produto atualizado");
      invalidar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const excluir = useMutation({
    mutationFn: (id: number) => apiDelete<{ mensagem: string }>(`/produtos/${id}`),
    onSuccess: () => {
      toast.success("Produto excluído");
      invalidar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const precoValido = Number(form.preco) >= 0.01;

  return (
    <div className="space-y-6" data-testid="pagina-produtos">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold" data-testid="pagina-titulo">
            Produtos
          </h1>
          <p className="text-sm text-muted-foreground">Cardápio do estabelecimento.</p>
        </div>
        <Button onClick={abrirNovo} className="active:scale-95" data-testid="botao-novo-produto">
          <Plus className="mr-1.5 size-4" /> Novo Produto
        </Button>
      </div>

      {produtos.isError && <ErroAviso texto="Não foi possível carregar os produtos." />}
      {produtos.isLoading && <Loading />}

      {produtos.data && !produtos.isError && (
        <>
          {produtos.data.length === 0 ? (
            <VazioAviso texto="Nenhum produto cadastrado." />
          ) : (
            <div
              className="grid grid-cols-2 gap-4 lg:grid-cols-4"
              data-testid="grade-produtos"
            >
              {produtos.data.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col rounded-xl border border-border bg-card p-4"
                  data-testid={`produto-card-${p.id}`}
                >
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {CATEGORIA_LABEL[p.categoria] ?? p.categoria}
                  </span>
                  <p className="mt-1 font-heading text-sm font-bold">{p.nome}</p>
                  {p.descricao && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {p.descricao}
                    </p>
                  )}
                  <p className="mt-2 font-mono text-lg font-extrabold text-primary">
                    {brl(p.preco)}
                  </p>
                  <p
                    className={`mt-1 text-xs font-bold ${p.ativo ? "text-primary" : "text-destructive"}`}
                    data-testid={`produto-status-${p.id}`}
                  >
                    {p.ativo ? "Ativo" : "Inativo"} · ordem {p.ordem}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => abrirEdicao(p)}
                      data-testid={`botao-editar-produto-${p.id}`}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={alternar.isPending}
                      onClick={() => alternar.mutate({ id: p.id, ativo: !p.ativo })}
                      data-testid={`botao-alternar-produto-${p.id}`}
                    >
                      {p.ativo ? "Desativar" : "Ativar"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={excluir.isPending}
                      onClick={() => {
                        if (window.confirm(`Excluir ${p.nome}?`)) excluir.mutate(p.id);
                      }}
                      data-testid={`botao-excluir-produto-${p.id}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent data-testid="modal-produto">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl font-bold">
              {editando ? "Editar Produto" : "Novo Produto"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="p-nome">Nome *</Label>
              <Input
                id="p-nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                data-testid="input-produto-nome"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-desc">Descrição</Label>
              <Textarea
                id="p-desc"
                rows={2}
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                data-testid="input-produto-descricao"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="p-preco">Preço * (mín. R$ 0,01)</Label>
                <Input
                  id="p-preco"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={form.preco}
                  onChange={(e) => setForm({ ...form, preco: e.target.value })}
                  data-testid="input-produto-preco"
                />
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select
                  value={form.categoria}
                  onValueChange={(v: string) => setForm({ ...form, categoria: v })}
                >
                  <SelectTrigger data-testid="select-produto-categoria">
                    <SelectValue>{(v) => CATEGORIA_LABEL[v as string]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map((c) => (
                      <SelectItem key={c} value={c} data-testid={`opcao-categoria-${c}`}>
                        {CATEGORIA_LABEL[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="p-img">Imagem (URL)</Label>
                <Input
                  id="p-img"
                  value={form.imagemUrl}
                  onChange={(e) => setForm({ ...form, imagemUrl: e.target.value })}
                  data-testid="input-produto-imagem"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-ordem">Ordem de exibição</Label>
                <Input
                  id="p-ordem"
                  type="number"
                  value={form.ordem}
                  onChange={(e) => setForm({ ...form, ordem: e.target.value })}
                  data-testid="input-produto-ordem"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!form.nome.trim() || !precoValido || salvar.isPending}
              onClick={() => salvar.mutate()}
              data-testid="botao-salvar-produto"
            >
              {salvar.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
