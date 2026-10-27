// Parcelar ou pagar à vista? Descobre o juro escondido no parcelado e compara com quanto o dinheiro renderia guardado.

/** Valor presente de n parcelas iguais à taxa mensal r (1ª parcela daqui a 1 mês, ou hoje se `firstNow`). */
export function presentValue(installmentCents: number, n: number, monthlyRate: number, firstNow = false) {
  let pv = 0;
  for (let k = 0; k < n; k++) pv += installmentCents / (1 + monthlyRate) ** (k + (firstNow ? 0 : 1));
  return pv;
}

/** Juro mensal embutido: a taxa que faz as parcelas valerem o preço à vista hoje (busca binária). */
export function implicitMonthlyRate(cashCents: number, installmentCents: number, n: number, firstNow = false) {
  if (installmentCents * n <= cashCents) return 0;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (presentValue(installmentCents, n, mid, firstNow) > cashCents) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export type InstallmentVerdict = {
  totalCents: number;
  extraCents: number;
  /** Juro escondido ao mês e ao ano (em fração: 0.02 = 2%) */
  monthlyRate: number;
  yearlyRate: number;
  /** Quanto as parcelas "custam hoje" se o dinheiro rendesse a taxa informada */
  presentValueCents: number;
  best: "vista" | "parcelado" | "empate";
};

export function compareInstallments(cashCents: number, installmentCents: number, n: number, savingsMonthlyRate: number, firstNow = false): InstallmentVerdict {
  const monthlyRate = implicitMonthlyRate(cashCents, installmentCents, n, firstNow);
  const pv = Math.round(presentValue(installmentCents, n, savingsMonthlyRate, firstNow));
  const diff = pv - cashCents;
  return {
    totalCents: installmentCents * n,
    extraCents: installmentCents * n - cashCents,
    monthlyRate,
    yearlyRate: (1 + monthlyRate) ** 12 - 1,
    presentValueCents: pv,
    best: Math.abs(diff) < Math.max(100, cashCents * 0.005) ? "empate" : diff > 0 ? "vista" : "parcelado",
  };
}

/** Aposentadoria/objetivo: quanto guardar por mês para juntar `targetCents` em `months` meses a uma taxa real mensal. */
export function monthlyToReach(targetCents: number, months: number, monthlyRate: number, alreadyCents = 0) {
  if (months <= 0) return Math.max(0, targetCents - alreadyCents);
  const grown = alreadyCents * (1 + monthlyRate) ** months;
  const missing = Math.max(0, targetCents - grown);
  if (monthlyRate === 0) return Math.ceil(missing / months);
  return Math.ceil((missing * monthlyRate) / ((1 + monthlyRate) ** months - 1));
}
