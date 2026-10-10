import { parseAmountToCents } from "@/lib/money";

export interface CurrencyInfo {
  code: string;
  name: string;
}

/** Moedas que um projeto pode usar (mesma lista do check em project_currencies). */
export const CURRENCIES: CurrencyInfo[] = [
  { code: "BRL", name: "Real" },
  { code: "USD", name: "Dólar americano" },
  { code: "EUR", name: "Euro" },
  { code: "ARS", name: "Peso argentino" },
  { code: "CLP", name: "Peso chileno" },
  { code: "UYU", name: "Peso uruguaio" },
  { code: "GBP", name: "Libra esterlina" },
  { code: "MXN", name: "Peso mexicano" },
  { code: "COP", name: "Peso colombiano" },
  { code: "PEN", name: "Sol peruano" },
  { code: "JPY", name: "Iene" },
];

export const MAX_EXTRA_CURRENCIES = 2;

/** Casas decimais por moeda. Igual a currency_decimals() no banco. */
export function currencyDecimals(code: string): number {
  return code === "CLP" || code === "JPY" ? 0 : 2;
}

export function currencyName(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.name ?? code;
}

const RATE_SCALE = 100_000_000n; // numeric(18, 8)

/**
 * Valor na moeda da despesa (menor unidade) → centavos de real, pela cotação
 * (reais por 1 unidade). Conta em inteiros para dar exatamente o mesmo centavo
 * que a view expense_values (round do Postgres: meio centavo para cima).
 */
export function toBrlCents(amount: number, code: string, rate: number): number {
  if (code === "BRL") return amount;
  const rateScaled = BigInt(Math.round(rate * Number(RATE_SCALE)));
  const num = BigInt(amount) * rateScaled * 100n;
  const den = RATE_SCALE * 10n ** BigInt(currencyDecimals(code));
  return Number((num * 2n + den) / (2n * den));
}

/** "CLP 25.000", "US$ 10,50", "R$ 12,00" */
export function formatMoney(amount: number, code: string): string {
  const d = currencyDecimals(code);
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: code,
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(amount / 10 ** d);
}

/** Texto digitado → menor unidade da moeda; null se inválido (ex.: centavos em CLP). */
export function parseAmountMinor(input: string, code: string): number | null {
  const cents = parseAmountToCents(input);
  if (cents === null) return null;
  if (currencyDecimals(code) === 2) return cents;
  return cents % 100 === 0 ? cents / 100 : null;
}

/** Menor unidade → texto editável ("25000", "10,50"). */
export function minorToInput(amount: number, code: string): string {
  const d = currencyDecimals(code);
  return (amount / 10 ** d).toFixed(d).replace(".", ",");
}

/** Cotação digitada ("5,45", "0,0062") → número > 0 com até 8 casas; null se inválida. */
export function parseRate(input: string): number | null {
  const s = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,8})?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? n : null;
}

export function rateToInput(rate: number): string {
  return String(rate).replace(".", ",");
}
