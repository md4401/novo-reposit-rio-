// Cesta da família: junta o mesmo produto escrito de jeitos diferentes nas notas
// ("ARROZ TIO JOAO 5KG", "Arroz Tio João 5 kg") para comparar o preço ao longo do tempo.

const UNIT = /^(\d+(?:[.,]\d+)?)\s*(kg|g|gr|l|lt|ml|un|und)$/;

export function productKey(name: string) {
  const words = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // "5 kg" -> "5kg"
    .replace(/(\d)\s+(kg|g|gr|l|lt|ml|un|und)\b/g, "$1$2")
    .replace(/[^a-z0-9.,]+/g, " ")
    .split(" ")
    .map((w) => w.replace(/^[.,]+|[.,]+$/g, ""))
    // códigos de barras/produto não ajudam a agrupar
    .filter((w) => w.length > 0 && !/^\d{5,}$/.test(w))
    .map((w) => {
      const unit = UNIT.exec(w);
      if (!unit) return w;
      const unitName = unit[2] === "gr" ? "g" : unit[2] === "lt" ? "l" : unit[2] === "und" ? "un" : unit[2];
      return `${unit[1].replace(",", ".")}${unitName}`;
    });
  return words.slice(0, 5).join(" ");
}

export type PricePoint = { month: string; avgCents: number; count: number };

/** Variação entre o primeiro e o último mês com compra (em pontos-base: 1250 = +12,5%). */
export function priceChangeBp(points: PricePoint[]) {
  if (points.length < 2) return null;
  const first = points[0].avgCents;
  const last = points[points.length - 1].avgCents;
  if (first <= 0) return null;
  return Math.round(((last - first) * 10000) / first);
}
