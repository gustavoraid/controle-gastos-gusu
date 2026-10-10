const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(cents: number): string {
  return brl.format(cents / 100);
}

/**
 * Converte o que a pessoa digitou em centavos. Aceita "12", "12,5", "12,50",
 * "1.234,56", "1234.56" e "R$ 10". Devolve null se não der para entender.
 */
export function parseAmountToCents(input: string): number | null {
  let s = input.replace(/[R$\s]/g, "");
  if (!s) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // O último separador é o decimal; o outro é de milhar.
    const dec = lastComma > lastDot ? "," : ".";
    const thousands = dec === "," ? "." : ",";
    s = s.split(thousands).join("").replace(dec, ".");
  } else if (lastComma >= 0) {
    s = s.replace(/,/g, (_, i) => (i === lastComma ? "." : ""));
  } else if (lastDot >= 0 && (s.match(/\./g)?.length ?? 0) > 1) {
    // "1.234.567" só pode ser milhar.
    s = s.replace(/\./g, "");
  } else if (lastDot >= 0 && s.length - lastDot - 1 === 3) {
    // "1.234" no Brasil é mil duzentos e trinta e quatro.
    s = s.replace(".", "");
  }

  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return Number.isFinite(cents) ? cents : null;
}

/** Centavos → texto editável ("1234,50"), para preencher o campo ao editar. */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
