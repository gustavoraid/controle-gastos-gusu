/** Como o app chama cada pessoa: sempre as duas primeiras letras (Gu, Su), nunca "Eu"/"Você". */
export function shortName(displayName: string | null | undefined): string {
  const n = (displayName ?? "").trim();
  return n ? [...n].slice(0, 2).join("") : "?";
}
