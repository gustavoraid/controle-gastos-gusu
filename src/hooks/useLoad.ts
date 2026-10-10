import { useCallback, useEffect, useRef, useState } from "react";

/** Carrega dados assíncronos; reload() busca de novo sem piscar a tela. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const reload = useCallback(() => {
    const id = ++seq.current;
    fn().then(
      (d) => {
        if (id === seq.current) {
          setData(d);
          setError(null);
        }
      },
      (e: Error) => {
        if (id === seq.current) setError(e.message);
      },
    );
  }, deps);

  useEffect(() => {
    setData(null);
    reload();
  }, [reload]);

  return { data, error, reload };
}
