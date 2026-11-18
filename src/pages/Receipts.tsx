// Notas fiscais: todas as notas que a pessoa fotografou, mandou para a Nia ou compartilhou com o
// ninho ficam guardadas aqui (foto + o que foi lido). Só a própria pessoa vê.
import { Camera, FileText, Link2, Receipt as ReceiptIcon, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Proposal, StoredReceipt } from "../../shared/types";
import { Empty, ErrorBox, Heading, ModalHeader, Money, Skeleton } from "../components/ui";
import { api, apiBlobUrl } from "../lib/api";
import { category, dayLabel, formatMoney, monthLabel } from "../lib/format";
import { useData } from "../lib/useData";
import { NewTransactionModal } from "../modals/NewTransactionModal";
import { ReceiptModal } from "../modals/ReceiptModal";
import { useApp } from "../state";

const day = (r: StoredReceipt) => r.issuedOn ?? r.createdAt.slice(0, 10);

/** Foto da nota, baixada só quando aparece na tela. */
function ReceiptPhoto({ id, className }: { id: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let local: string | null = null;
    let alive = true;
    const load = () =>
      apiBlobUrl(`receipts/${id}`)
        .then((u) => (alive ? setUrl((local = u)) : URL.revokeObjectURL(u)))
        .catch(() => alive && setFailed(true));
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") void load();
    else {
      const seen = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          seen.disconnect();
          void load();
        }
      });
      seen.observe(el);
      return () => {
        alive = false;
        seen.disconnect();
        if (local) URL.revokeObjectURL(local);
      };
    }
    return () => {
      alive = false;
      if (local) URL.revokeObjectURL(local);
    };
  }, [id]);
  return (
    <div ref={box} className={`receipt-photo ${className ?? ""}`}>
      {url ? <img src={url} alt="Foto da nota fiscal" /> : failed ? <FileText size={22} /> : <div className="skeleton" />}
    </div>
  );
}

function ReceiptDetail({ receipt, onChanged }: { receipt: StoredReceipt; onChanged: () => void }) {
  const { me, closeModal, openModal, toast, confirm } = useApp();
  const items = receipt.items;

  function register() {
    const total = receipt.totalCents ?? items.reduce((s, i) => s + i.amountCents, 0);
    const byCategory = new Map<string, number>();
    for (const i of items) byCategory.set(i.categoryId, (byCategory.get(i.categoryId) ?? 0) + i.amountCents);
    const sum = items.reduce((s, i) => s + i.amountCents, 0);
    const scope = me?.profile.defaultScope ?? "personal";
    const grouped = [...byCategory].map(([categoryId, amountCents]) => ({ categoryId, amountCents, scope }));
    const allocations = sum === total || grouped.length === 0 ? grouped : [{ ...grouped.reduce((a, b) => (b.amountCents > a.amountCents ? b : a)), amountCents: total }];
    const proposal: Proposal = {
      description: receipt.merchant ?? "Compra com nota fiscal",
      amountCents: total,
      direction: "expense",
      occurredOn: receipt.issuedOn ?? me?.today ?? "",
      allocations,
    };
    closeModal(() => openModal(<NewTransactionModal proposal={proposal} source="receipt" receiptId={receipt.id} receiptItems={items.length ? items : undefined} />));
  }

  async function remove() {
    const ok = await confirm({
      title: "Apagar esta nota?",
      text: receipt.transaction ? "A compra continua lançada; só a nota e a foto saem." : "A foto e o que foi lido dela saem do ninho.",
      confirmLabel: "Apagar",
      danger: true,
    });
    if (!ok) return;
    await api(`receipts/${receipt.id}`, { method: "DELETE" });
    onChanged();
    closeModal();
    toast("Nota apagada.");
  }

  return (
    <>
      <ModalHeader title={receipt.merchant ?? "Nota fiscal"} subtitle={`${dayLabel(day(receipt))}${receipt.totalCents !== null ? ` · ${formatMoney(receipt.totalCents)}` : ""}`} />
      <ReceiptPhoto id={receipt.id} className="large" />
      {items.length > 0 && (
        <table className="mini-table" style={{ marginTop: 14 }}>
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
      )}
      <div className="modal-note" style={{ marginTop: 14 }}>
        {receipt.transaction ? (
          <>
            <Link2 size={13} style={{ verticalAlign: -2 }} /> Ligada à compra <b>{receipt.transaction.description}</b> de {dayLabel(receipt.transaction.occurredOn)} (
            {formatMoney(receipt.transaction.amountCents)}).
          </>
        ) : (
          "Esta nota ainda não virou um lançamento. Registre a compra para ela contar nos seus gastos."
        )}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn ghost danger-text" onClick={() => void remove()}>
          <Trash2 size={14} /> Apagar
        </button>
        {!receipt.transaction && (
          <button type="button" className="btn dark" onClick={register}>
            Registrar compra
          </button>
        )}
      </div>
    </>
  );
}

