// Leitura de extratos CSV (vários bancos) e OFX. Funções puras: testadas em tests/importers.test.ts.
import { createHash } from "node:crypto";
import { parseMoney } from "../shared/money.js";
import { stripAccents } from "../shared/merchant.js";
import { isDateKey } from "../shared/time.js";

export type ParsedRow = {
  occurredOn: string;
  description: string;
  /** positivo = entrou dinheiro; negativo = saiu (convenção de conta corrente) */
  signedCents: number;
  externalId: string;
};

export class ImportError extends Error {}

export function detectFormat(fileName: string, content: string): "csv" | "ofx" {
  if (/\.ofx$/i.test(fileName) || /<OFX>|OFXHEADER/i.test(content.slice(0, 2000))) return "ofx";
  return "csv";
}

/** "26/10/2026", "26/10/26", "2026-10-26", "26-10-2026", "20261026" → "2026-10-26" */
export function parseDate(text: string): string | null {
  const t = text.trim().replace(/^"|"$/g, "");
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return valid(`${m[1]}-${m[2]}-${m[3]}`);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(t);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return valid(`${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`);
  }
  m = /^(\d{4})(\d{2})(\d{2})/.exec(t);
  if (m) return valid(`${m[1]}-${m[2]}-${m[3]}`);
  return null;
}

function valid(key: string) {
  return isDateKey(key) ? key : null;
}

function hashId(parts: (string | number)[]) {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 24);
}

/** Linhas idênticas no mesmo arquivo (duas compras iguais no mesmo dia) ganham ids diferentes. */
function withStableIds(rows: Omit<ParsedRow, "externalId">[]): ParsedRow[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = `${r.occurredOn}|${r.description.toLowerCase()}|${r.signedCents}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { ...r, externalId: `csv:${hashId([base, n])}` };
  });
}

function splitLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else current += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      cells.push(current.trim());
      current = "";
    } else current += ch;
  }
  cells.push(current.trim());
  return cells;
}

const DATE_HEADERS = /^(data|date|dt|data lancamento|data da compra|data de lancamento|data movimento|dia)$/;
const DESC_HEADERS = /(descri|historic|title|titulo|lancamento|estabelecimento|memo|detalhe|identificador|nome)/;
const AMOUNT_HEADERS = /^(valor|amount|quantia|value|valor \(r\$\)|valor r\$|valor em r\$|montante)$/;
const DEBIT_HEADERS = /(debito|saida|saidas|debit)/;
const CREDIT_HEADERS = /(credito|entrada|entradas|credit)/;

export function parseCsv(content: string): ParsedRow[] {
  const lines = content.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new ImportError("O arquivo está vazio ou tem só o cabeçalho.");

  // O cabeçalho pode não ser a primeira linha (alguns bancos põem saldo/agência antes).
  let headerIndex = -1;
  let delimiter = ",";
  let header: string[] = [];
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    for (const d of [";", ",", "\t"]) {
      const cells = splitLine(lines[i], d).map((c) => stripAccents(c.toLowerCase()).trim());
      if (cells.length >= 2 && cells.some((c) => DATE_HEADERS.test(c)) && cells.some((c) => AMOUNT_HEADERS.test(c) || DEBIT_HEADERS.test(c))) {
        headerIndex = i;
        delimiter = d;
        header = cells;
        break;
      }
    }
    if (headerIndex >= 0) break;
  }
  if (headerIndex < 0) {
    throw new ImportError("Não encontrei as colunas de data e valor. O CSV precisa ter cabeçalho com “Data” e “Valor”.");
  }

  const dateCol = header.findIndex((c) => DATE_HEADERS.test(c));
  const amountCol = header.findIndex((c) => AMOUNT_HEADERS.test(c));
  const debitCol = amountCol < 0 ? header.findIndex((c) => DEBIT_HEADERS.test(c)) : -1;
  const creditCol = amountCol < 0 ? header.findIndex((c) => CREDIT_HEADERS.test(c)) : -1;
  const descCols = header.map((c, i) => (DESC_HEADERS.test(c) && i !== dateCol ? i : -1)).filter((i) => i >= 0);

  const rows: Omit<ParsedRow, "externalId">[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    const cells = splitLine(line, delimiter);
    const occurredOn = parseDate(cells[dateCol] ?? "");
    if (!occurredOn) continue; // linhas de saldo, totais, rodapé
    let signed: number | null;
    if (amountCol >= 0) {
      signed = parseMoney(cells[amountCol] ?? "");
    } else {
      const debit = parseMoney(cells[debitCol] ?? "") ?? 0;
      const credit = parseMoney(cells[creditCol] ?? "") ?? 0;
      signed = credit - Math.abs(debit);
    }
    if (signed === null || signed === 0) continue;
    const description =
      descCols
        .map((i) => cells[i] ?? "")
        .filter(Boolean)
        .join(" - ")
        .replace(/\s+/g, " ")
        .trim() || "Sem descrição";
    if (/^saldo\b/i.test(stripAccents(description))) continue;
    rows.push({ occurredOn, description: description.slice(0, 200), signedCents: signed });
  }
  if (rows.length === 0) throw new ImportError("Nenhuma movimentação válida encontrada no arquivo.");
  return withStableIds(rows);
}

function ofxTag(block: string, tag: string) {
  const m = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i").exec(block);
  return m ? m[1].trim() : "";
}

function decodeEntities(text: string) {
  return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

export function parseOfx(content: string): ParsedRow[] {
  const blocks = content.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>/i)[0]);
  if (blocks.length === 0) throw new ImportError("Arquivo OFX sem movimentações (<STMTTRN>).");
  const rows: ParsedRow[] = [];
  const seen = new Map<string, number>();
  for (const block of blocks) {
    const occurredOn = parseDate(ofxTag(block, "DTPOSTED"));
    const signed = parseMoney(ofxTag(block, "TRNAMT"));
    if (!occurredOn || signed === null || signed === 0) continue;
    const name = decodeEntities(ofxTag(block, "NAME"));
    const memo = decodeEntities(ofxTag(block, "MEMO"));
    const description = (name && memo && !memo.includes(name) ? `${name} - ${memo}` : memo || name || "Sem descrição")
      .replace(/\s+/g, " ")
      .slice(0, 200);
    const fitid = ofxTag(block, "FITID");
    let externalId: string;
    if (fitid) {
      externalId = `ofx:${fitid}`;
      const n = (seen.get(externalId) ?? 0) + 1;
      seen.set(externalId, n);
      if (n > 1) externalId += `:${n}`;
    } else {
      externalId = `ofx:${hashId([occurredOn, description, signed, rows.length])}`;
    }
    rows.push({ occurredOn, description, signedCents: signed, externalId });
  }
  if (rows.length === 0) throw new ImportError("Nenhuma movimentação válida encontrada no OFX.");
  return rows;
}

export function parseStatement(fileName: string, content: string) {
  const format = detectFormat(fileName, content);
  return { format, rows: format === "ofx" ? parseOfx(content) : parseCsv(content) };
}
