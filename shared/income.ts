// Renda variável: um "salário para si mesmo" que cabe até nos meses fracos,
// guardando a sobra dos meses bons num colchão.

/** Sugestão: o valor que a renda alcançou em pelo menos 3 de cada 4 meses (arredondado para baixo, de R$ 50 em R$ 50). */
export function suggestSalary(monthlyIncomes: number[]): number | null {
  const months = monthlyIncomes.filter((c) => c > 0).sort((a, b) => a - b);
  if (months.length < 3) return null;
  const index = Math.floor((months.length - 1) * 0.25);
  return Math.floor(months[index] / 5000) * 5000;
}

/** Simula o colchão: a sobra entra, a falta sai. */
export function bufferPath(monthlyIncomes: { month: string; cents: number }[], salaryCents: number) {
  let buffer = 0;
  return monthlyIncomes.map((m) => {
    buffer += m.cents - salaryCents;
    return { month: m.month, incomeCents: m.cents, diffCents: m.cents - salaryCents, bufferCents: buffer };
  });
}
