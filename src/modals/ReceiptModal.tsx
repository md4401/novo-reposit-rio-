// Ler nota fiscal: com chave de IA no servidor, lê de verdade; sem ela, mostra um exemplo
// claramente marcado como simulação. Comprovante vinculado a uma compra só detalha (não duplica).
import { Camera, FolderCheck, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Allocation, Proposal, ReceiptItem, ReceiptReading } from "../../shared/types";
import { ModalHeader, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { category, dayLabel, formatMoney } from "../lib/format";
import { useApp } from "../state";
import { ScopeToggle } from "../components/ScopeToggle";
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
  const [scope, setScope] = useState<"personal" | "family">(me?.profile.defaultScope ?? "family");
  // A nota já guardada em Notas fiscais (uma vez por foto)
  const [stored, setStored] = useState<string | null>(null);
  const storing = useRef<Promise<string | null> | null>(null);
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
    setStored(null);
    storing.current = null;
    if (!f) return;
    if (!f.type.startsWith("image/")) return setError("Escolha uma foto (imagem).");
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function read() {
    if (!file) return;
    setBusy(true);
    setError(null);
    let image: string;
    try {
      image = await resize(file);
    } catch {
      setBusy(false);
      return setError("Não consegui abrir essa foto. Tire outra foto da nota ou escolha uma imagem JPG ou PNG.");
    }
    try {
      const result = await api<ReceiptReading>("nia/receipt", { body: { image }, silent: true });
      if (result.items.length === 0 && result.totalCents <= 0)
        setError("Não consegui ler os valores dessa nota. Tente outra foto (nota esticada, com luz) ou registre à mão.");
      setReading(result);
      // Leu: a nota já vai para o arquivo, mesmo que a compra não seja registrada agora
      void store(result).catch(() => undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const items = reading?.items ?? (example ? EXAMPLE : []);
  const total = reading?.totalCents ?? items.reduce((s, i) => s + i.amountCents, 0);
  const itemsSum = items.reduce((s, i) => s + i.amountCents, 0);

  /** Guarda a foto (e o que foi lido) em Notas fiscais. Devolve o id; não guarda duas vezes. */
  function store(read: ReceiptReading | null = reading): Promise<string | null> {
    if (!file || example) return Promise.resolve(null);
    // Já guardada ou guardando: reaproveita (tocar em "Registrar" logo depois de ler não duplica)
    storing.current ??= (async () => {
      const image = await forStorage(file);
      if (!image) throw new Error("Foto grande demais para guardar. Tire outra mais de perto.");
      const { id } = await api<{ id: string }>("receipts", {
        body: {
          image,
          merchant: read?.merchant ?? null,
          totalCents: read && read.totalCents > 0 ? read.totalCents : null,
          issuedOn: read?.occurredOn ?? null,
          items: read?.items ?? [],
        },
      });
      setStored(id);
      return id;
    })().catch((error) => {
      storing.current = null;
      throw error;
    });
    return storing.current;
  }

  async function keepOnly() {
    setBusy(true);
    try {
      await store();
      closeModal();
      toast("Nota guardada em Notas fiscais.");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function linkToMatch() {
    if (!reading?.match) return;
    setBusy(true);
    try {
      await api(`transactions/${reading.match.transactionId}`, { method: "PATCH", body: { allocations: groupByCategory(items, scope) } });
      // Itens da nota vão para a cesta da família (só se a compra for da família)
      await api(`transactions/${reading.match.transactionId}/items`, { method: "PUT", body: { items }, silent: true }).catch(() => undefined);
      const id = await store().catch(() => null);
      if (id) await api(`receipts/${id}`, { method: "PATCH", body: { transactionId: reading.match.transactionId } }).catch(() => undefined);
      closeModal();
      toast(`Compra detalhada pela nota${id ? " e nota guardada" : ""}. O total de despesas continua o mesmo.`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function createNew() {
    const receiptId = (await store().catch(() => null)) ?? undefined;
    // Vale o total da nota. Se os itens lidos não fecham o total, fica uma categoria só (a maior).
    const grouped = groupByCategory(items, scope);
    const amountCents = total > 0 ? total : itemsSum;
    const allocations =
      itemsSum === amountCents || grouped.length === 0
        ? grouped
        : [{ ...grouped.reduce((a, b) => (b.amountCents > a.amountCents ? b : a)), amountCents }];
    const proposal: Proposal = {
      description: reading?.merchant ?? (example ? "Mercado (exemplo)" : "Compra com nota fiscal"),
      amountCents,
      direction: "expense",
      occurredOn: reading?.occurredOn ?? me?.today ?? "",
      allocations,
    };
    closeModal(() => openModal(<NewTransactionModal proposal={proposal} source="receipt" receiptId={receiptId} receiptItems={example ? undefined : items} />));
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
        <div style={{ marginTop: 16, background: "var(--tint)", border: "1px solid var(--line-strong)", padding: 14, borderRadius: 12 }}>
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
          {itemsSum !== total && <div className="small" style={{ color: "var(--red)" }}>A soma dos itens ({formatMoney(itemsSum)}) não bate com o total da nota: vale o total, numa categoria só. Confira antes de salvar.</div>}
          {reading?.match && (
            <div className="small" style={{ marginTop: 8 }}>
              Encontrei a compra <b>{reading.match.description}</b> de {dayLabel(reading.match.occurredOn)} com o mesmo valor. Vincular só detalha as categorias — não cria outra despesa.
            </div>
          )}
          <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
            <span className="field-label">Quem vê os itens</span>
            <ScopeToggle value={scope} onChange={setScope} label="Quem vê os itens" />
          </div>
          {file && !example && (
            <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
              <FolderCheck size={13} style={{ verticalAlign: -2 }} /> {stored ? "Nota guardada em Notas fiscais" : "A nota fica guardada em Notas fiscais"} (só você vê).
            </p>
          )}
        </div>
      )}
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={() => closeModal()}>
          Fechar
        </button>
        {file && !example && !stored && (
          <button type="button" className="btn ghost" disabled={busy} onClick={() => void keepOnly()}>
            <FolderCheck size={15} /> Só guardar a nota
          </button>
        )}
        {reading && items.length === 0 ? (
          reading.totalCents > 0 ? (
            <button type="button" className="btn dark" onClick={() => void createNew()}>
              Registrar {formatMoney(reading.totalCents)}
            </button>
          ) : (
            <button type="button" className="btn dark" onClick={() => closeModal(() => openModal(<NewTransactionModal />))}>
              Registrar à mão
            </button>
          )
        ) : items.length > 0 ? (
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
