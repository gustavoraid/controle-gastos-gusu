/** Ícones sugeridos para projeto; qualquer outro emoji pode ser digitado. */
export const PROJECT_EMOJIS = ["🏠", "💰", "✈️", "🏖️", "🏔️", "🛒", "🚗", "👶", "🐶", "🎉", "💍", "🎄", "📚", "🌎"];

/**
 * Primeiro caractere visível do que foi digitado (um emoji pode ter vários
 * códigos: bandeiras, tons de pele, 👨‍👩‍👧). Vazio ou só espaços → null.
 */
export function firstGrapheme(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const seg = new Intl.Segmenter("pt-BR", { granularity: "grapheme" });
  for (const { segment } of seg.segment(s)) return segment;
  return null;
}
