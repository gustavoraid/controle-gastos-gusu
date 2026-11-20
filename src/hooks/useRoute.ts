import { useEffect, useState } from "react";

/** Roteamento por hash (#/p/123): funciona em qualquer hospedagem estática, sem 404. */
export function useRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const [path, query = ""] = hash.replace(/^#/, "").split("?");
  return {
    parts: path.split("/").filter(Boolean),
    params: new URLSearchParams(query),
  };
}

/**
 * Posição da entrada atual dentro da navegação do app, guardada no `history.state`.
 * 0 = primeira tela aberta (ou entrada de fora do app): não há para onde voltar.
 * Não dá para usar `history.length`: ele conta também as entradas "para frente"
 * (depois de um voltar) e as de antes do app, e aí `history.back()` não faz nada.
 */
function depth(): number {
  const s = window.history.state as { depth?: unknown } | null;
  return s && typeof s.depth === "number" ? s.depth : 0;
}

export function go(path: string, opts: { replace?: boolean } = {}) {
  const d = depth();
  // Navegação só de hash é síncrona: logo depois, a entrada atual já é a nova.
  if (opts.replace) window.location.replace(`#${path}`);
  else window.location.hash = path;
  window.history.replaceState({ depth: opts.replace ? d : d + 1 }, "");
}

export function back(fallback: string) {
  if (depth() > 0) window.history.back();
  else go(fallback, { replace: true });
}
