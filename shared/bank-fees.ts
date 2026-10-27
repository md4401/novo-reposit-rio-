// Quanto os bancos custaram: tarifas, juros, IOF, anuidade e multas, reconhecidos pela descrição do extrato.

export type FeeKind = "tarifa" | "juros" | "iof" | "anuidade" | "multa";

export const FEE_LABEL: Record<FeeKind, string> = {
  tarifa: "Tarifas e pacotes",
  juros: "Juros (cheque especial, rotativo, atraso)",
  iof: "IOF",
  anuidade: "Anuidade do cartão",
  multa: "Multas e encargos",
};

const RULES: [FeeKind, RegExp][] = [
  ["iof", /\biof\b/],
  ["anuidade", /\banuidade\b/],
  ["juros", /\bjuros\b|\brotativo\b|cheque especial|limite da conta|encargos? (de )?financ|\bmora\b/],
  ["multa", /\bmulta\b|\bencargos?\b/],
  ["tarifa", /\btarifa|\bpacote de servicos|\bcesta de servicos|\bmensalidade (do )?pacote|\btar\.? |\btaxa de (manutencao|saque|ted|doc|transferencia)|\bmanutencao de conta/],
];

export function feeKind(description: string): FeeKind | null {
  const text = ` ${description
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()} `;
  // Estornos e rendimentos não são custo
  if (/estorno|devolucao|rendimento|cashback/.test(text)) return null;
  for (const [kind, re] of RULES) if (re.test(text)) return kind;
  return null;
}
