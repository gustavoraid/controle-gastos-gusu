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

export function go(path: string, opts: { replace?: boolean } = {}) {
  const target = `#${path}`;
  if (opts.replace) window.location.replace(target);
  else window.location.hash = path;
}

export function back(fallback: string) {
  if (window.history.length > 1) window.history.back();
  else go(fallback, { replace: true });
}
