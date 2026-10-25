import type { ProjectType } from "@/lib/types";

/**
 * Para onde ir ao abrir o app: na tela inicial (sem rota), direto para o
 * último projeto aberto neste aparelho. Qualquer outra rota é respeitada
 * (atalhos, links). null = fica onde está.
 */
export function launchRoute(hash: string, lastProject: string | null): string | null {
  const path = hash.replace(/^#/, "");
  if ((path === "" || path === "/") && lastProject) return `/p/${lastProject}`;
  return null;
}

/** Projeto do atalho "despesa na Casa": o primeiro projeto Casa ativo (lista na ordem de criação). */
export function pickHomeProject<T extends { id: string; type: ProjectType; archived: boolean }>(projects: T[]): T | null {
  return projects.find((p) => p.type === "casa" && !p.archived) ?? null;
}
