import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { getList, subscribeList, type ListSummary } from "@/lib/api";
import { applyOps, type ListItem } from "@/lib/lists";
import { opsFor, queueState, subscribeQueue } from "@/lib/listQueue";

/**
 * Lista + itens como aparecem na tela: servidor + fila do aparelho por cima.
 * Recarrega com o tempo real, ao voltar para o app e quando a fila confirma algo.
 */
export function useList(listId: string) {
  const [server, setServer] = useState<{ list: ListSummary; items: ListItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Início da última carga concluída: confirmações anteriores a ela já estão no servidor.
  const [since, setSince] = useState(0);
  const seq = useRef(0);
  const [, rerender] = useReducer((x: number) => x + 1, 0);

  const reload = useCallback(() => {
    const id = ++seq.current;
    const started = Date.now();
    getList(listId).then(
      (d) => {
        if (id !== seq.current) return;
        setServer(d);
        setSince(started);
        setError(null);
      },
      (e: Error) => {
        if (id === seq.current) setError(e.message);
      },
    );
  }, [listId]);

  useEffect(() => {
    setServer(null);
    reload();
  }, [reload]);

  useEffect(() => subscribeList(listId, reload), [listId, reload]);

  // Fila mudou: redesenha já; se algo foi confirmado, busca o servidor logo depois.
  useEffect(() => {
    let last = queueState().pending;
    let t: ReturnType<typeof setTimeout> | null = null;
    const off = subscribeQueue(() => {
      rerender();
      const now = queueState().pending;
      if (now < last) {
        if (t) clearTimeout(t);
        t = setTimeout(reload, 400);
      }
      last = now;
    });
    return () => {
      off();
      if (t) clearTimeout(t);
    };
  }, [reload]);

  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  const items = server ? applyOps(server.items, opsFor(listId, since)) : null;
  return { list: server?.list ?? null, items, error, reload, sync: queueState() };
}
