// Garantias, seguros, contratos e documentos, com aviso antes de vencer.
import { Camera, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { DocumentItem } from "../../shared/types";
import { Empty, ErrorBox, Heading, ModalHeader, Panel, Skeleton, Spinner } from "../components/ui";
import { api, apiBlobUrl } from "../lib/api";
import { dayLabel } from "../lib/format";
import { useData } from "../lib/useData";
import { forStorage } from "../modals/ReceiptModal";
import { useApp } from "../state";

const KINDS: [DocumentItem["kind"], string, string][] = [
  ["garantia", "🧾", "Garantia"],
  ["seguro", "🛡️", "Seguro"],
  ["contrato", "📝", "Contrato"],
  ["documento", "🪪", "Documento (CNH, RG, passaporte)"],
  ["outro", "📄", "Outro"],
];
const kindOf = (k: DocumentItem["kind"]) => KINDS.find((x) => x[0] === k)!;

function DocumentModal({ doc }: { doc?: DocumentItem }) {
  const { toast, closeModal } = useApp();
  const [name, setName] = useState(doc?.name ?? "");
  const [kind, setKind] = useState<DocumentItem["kind"]>(doc?.kind ?? "garantia");
  const [expiresOn, setExpiresOn] = useState(doc?.expiresOn ?? "");
  const [remindDays, setRemindDays] = useState(doc?.remindDays ?? 30);
  const [notes, setNotes] = useState(doc?.notes ?? "");
  const [shared, setShared] = useState(doc?.shared ?? false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const image = file ? await forStorage(file) : null;
      if (file && !image) throw new Error("Não consegui reduzir a foto. Tente outra.");
      const body = { name, kind, expiresOn: expiresOn || null, remindDays, notes: notes || undefined, shared, image };
      await api(doc ? `documents/${doc.id}` : "documents", { body, method: doc ? "PATCH" : "POST" });
      toast(expiresOn ? `Guardado. Aviso ${remindDays} dias antes de vencer.` : "Guardado.");
      closeModal();
    } catch (err) {
      toast((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <ModalHeader title={doc ? "Editar" : "Guardar documento"} subtitle="Garantia da geladeira, apólice do seguro, contrato do aluguel…" />
      <div className="field">
        <label htmlFor="dc-name">Nome</label>
        <input id="dc-name" required maxLength={80} placeholder="Ex.: Geladeira Brastemp" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid-even" style={{ gap: 10, marginTop: 0 }}>
        <div className="field">
          <label htmlFor="dc-kind">Tipo</label>
          <select id="dc-kind" value={kind} onChange={(e) => setKind(e.target.value as DocumentItem["kind"])}>
            {KINDS.map(([k, icon, label]) => (
              <option key={k} value={k}>
                {icon} {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="dc-exp">{kind === "garantia" ? "Garantia até" : "Vence em"}</label>
          <input id="dc-exp" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="dc-remind">Avisar antes</label>
        <select id="dc-remind" value={remindDays} onChange={(e) => setRemindDays(Number(e.target.value))}>
          {[7, 15, 30, 60, 90].map((d) => (
            <option key={d} value={d}>
              {d} dias
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="dc-notes">Observações</label>
        <input id="dc-notes" maxLength={500} placeholder="Ex.: nota no e-mail, apólice nº…" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <label className="file-drop" style={{ minHeight: 90 }}>
        <Camera size={22} />
        <span>{file ? file.name : doc?.hasImage ? "Trocar foto" : "Foto (opcional)"}</span>
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <label className="check-line" style={{ marginTop: 10 }}>
        <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
        <span>A família pode ver (ex.: garantia de algo da casa)</span>
      </label>
      <div className="modal-actions">
        <button type="submit" className="btn dark" disabled={busy}>
          {busy && <Spinner />} Salvar
        </button>
      </div>
    </form>
  );
}

function ImageView({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let local: string | null = null;
    apiBlobUrl(`documents/${id}/image`).then((u) => setUrl((local = u)), () => setUrl(null));
    return () => {
      if (local) URL.revokeObjectURL(local);
    };
  }, [id]);
  return url ? <img src={url} alt="Foto do documento" style={{ maxWidth: "100%", borderRadius: 12 }} /> : <Spinner />;
}

export function DocumentsPage() {
  const { openModal, toast } = useApp();
  const { data, error, reload } = useData<DocumentItem[]>("documents");
  return (
    <>
      <Heading
        title="Documentos e garantias"
        subtitle="Tudo num lugar só, com aviso antes de vencer. Por padrão só você vê; marque o que a família pode ver."
        actions={
          <button type="button" className="btn dark" onClick={() => openModal(<DocumentModal />)}>
            <Plus size={15} /> Guardar
          </button>
        }
      />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? (
        <Skeleton />
      ) : data.length === 0 ? (
        <Panel>
          <Empty icon="🗂️" title="Nada guardado ainda" text="Comece pela garantia dos eletrodomésticos e pelo seguro do carro ou da casa." />
        </Panel>
      ) : (
        <Panel>
          {data.map((d) => (
            <div key={d.id} className="setting-row">
              <div style={{ minWidth: 0 }}>
                <h4>
                  {kindOf(d.kind)[1]} {d.name}
                </h4>
                <p className={d.daysLeft !== null && d.daysLeft <= d.remindDays ? "down" : undefined}>
                  {d.expiresOn ? `${d.daysLeft! < 0 ? "venceu" : d.kind === "garantia" ? "garantia até" : "vence"} ${dayLabel(d.expiresOn)}` : "sem validade"}
                  {d.shared ? " · família vê" : ""}
                  {!d.isMine ? ` · de ${d.owner}` : ""}
                  {d.notes ? ` · ${d.notes}` : ""}
                </p>
              </div>
              <div className="row" style={{ gap: 6 }}>
                {d.hasImage && (
                  <button type="button" className="btn ghost small" onClick={() => openModal(<ImageView id={d.id} />)}>
                    Foto
                  </button>
                )}
                {d.isMine && (
                  <>
                    <button type="button" className="btn ghost small" onClick={() => openModal(<DocumentModal doc={d} />)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn ghost small danger-text"
                      aria-label="Apagar"
                      onClick={() =>
                        window.confirm(`Apagar ${d.name}?`) &&
                        void api(`documents/${d.id}`, { method: "DELETE" }).then(() => toast("Apagado."), (e: Error) => toast(e.message))
                      }
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </Panel>
      )}
    </>
  );
}
