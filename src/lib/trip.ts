/** Dias de viagem digitados nos ajustes: inteiro de 1 a 366, ou null se vazio/inválido. */
export function parseTripDays(input: string): number | null {
  const t = input.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= 366 ? n : null;
}

/** Valor por dia em centavos, arredondado ao centavo mais próximo. */
export function perDayCents(cents: number, days: number): number {
  return Math.round(cents / days);
}
