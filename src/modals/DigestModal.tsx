// Revisar: as compras sem categoria, uma por vez — escolher a categoria, Pessoal ou Família, confirmar.
// Cada confirmação conta para a regra aprendida (2 iguais e o ninho passa a classificar sozinho).
import { Bot, CircleCheck, Scissors } from "lucide-react";
import { useEffect, useState } from "react";
import type { Scope, Transaction } from "../../shared/types";
import { CategoryPicker } from "../components/CategoryPicker";
import { CategoryBadge } from "../components/icons";
import { ScopeToggle } from "../components/ScopeToggle";
import { ModalHeader, Money, Progress, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { category, dayLabel } from "../lib/format";
import { navigate } from "../lib/router";
import { useData } from "../lib/useData";
import { useApp } from "../state";
import { OrganizeModal } from "./OrganizeModal";

type Learned = { merchant: string; categoryId: string; applied: number } | null;

export function DigestModal() {
  const { me, closeModal, openModal, refreshMe } = useApp();
  const { data } = useData<Transaction[]>("transactions?status=pending");
  // A fila é a foto do começo: cada confirmação recarrega a lista, e a ordem não pode mudar no meio
  const [queue, setQueue] = useState<Transaction[] | null>(null);
  useEffect(() => {
    if (data && !queue) setQueue(data.filter((t) => !t.ignored));
  }, [data, queue]);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [categoryId, setCategoryId] = useState("");
  // Começa como a pessoa escolheu em Configurações; trocar aqui vale para as próximas da fila
  const [scope, setScope] = useState<Scope>(me?.profile.defaultScope ?? "personal");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [learned, setLearned] = useState<Learned>(null);

  const current = queue?.[index];
  const total = queue?.length ?? 0;

  const next = () => {
    setIndex((i) => i + 1);
    setCategoryId("");
    setError(null);
  };

  async function confirmCurrent() {
    if (!current || !categoryId) return;
    setSaving(true);
    setError(null);
    try {
      const result = await api<{ learnedRule: Learned }>(`transactions/${current.id}`, {
        method: "PATCH",
        body: { direction: current.direction, allocations: [{ categoryId, amountCents: current.amountCents, scope }] },
      });
      setDone((n) => n + 1);
      if (result.learnedRule) {
        setLearned(result.learnedRule);
        // A regra nova já classificou as outras compras desse estabelecimento: saem da fila
        const merchant = current.merchant;
        setQueue((q) => q && [...q.slice(0, index + 1), ...q.slice(index + 1).filter((t) => t.merchant !== merchant)]);
      }
      void refreshMe();
      next();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!queue)
    return (
      <>
        <ModalHeader title="Revisar compras" />
        <div style={{ display: "grid", placeItems: "center", padding: 40 }}>
          <Spinner size={22} />
        </div>
      </>
    );

  if (!current)
    return (
      <>
        <ModalHeader title="Revisar compras" />
        <div className="review-done">
          <CircleCheck size={34} />
          <h3>{total === 0 ? "Nada para revisar" : skipped > 0 ? "Quase lá" : "Tudo em dia"}</h3>
          <p>
            {total === 0
              ? "Todas as suas compras já têm categoria."
              : `${done} compra${done === 1 ? "" : "s"} revisada${done === 1 ? "" : "s"}${skipped > 0 ? ` · ${skipped} ficou para depois` : ""}.`}
          </p>
          {learned && (
            <p className="review-learned">
              Aprendi: “{learned.merchant}” agora vira {category(learned.categoryId).name} sozinho.
            </p>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={() => closeModal(() => navigate("nia"))}>
            <Bot size={15} /> Conversar com a Nia
          </button>
          <button type="button" className="btn dark" onClick={() => closeModal()}>
            Fechar
          </button>
        </div>
      </>
    );

  return (
    <>
      <ModalHeader title="Revisar compras" subtitle={`${index + 1} de ${total} · escolha a categoria e confirme`} />
      <Progress value={index / total} tone="lime" />
      <div className="review-card">
        <CategoryBadge id={categoryId || "_pendente"} size={44} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3>{current.description}</h3>
          <p className="muted small">
            {dayLabel(current.occurredOn)}
            {current.accountName ? ` · ${current.accountName}` : current.method ? ` · ${current.method}` : ""}
          </p>
        </div>
        <b className={`num review-amount ${current.direction}`}>
          <Money cents={current.amountCents} sign={current.direction === "income" ? "+" : "-"} />
        </b>
      </div>
      {error && <div className="form-error">{error}</div>}
      <span className="field-label">Categoria</span>
      <CategoryPicker direction={current.direction} value={categoryId} onChange={setCategoryId} />
      <div className="field" style={{ marginTop: 14 }}>
        <span className="field-label">Quem vê</span>
        <ScopeToggle value={scope} onChange={setScope} />
      </div>
      {learned && <p className="review-learned">Aprendi: “{learned.merchant}” agora vira {category(learned.categoryId).name} sozinho.</p>}
      <div className="modal-actions review-actions">
        <button type="button" className="btn ghost" onClick={() => closeModal(() => openModal(<OrganizeModal transaction={current} />))}>
          <Scissors size={14} /> Dividir
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            setSkipped((n) => n + 1);
            next();
          }}
        >
          Pular
        </button>
        <button type="button" className="btn dark" disabled={!categoryId || saving} onClick={confirmCurrent}>
          {saving && <Spinner />} Confirmar
        </button>
      </div>
    </>
  );
}
