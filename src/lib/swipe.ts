/** Distância mínima (px) para um arrasto contar como troca de mês. */
const MIN_DX = 60;
/** Faixa da borda reservada ao gesto "voltar" do Android. */
const EDGE = 24;

/**
 * Arrasto horizontal na tela: -1 = mês anterior (dedo para a direita),
 * 1 = próximo (dedo para a esquerda), 0 = não é troca de mês (curto,
 * mais vertical que horizontal — rolagem — ou começou na borda da tela).
 */
export function swipeStep(start: { x: number; y: number }, end: { x: number; y: number }, width: number): -1 | 0 | 1 {
  if (start.x < EDGE || start.x > width - EDGE) return 0;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < MIN_DX || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx > 0 ? -1 : 1;
}