export function ReceiptsPage() {
  const { openModal } = useApp();
  const { data, error, reload } = useData<StoredReceipt[]>("receipts");
  const [search, setSearch] = useState("");

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (data ?? []).filter(
      (r) => !q || (r.merchant ?? "").toLowerCase().includes(q) || r.items.some((i) => i.name.toLowerCase().includes(q)),
    );
    const byMonth = new Map<string, StoredReceipt[]>();
    for (const r of list) byMonth.set(day(r).slice(0, 7), [...(byMonth.get(day(r).slice(0, 7)) ?? []), r]);
    return [...byMonth];
  }, [data, search]);

  const newReceipt = () => openModal(<ReceiptModal />);

  return (
    <>
      <Heading
        title="Notas fiscais"
        subtitle="Toda nota que você fotografa, manda para a Nia ou compartilha com o ninho fica guardada aqui. Só você vê."
        actions={
          <button type="button" className="btn dark" onClick={newReceipt}>
            <Camera size={15} /> Guardar nota
          </button>
        }
      />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? (
        <Skeleton height={280} />
      ) : data.length === 0 ? (
        <div className="list-box">
          <Empty
            icon={<ReceiptIcon size={24} />}
            title="Nenhuma nota guardada ainda"
            text="Tire uma foto do cupom ou mande para a Nia: a nota fica guardada aqui, com a loja, a data, o total e os itens."
            action={
              <button type="button" className="btn dark small" onClick={newReceipt}>
                <Camera size={14} /> Guardar a primeira nota
              </button>
            }
          />
        </div>
      ) : (
        <>
          <div className="search-wrap" style={{ marginBottom: 16 }}>
            <Search size={17} />
            <input className="search" type="search" placeholder="Buscar loja ou produto…" aria-label="Buscar notas" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {groups.length === 0 && <p className="muted">Nenhuma nota com “{search}”.</p>}
          {groups.map(([month, list]) => (
            <section key={month} className="receipt-month">
              <div className="day-label">
                {monthLabel(month)} · {list.length} nota{list.length === 1 ? "" : "s"}
                {list.some((r) => r.totalCents !== null) && (
                  <>
                    {" "}
                    · <Money cents={list.reduce((s, r) => s + (r.totalCents ?? 0), 0)} />
                  </>
                )}
              </div>
              <div className="receipt-grid">
                {list.map((r) => (
                  <button key={r.id} type="button" className="receipt-card" onClick={() => openModal(<ReceiptDetail receipt={r} onChanged={reload} />)}>
                    <ReceiptPhoto id={r.id} />
                    <span className="receipt-card-text">
                      <b>{r.merchant ?? "Nota sem nome"}</b>
                      <small>
                        {dayLabel(day(r))}
                        {r.totalCents !== null ? ` · ${formatMoney(r.totalCents)}` : ""}
                      </small>
                      <span className={`chip ${r.transaction ? "lime" : "gray"}`}>{r.transaction ? "Compra lançada" : "Só guardada"}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}
