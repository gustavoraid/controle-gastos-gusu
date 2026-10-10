import { useEffect, useRef } from "react";
import { useLoad } from "@/hooks/useLoad";
import { getBalances, getProject, subscribeProject } from "@/lib/api";

/** Projeto + membros + categorias + saldos, atualizando sozinho via tempo real. */
export function useProject(projectId: string, onRemoteChange?: () => void) {
  const state = useLoad(async () => {
    const [meta, balances] = await Promise.all([getProject(projectId), getBalances(projectId)]);
    return { ...meta, balances };
  }, [projectId]);

  // Ref para o canal não precisar ser recriado quando o callback muda (ex.: troca de mês).
  const onChange = useRef(onRemoteChange);
  onChange.current = onRemoteChange;

  const { reload } = state;
  useEffect(
    () =>
      subscribeProject(projectId, () => {
        reload();
        onChange.current?.();
      }),
    [projectId, reload],
  );

  // No celular o socket do tempo real cai com o app em segundo plano (e exclusões
  // não chegam por ele com filtro); ao voltar para o app, busca tudo de novo.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      reload();
      onChange.current?.();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  return state;
}
