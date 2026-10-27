// Ler nota fiscal: com chave de IA no servidor, lê de verdade; sem ela, mostra um exemplo
// claramente marcado como simulação. Comprovante vinculado a uma compra só detalha (não duplica).
import { Camera, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Allocation, Proposal, ReceiptItem, ReceiptReading } from "../../shared/types";
import { ModalHeader, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { category, dayLabel, formatMoney } from "../lib/format";
import { useApp } from "../state";
import { NewTransactionModal } from "./NewTransactionModal";

const EXAMPLE: ReceiptItem[] = [
  { name: "Arroz 5 kg", amountCents: 2800, categoryId: "alimentacao" },
  { name: "Leite (6 un.)", amountCents: 2400, categoryId: "alimentacao" },
  { name: "Detergente", amountCents: 1550, categoryId: "limpeza" },
  { name: "Sabonete", amountCents: 1200, categoryId: "higiene" },
];

async function resize(file: File, maxSide = 1400, quality = 0.8): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

/** Versão leve para guardar (cerca de 100–300 KB). */
export async function forStorage(file: File) {
  for (const [side, q] of [[1280, 0.6], [1000, 0.5], [800, 0.45]] as const) {
    const url = await resize(file, side, q);
    if (url.length * 0.75 < 650 * 1024) return url;
  }
  return null;
}

function groupByCategory(items: ReceiptItem[], scope: "personal" | "family"): Allocation[] {
  const map = new Map<string, number>();
  for (const i of items) map.set(i.categoryId, (map.get(i.categoryId) ?? 0) + i.amountCents);
  return [...map].map(([categoryId, amountCents]) => ({ categoryId, amountCents, scope }));
}

export function ReceiptModal({ initialImage }: { initialImage?: string } = {}) {
  const { me, closeModal, openModal, toast } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [reading, setReading] = useState<ReceiptReading | null>(null);
  const [example, setExample] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<"personal" | "family">("family");
  const [keepPhoto, setKeepPhoto] = useState(true);
  const ai = Boolean(me?.aiEnabled);
  // Imagem que chegou por "Compartilhar"
  useEffect(() => {
    if (!initialImage) return;
    void fetch(initialImage)
      .then((r) => r.blob())
      .then((b) => choose(new File([b], "compartilhado.jpg", { type: b.type || "image/jpeg" })));
  }, [initialImage]);

  function choose(f: File | undefined) {
    setReading(null);
    setError(null);
    if (!f) return;
    if (!f.type.startsWith("image/")) return setError("Escolha uma foto (imagem).");
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function read() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setReading(await api<ReceiptReading>("nia/receipt", { body: { image: await resize(file) }, silent: true }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const items = reading?.items ?? (example ? EXAMPLE : []);
  const total = reading?.totalCents ?? items.reduce((s, i) => s + i.amountCents, 0);
  const itemsSum = items.reduce((s, i) => s + i.amountCents, 0);

  async function linkToMatch() {
    if (!reading?.match) return;
    setBusy(true);
    try {
      await api(`transactions/${reading.match.transactionId}`, { method: "PATCH", body: { allocations: groupByCategory(items, scope) } });
      // Itens da nota vão para a cesta da família (só se a compra for da família)
      await api(`transactions/${reading.match.transactionId}/items`, { method: "PUT", body: { items }, silent: true }).catch(() => undefined);
      const image = keepPhoto && file ? await forStorage(file) : null;
      if (image) await api("receipts", { body: { image, transactionId: reading.match.transactionId }, silent: true }).catch(() => undefined);
      closeModal();
      toast(`Compra detalhada pela nota${image ? " e foto guardada" : ""}. O total de despesas continua o mesmo.`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function createNew() {
    const receiptImage = keepPhoto && file && !example ? ((await forStorage(file)) ?? undefined) : undefined;
    const proposal: Proposal = {
      description: reading?.merchant ?? (example ? "Mercado (exemplo)" : "Compra com nota fiscal"),
      amountCents: itemsSum,
      direction: "expense",
      occurredOn: reading?.occurredOn ?? me?.today ?? "",
      allocations: groupByCategory(items, scope),
    };
    closeModal(() => openModal(<NewTransactionModal proposal={proposal} source="receipt" receiptImage={receiptImage} receiptItems={example ? undefined : items} />));
  }

  return (
    <>
      <ModalHeader title="Ler nota fiscal" subtitle="Fotografe o cupom: a Nia separa os produtos por categoria." />
      {error && <div className="form-error">{error}</div>}
      <label className="file-drop">
        <Camera size={28} />
        <span>{file ? "Trocar foto" : "Tirar foto ou escolher da galeria"}</span>
        <input ref={input} type="file" accept="image/*" capture="environment" onChange={(e) => choose(e.target.files?.[0])} />
        {preview && <img className="preview-img" src={preview} alt="Prévia da nota" />}
      </label>
      {!ai && (
        <div className="modal-note" style={{ marginTop: 12 }}>
          <b>Leitura automática desligada:</b> para ler notas de verdade, adicione a chave de IA (AI_API_KEY) nas variáveis da
          Vercel. Enquanto isso, você pode ver um <b>exemplo simulado</b> — ele não usa sua foto.
        </div>
      )}
      {items.length > 0 && (
        <div style={{ marginTop: 16, background: "#eaf7e9", border: "1px solid #d6edd6", padding: 14, borderRadius: 12 }}>
          <strong>
            <Sparkles size={14} style={{ verticalAlign: -2 }} /> {example ? "Exemplo de resultado (não foi lido da sua foto)" : `Itens lidos${reading?.merchant ? ` · ${reading.merchant}` : ""}`}
          </strong>
          <table className="mini-table" style={{ marginTop: 8 }}>
            <tbody>
              {items.map((i, n) => (
                <tr key={n}>
                  <td>{i.name}</td>
                  <td className="muted">{category(i.categoryId).name}</td>
                  <td className="num">{formatMoney(i.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontWeight: 800, marginTop: 10 }}>Total: {formatMoney(total)}</div>
          {itemsSum !== total && <div className="small" style={{ color: "#8e3f3b" }}>A soma dos itens ({formatMoney(itemsSum)}) não bate com o total da nota: confira antes de salvar.</div>}
          {reading?.match && (
            <div className="small" style={{ marginTop: 8 }}>
              Encontrei a compra <b>{reading.match.description}</b> de {dayLabel(reading.match.occurredOn)} com o mesmo valor. Vincular só detalha as categorias — não cria outra despesa.
            </div>
          )}
          <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
            <label htmlFor="r-scope">Visibilidade dos itens</label>
            <select id="r-scope" value={scope} onChange={(e) => setScope(e.target.value as "personal" | "family")}>
              <option value="family">🏠 Familiar</option>
              <option value="personal">🔒 Pessoal</option>
            </select>
          </div>
          {file && !example && (
            <label className="check-line" style={{ marginTop: 10, marginBottom: 0 }}>
              <input type="checkbox" checked={keepPhoto} onChange={(e) => setKeepPhoto(e.target.checked)} />
              <span>Guardar a foto junto com a compra (só você vê)</span>
            </label>
          )}
        </div>
      )}
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={() => closeModal()}>
          Fechar
        </button>
        {items.length > 0 ? (
          reading?.match && itemsSum === total ? (
            <button type="button" className="btn dark" disabled={busy} onClick={linkToMatch}>
              {busy && <Spinner />} Vincular à compra
            </button>
          ) : (
            <button type="button" className="btn dark" onClick={() => void createNew()}>
              Registrar compra
            </button>
          )
        ) : ai ? (
          <button type="button" className="btn dark" disabled={!file || busy} onClick={read}>
            {busy ? <Spinner /> : <Sparkles size={15} />} Ler nota com IA
          </button>
        ) : (
          <button type="button" className="btn dark" onClick={() => setExample(true)}>
            <Sparkles size={15} /> Ver exemplo simulado
          </button>
        )}
      </div>
    </>
  );
}
