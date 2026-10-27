// Fechamento do mês: "seu mês em 5 números" e o mesmo relatório em PDF.
import { randomBytes } from "node:crypto";
import { PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";
import { categoryName } from "../shared/categories.js";
import { formatMoney } from "../shared/money.js";
import { monthLabel, monthRange } from "../shared/time.js";
import type { MonthReport } from "../shared/types.js";
import { sha256, type SessionUser } from "./auth.js";
import { listBudgets, summarize } from "./budgets.js";
import { num, one, query } from "./db.js";
import { familyNumbers, listGoals, personalNumbers } from "./finance.js";
import { HttpError } from "./http.js";

export async function buildReport(user: SessionUser, month: string): Promise<MonthReport> {
  const { start, end } = monthRange(month);
  const [mine, family, goals, budgets, biggest] = await Promise.all([
    personalNumbers(user, month, 2),
    familyNumbers(user, month, 1),
    listGoals(user),
    listBudgets(user, month),
    query(
      `SELECT description, amount_cents, occurred_on::text AS occurred_on FROM transactions
        WHERE profile_id = $1 AND direction = 'expense' AND NOT ignored AND occurred_on >= $2 AND occurred_on < $3
        ORDER BY amount_cents DESC LIMIT 3`,
      [user.id, start, end],
    ),
  ]);
  return {
    month,
    totals: mine.totals,
    previousExpenseCents: mine.series[0]?.expenseCents ?? 0,
    categories: mine.categories.filter((c) => c.categoryId !== "_pendente").slice(0, 5),
    biggest: biggest.map((b) => ({ description: b.description as string, amountCents: num(b.amount_cents), occurredOn: b.occurred_on as string })),
    family: family.totals,
    goals: goals.map((g) => ({ name: g.name, icon: g.icon, savedCents: g.savedCents, targetCents: g.targetCents, scope: g.scope })),
    budgets: summarize([...budgets.personal, ...budgets.family]),
  };
}

/** Link curto e de uso único para baixar o PDF (no APK o download vai para o navegador). */
export async function createReportLink(user: SessionUser, month: string) {
  const token = randomBytes(24).toString("base64url");
  await query(
    `INSERT INTO download_tokens (token_hash, profile_id, kind, payload, expires_at)
     VALUES ($1, $2, 'report', $3, now() + interval '10 minutes')`,
    [sha256(token), user.id, JSON.stringify({ month })],
  );
  return `/api/report/pdf?t=${token}`;
}

export async function redeemReportLink(token: string) {
  const row = await one<{ profile_id: string; payload: { month: string } }>(
    `DELETE FROM download_tokens WHERE token_hash = $1 AND kind = 'report' AND expires_at > now() RETURNING profile_id, payload`,
    [sha256(token)],
  );
  if (!row) throw new HttpError(410, "Link vencido. Gere o relatório de novo pelo app.");
  const user = await one<SessionUser>(
    `SELECT id, household_id, name, email, role, avatar_color, timezone, digest_hour, '' AS session_id FROM profiles WHERE id = $1`,
    [row.profile_id],
  );
  if (!user) throw new HttpError(410, "Conta não encontrada");
  return { user, month: row.payload.month };
}

// As fontes padrão do PDF só têm caracteres latinos: emojis e símbolos saem do texto
const pdfText = (text: string) => text.replace(/[  ]/g, " ").replace(/[^ -~¡-ÿ]/g, "").trim();

export async function reportPdf(user: SessionUser, report: MonthReport) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.05, 0.16, 0.13);
  const muted = rgb(0.38, 0.45, 0.42);
  let y = 790;
  const line = (text: string, opts: { size?: number; font?: PDFFont; color?: typeof green; x?: number } = {}) => {
    page.drawText(pdfText(text), { x: opts.x ?? 50, y, size: opts.size ?? 11, font: opts.font ?? regular, color: opts.color ?? green });
  };
  const gap = (n: number) => (y -= n);

  line("ninho.", { size: 26, font: bold });
  gap(26);
  line(`Fechamento de ${monthLabel(report.month)} - ${user.name}`, { size: 13, color: muted });
  gap(36);

  const t = report.totals;
  const diff = report.previousExpenseCents ? Math.round(((t.expenseCents - report.previousExpenseCents) / report.previousExpenseCents) * 100) : null;
  const numbers: [string, string][] = [
    ["Entradas", formatMoney(t.incomeCents)],
    ["Gastos", formatMoney(t.expenseCents) + (diff === null ? "" : ` (${diff >= 0 ? "+" : ""}${diff}% vs. mês anterior)`)],
    ["Sobrou", formatMoney(t.balanceCents)],
    ["Maior categoria", report.categories[0] ? `${categoryName(report.categories[0].categoryId)} - ${formatMoney(report.categories[0].cents)}` : "-"],
    ["Orçamento", report.budgets.total ? `${report.budgets.total - report.budgets.over} de ${report.budgets.total} categorias dentro do limite` : "sem orçamento definido"],
  ];
  line("Seu mês em 5 números", { size: 15, font: bold });
  gap(22);
  for (const [label, value] of numbers) {
    line(label, { color: muted });
    line(value, { x: 200, font: bold });
    gap(20);
  }
  gap(14);
  line("Para onde foi o dinheiro", { size: 15, font: bold });
  gap(22);
  for (const c of report.categories) {
    line(categoryName(c.categoryId), { color: muted });
    line(formatMoney(c.cents), { x: 200 });
    gap(18);
  }
  if (report.biggest.length) {
    gap(14);
    line("Maiores gastos", { size: 15, font: bold });
    gap(22);
    for (const b of report.biggest) {
      line(`${b.occurredOn.slice(8, 10)}/${b.occurredOn.slice(5, 7)}  ${b.description.slice(0, 48)}`, { color: muted });
      line(formatMoney(b.amountCents), { x: 420 });
      gap(18);
    }
  }
  gap(14);
  line("Família (só o que foi marcado como familiar)", { size: 15, font: bold });
  gap(22);
  line(`Receitas ${formatMoney(report.family.incomeCents)}   Gastos ${formatMoney(report.family.expenseCents)}   Saldo ${formatMoney(report.family.balanceCents)}`);
  if (report.goals.length) {
    gap(32);
    line("Metas", { size: 15, font: bold });
    gap(22);
    for (const g of report.goals.slice(0, 8)) {
      const pct = Math.min(100, Math.round((g.savedCents / g.targetCents) * 100));
      line(`${g.name} (${g.scope === "family" ? "família" : "pessoal"})`, { color: muted });
      line(`${formatMoney(g.savedCents)} de ${formatMoney(g.targetCents)} - ${pct}%`, { x: 260 });
      gap(18);
    }
  }
  page.drawText(pdfText("Relatório pessoal e privado gerado pelo ninho. Valores calculados a partir dos seus lançamentos."), {
    x: 50,
    y: 40,
    size: 8,
    font: regular,
    color: muted,
  });
  return doc.save();
}
