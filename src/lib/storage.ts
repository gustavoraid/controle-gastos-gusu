// Preferências locais do aparelho. Podem sumir (aba anônima, dados limpos) e
// o app tem que funcionar sem elas.

const LAST_PROJECT = "gc:ultimoProjeto";

export function getLastProject(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT);
  } catch {
    return null;
  }
}

export function setLastProject(id: string) {
  try {
    localStorage.setItem(LAST_PROJECT, id);
  } catch {
    /* ignora */
  }
}

const FEED_SEEN = "gc:atividadesVistas";

/** Momento (ms) da última visita à tela Atividades neste aparelho. */
export function getFeedSeen(): number | null {
  try {
    const v = localStorage.getItem(FEED_SEEN);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

export function setFeedSeen(ms: number) {
  try {
    localStorage.setItem(FEED_SEEN, String(ms));
  } catch {
    /* ignora */
  }
}

const VIEW_MONTH = "gc:mesNaTela:";

/**
 * Mês que a tela do projeto está mostrando (só nesta sessão do app): voltar de
 * uma despesa não pula para o mês atual, e salvar uma despesa abre o mês dela.
 */
export function getViewMonth(projectId: string): string | null {
  try {
    return sessionStorage.getItem(VIEW_MONTH + projectId);
  } catch {
    return null;
  }
}

export function setViewMonth(projectId: string, month: string) {
  try {
    sessionStorage.setItem(VIEW_MONTH + projectId, month);
  } catch {
    /* ignora */
  }
}
