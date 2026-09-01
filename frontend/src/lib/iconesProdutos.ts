// Biblioteca de imagens/ícones para os produtos do cardápio.
// Os arquivos ficam em frontend/public/marca/ e são referenciados pelo campo
// `imagemUrl` do produto — nenhuma estrutura nova de banco foi criada.

export interface IconeProduto {
  id: string;
  nome: string;
  url: string;
}

export const ICONES_PRODUTOS: IconeProduto[] = [
  { id: "pastel", nome: "Pastel", url: "/marca/pastel.jpg" },
  { id: "caldo-cana", nome: "Caldo de cana", url: "/marca/caldo-cana.jpg" },
  { id: "agua", nome: "Água", url: "/marca/agua.jpg" },
  { id: "refrigerante", nome: "Refrigerante", url: "/marca/refrigerante.jpg" },
  { id: "suco", nome: "Suco", url: "/marca/suco.jpg" },
  { id: "cafe", nome: "Café", url: "/marca/cafe.jpg" },
  { id: "salgado", nome: "Salgado", url: "/marca/salgado.jpg" },
  { id: "generico", nome: "Genérico", url: "/marca/generico.jpg" },
];

export const PLACEHOLDER_PRODUTO = "/marca/generico.jpg";

/** Ícone sugerido pela categoria, usado como placeholder quando o produto não tem imagem. */
export function iconePadraoCategoria(categoria: string): string {
  if (categoria === "pastel") return "/marca/pastel.jpg";
  if (categoria === "caldo") return "/marca/caldo-cana.jpg";
  if (categoria === "bebida") return "/marca/refrigerante.jpg";
  return PLACEHOLDER_PRODUTO;
}

/** Nunca deixa uma imagem quebrada estragar o cardápio. */
export function trocarPorPlaceholder(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  if (img.src.endsWith(PLACEHOLDER_PRODUTO)) return;
  img.src = PLACEHOLDER_PRODUTO;
}
