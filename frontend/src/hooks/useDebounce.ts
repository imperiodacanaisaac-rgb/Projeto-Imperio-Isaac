import { useEffect, useState } from "react";

/**
 * Atrasa a propagação de um valor que muda a cada tecla/clique.
 *
 * Campos de filtro entram na queryKey do TanStack Query, então sem isso cada caractere
 * digitado dispara uma requisição — e no Firestore cada requisição custa leituras da
 * cota diária. Com o atraso, a busca sai uma vez, quando a pessoa para de digitar.
 */
export function useDebounce<T>(valor: T, atrasoMs = 400): T {
  const [atrasado, setAtrasado] = useState(valor);

  useEffect(() => {
    const t = setTimeout(() => setAtrasado(valor), atrasoMs);
    return () => clearTimeout(t);
  }, [valor, atrasoMs]);

  return atrasado;
}
