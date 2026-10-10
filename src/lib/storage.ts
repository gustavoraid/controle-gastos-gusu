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
