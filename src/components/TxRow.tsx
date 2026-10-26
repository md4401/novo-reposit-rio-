import type { Transaction } from "../../shared/types";
import { dayLabel, scopeLabel, txCategoryLabel, txIcon, txScope } from "../lib/format";
import { OrganizeModal } from "../modals/OrganizeModal";
import { useApp } from "../state";
import { Money, StatusChip } from "./ui";

export function TxRow({ t, showDate = true }: { t: Transaction; showDate?: boolean }) {
  const { openModal } = useApp();
  const meta = [showDate ? dayLabel(t.occurredOn) : null, txCategoryLabel(t), t.direction === "transfer" ? null : scopeLabel(txScope(t))]
    .filter(Boolean)
    .join(" · ");
  return (
    <button type="button" className={`tx-row ${t.ignored ? "ignored" : ""}`} onClick={() => openModal(<OrganizeModal transaction={t} />)}>
      <span className="tx-icon" aria-hidden="true">
        {t.direction === "income" ? "💰" : t.direction === "transfer" ? "🔁" : txIcon(t)}
      </span>
      <span className="tx-main">
        <span className="tx-name" style={{ display: "block" }}>
          {t.description}
        </span>
        <span className="tx-meta" style={{ display: "block" }}>
          {meta}
        </span>
      </span>
      <span>
        <span className={`tx-amount ${t.direction}`} style={{ display: "block" }}>
          <Money cents={t.amountCents} sign={t.direction === "income" ? "+" : t.direction === "expense" ? "-" : undefined} />
        </span>
        <span style={{ display: "block", textAlign: "right", marginTop: 4 }}>
          <StatusChip t={t} />
        </span>
      </span>
    </button>
  );
}

/** Lista agrupada por dia (tela de transações). */
export function TxList({ items }: { items: Transaction[] }) {
  const groups: { day: string; items: Transaction[] }[] = [];
  for (const t of items) {
    const last = groups[groups.length - 1];
    if (last && last.day === t.occurredOn) last.items.push(t);
    else groups.push({ day: t.occurredOn, items: [t] });
  }
  return (
    <>
      {groups.map((g) => (
        <div key={g.day}>
          <div className="day-label">{dayLabel(g.day)}</div>
          {g.items.map((t) => (
            <TxRow key={t.id} t={t} showDate={false} />
          ))}
        </div>
      ))}
    </>
  );
}
