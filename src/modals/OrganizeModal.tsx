// "Organizar compra": dividir em categorias (cada parte pessoal ou familiar), fechando centavo por centavo.
import { Plus, Scissors, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { categoriesFor } from "../../shared/categories";
import type { Allocation, Direction, Goal, Scope, Tag, Transaction } from "../../shared/types";
import { classificationNote, ModalHeader, Spinner } from "../components/ui";
import { api, apiBlobUrl } from "../lib/api";
import { useData } from "../lib/useData";
import { category, centsToInput, dayLabel, formatMoney, parseMoney } from "../lib/format";
import { useApp } from "../state";
import { ScopeToggle } from "../components/ScopeToggle";
import { CategoryPicker } from "../components/CategoryPicker";

type Row = { categoryId: string; value: string; scope: Scope };

/** Etiquetas: salvam na hora (não dependem do botão Salvar). Só aparecem para quem já criou alguma. */
function TagPicker({ transaction }: { transaction: Transaction }) {
  const { toast } = useApp();
  const tags = useData<Tag[]>("tags");
  const [selected, setSelected] = useState<string[]>(transaction.tags.map((x) => x.id));
  const [name, setName] = useState("");

  async function save(next: string[]) {
    setSelected(next);
    try {
      await api(`transactions/${transaction.id}/tags`, { method: "PUT", body: { tagIds: next }, silent: true });
    } catch (e) {
      toast((e as Error).message);
    }
  }

  async function create() {
    const clean = name.trim();
    if (!clean) return;
    try {
      const list = await api<Tag[]>("tags", { body: { name: clean } });
      const created = list.find((x) => x.name.toLowerCase() === clean.toLowerCase());
      setName("");
      if (created) await save([...selected, created.id]);
      tags.reload();
    } catch (e) {
      toast((e as Error).message);
    }
  }

  if (!tags.data?.length && !transaction.tags.length) return null;
  return (
    <div className="field" style={{ marginTop: 14 }}>
      <label>Etiquetas</label>
      <div className="template-chips" style={{ marginBottom: 8 }}>
        {(tags.data ?? []).map((tg) => {
          const on = selected.includes(tg.id);
          return (
            <button key={tg.id} type="button" className={`quick ${on ? "on" : ""}`} onClick={() => void save(on ? selected.filter((x) => x !== tg.id) : [...selected, tg.id])}>
              🏷️ {tg.name}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input placeholder="Nova etiqueta (ex.: Viagem Bahia)" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} />
        <button type="button" className="btn ghost small" onClick={() => void create()} disabled={!name.trim()}>
          <Plus size={13} /> Criar
        </button>
      </div>
    </div>
  );
}

function ReceiptPreview({ id }: { id: string }) {
  const { toast, confirm } = useApp();
  const [url, setUrl] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    let local: string | null = null;
    apiBlobUrl(`receipts/${id}`)
      .then((u) => setUrl((local = u)))
      .catch(() => setGone(true));
    return () => {
      if (local) URL.revokeObjectURL(local);
    };
  }, [id]);
  if (gone) return null;
  async function remove() {
    if (!(await confirm({ title: "Apagar a foto desta nota?", text: "A compra continua lançada; só a foto sai.", confirmLabel: "Apagar", danger: true }))) return;
    await api(`receipts/${id}`, { method: "DELETE" });
    setGone(true);
    toast("Foto apagada.");
  }
  return (
    <div className="receipt-preview">
      <div className="panel-title">
        <h2 style={{ fontSize: 14 }}>📸 Nota fiscal</h2>
        <button type="button" className="btn ghost small" onClick={remove}>
          Apagar foto
        </button>
      </div>
      {url ? (
        <img src={url} alt="Foto da nota fiscal" />
      ) : (
        <Spinner />
      )}
    </div>
  );
}

export function OrganizeModal({ transaction: t }: { transaction: Transaction }) {
  const { me, closeModal, toast, refreshMe, confirm } = useApp();
  const newScope: Scope = t.direction === "expense" ? (me?.profile.defaultScope ?? "personal") : "personal";
  const goals = useData<Goal[]>("goals");
  const [goalId, setGoalId] = useState(t.goalId ?? "");
  const [goalAlways, setGoalAlways] = useState(false);
  const [tax, setTax] = useState<"auto" | "yes" | "no">(t.taxDeductible === null ? "auto" : t.taxDeductible ? "yes" : "no");
  const manual = t.source !== "csv" && t.source !== "ofx";
  const [direction, setDirection] = useState<Direction>(t.direction);
  const [description, setDescription] = useState(t.description);
  const [amount, setAmount] = useState(centsToInput(t.amountCents));
  const [rows, setRows] = useState<Row[]>(() =>
    t.allocations.length && t.direction !== "transfer"
      ? t.allocations.map((a) => ({ categoryId: a.categoryId, value: centsToInput(a.amountCents), scope: a.scope }))
      : [{ categoryId: t.direction === "income" ? "outras-receitas" : "outros", value: centsToInput(t.amountCents), scope: newScope }],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalCents = manual ? (parseMoney(amount) ?? 0) : t.amountCents;
  // Sem divisão, a única categoria leva o valor inteiro
  const parsed = rows.length === 1 ? [totalCents] : rows.map((r) => parseMoney(r.value) ?? 0);
  const sum = parsed.reduce((a, b) => a + b, 0);
  const ok = direction === "transfer" || (rows.length > 0 && parsed.every((v) => v > 0) && sum === totalCents && totalCents > 0);
  const options = useMemo(() => categoriesFor(direction === "income" ? "income" : "expense"), [direction]);

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const changeDirection = (d: Direction) => {
    setDirection(d);
    if (d !== "transfer") {
      const valid = categoriesFor(d === "income" ? "income" : "expense").map((c) => c.id);
      setRows((rs) => rs.map((r) => (valid.includes(r.categoryId) ? r : { ...r, categoryId: d === "income" ? "outras-receitas" : "outros" })));
    }
  };

  const startSplit = () =>
    setRows((rs) => [{ ...rs[0], value: centsToInput(totalCents) }, { categoryId: direction === "income" ? "outras-receitas" : "outros", value: "", scope: rs[0].scope }]);

  const fillRest = () => {
    const diff = totalCents - sum;
    if (diff === 0) return;
    const last = rows.length - 1;
    const value = (parseMoney(rows[last].value) ?? 0) + diff;
    if (value > 0) update(last, { value: centsToInput(value) });
    else setRows((rs) => [...rs, { categoryId: "outros", value: centsToInput(diff), scope: rs[last].scope }]);
  };

  async function save(allocations?: Allocation[]) {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        direction,
        allocations:
          allocations ??
          (direction === "transfer"
            ? [{ categoryId: "transferencia", amountCents: totalCents, scope: "personal" }]
            : rows.map((r, i) => ({ categoryId: r.categoryId, amountCents: parsed[i], scope: r.scope }))),
      };
      if (manual) {
        body.description = description;
        body.amountCents = totalCents;
      }
      const taxValue = tax === "auto" ? null : tax === "yes";
      if (taxValue !== t.taxDeductible) body.taxDeductible = taxValue;
      if (goalId !== (t.goalId ?? "") || goalAlways) {
        body.goalId = goalId || null;
        body.goalAlways = goalAlways;
      }
      const result = await api<{ learnedRule: { merchant: string; categoryId: string; applied: number } | null }>(`transactions/${t.id}`, {
        method: "PATCH",
        body,
      });
      await refreshMe();
      closeModal();
      if (result.learnedRule) {
        const r = result.learnedRule;
        toast(`Aprendi! “${r.merchant}” agora vira ${category(r.categoryId).name} automaticamente${r.applied ? ` (${r.applied} pendência(s) resolvida(s))` : ""}.`);
      } else toast("Categorias e visibilidade atualizadas.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const imported = !manual;
    const ok = await confirm(
      imported
        ? { title: "Ignorar esta movimentação?", text: "Ela continua guardada, mas sai dos totais. Dá para desfazer.", confirmLabel: "Ignorar" }
        : { title: "Excluir este lançamento?", text: "Não dá para desfazer.", confirmLabel: "Excluir", danger: true },
    );
    if (!ok) return;
    setSaving(true);
    try {
      await api(`transactions/${t.id}`, { method: "DELETE" });
      await refreshMe();
      closeModal();
      if (imported)
        toast("Movimentação ignorada.", {
          label: "Desfazer",
          run: () => void api(`transactions/${t.id}`, { method: "PATCH", body: { ignored: false } }).then(() => refreshMe()).catch(() => toast("Não foi possível desfazer.")),
        });
      else toast("Lançamento excluído.");
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  async function restore() {
    setSaving(true);
    try {
      await api(`transactions/${t.id}`, { method: "PATCH", body: { ignored: false } });
      closeModal();
      toast("Movimentação voltou para os totais.");
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <>
      <ModalHeader
        title="Organizar compra"
        subtitle={`${t.description} • ${dayLabel(t.occurredOn)} • ${formatMoney(t.amountCents)}${t.method ? ` · ${t.method}` : ""}${t.accountName ? ` · ${t.accountName}` : ""}`}
      />
      <p className={`class-note ${t.status === "pending" ? "pending" : ""}`}>{classificationNote(t)}</p>
      {error && <div className="form-error">{error}</div>}

      {direction === "transfer" ? (
        <div className="modal-note">
          Pagamento de fatura, transferência entre contas suas ou aplicação: <b>não conta como gasto</b>. Assim a compra no cartão e o
          pagamento da fatura não viram duas despesas.
        </div>
      ) : rows.length === 1 ? (
        <>
          <span className="field-label">Categoria</span>
          <CategoryPicker direction={direction} value={rows[0].categoryId} onChange={(categoryId) => update(0, { categoryId })} />
          <div className="field" style={{ marginTop: 14 }}>
            <span className="field-label">Quem vê</span>
            <ScopeToggle value={rows[0].scope} onChange={(scope) => update(0, { scope })} />
          </div>
          <button type="button" className="btn ghost small" onClick={startSplit}>
            <Scissors size={13} /> Dividir em várias categorias
          </button>
        </>
      ) : (
        <>
          <div className="modal-note" style={{ marginBottom: 14 }}>
            Divida o valor em categorias. Cada parte pode ser <b>pessoal</b> (só você vê) ou <b>familiar</b> (entra nos totais da casa,
            sem mostrar onde nem quem comprou). A soma precisa fechar exatamente {formatMoney(totalCents)}.
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <h3>Categorias</h3>
            <span className={`chip ${t.status === "pending" ? "amber" : "lime"}`}>{t.status === "pending" ? "A revisar" : "Editável"}</span>
          </div>
          {rows.map((r, i) => (
            <div className="alloc-row" key={i}>
              <select aria-label={`Categoria ${i + 1}`} value={r.categoryId} onChange={(e) => update(i, { categoryId: e.target.value })}>
                {options.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input aria-label={`Valor ${i + 1}`} inputMode="decimal" value={r.value} onChange={(e) => update(i, { value: e.target.value })} />
              <ScopeToggle compact value={r.scope} onChange={(scope) => update(i, { scope })} label={`Quem vê a parte ${i + 1}`} />
              <button type="button" className="remove" aria-label="Remover categoria" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                <X size={16} />
              </button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn ghost small" onClick={() => setRows((rs) => [...rs, { categoryId: "outros", value: "", scope: rows[rs.length - 1]?.scope ?? "personal" }])}>
              <Plus size={13} /> Adicionar categoria
            </button>
            {sum !== totalCents && totalCents > 0 && (
              <button type="button" className="btn ghost small" onClick={fillRest}>
                Completar diferença
              </button>
            )}
          </div>
          <div className={`alloc-total ${ok ? "" : "bad"}`}>
            <div>
              <b>Total distribuído</b>
              <div style={{ fontSize: 12, color: ok ? "var(--green-ink)" : "var(--red)" }}>
                {ok ? "✓ Valores conferidos" : `${totalCents - sum > 0 ? "Faltam" : "Sobram"} ${formatMoney(Math.abs(totalCents - sum))}`}
              </div>
            </div>
            <b className="num" style={{ fontSize: 16 }}>
              {formatMoney(sum)}
            </b>
          </div>
        </>
      )}

      <details className="more-options">
        <summary>
          Mais opções <small>tipo{manual ? ", descrição e valor" : ""}, meta{direction === "expense" ? ", Imposto de Renda" : ""}</small>
        </summary>
          <div className="segmented" style={{ marginBottom: 14 }}>
            {(
              [
                ["expense", "Despesa"],
                ["income", "Receita"],
                ["transfer", "Transferência / fatura"],
              ] as [Direction, string][]
            ).map(([d, label]) => (
              <button key={d} type="button" className={direction === d ? "on" : ""} onClick={() => changeDirection(d)}>
                {label}
              </button>
            ))}
          </div>

          {manual && (
            <div className="form-row">
              <div className="field">
                <label htmlFor="desc">Descrição</label>
                <input id="desc" value={description} maxLength={120} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="amount">Valor (R$)</label>
                <input id="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </div>
          )}

          {direction !== "income" && (goals.data?.length ?? 0) > 0 && (
            <div className="field" style={{ marginTop: 14 }}>
              <label htmlFor="o-goal">Conta para uma meta?</label>
              <select id="o-goal" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
                <option value="">Não</option>
                {goals.data!.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.icon} {g.name} ({g.scope === "family" ? "família" : "pessoal"})
                  </option>
                ))}
              </select>
              {goalId && (
                <label className="check-line" style={{ marginTop: 8 }}>
                  <input type="checkbox" checked={goalAlways} onChange={(e) => setGoalAlways(e.target.checked)} />
                  <span>Sempre que for “{t.merchant}”, contar para esta meta</span>
                </label>
              )}
            </div>
          )}

          <TagPicker transaction={t} />

          {direction === "expense" && (
            <div className="field" style={{ marginTop: 14 }}>
              <label htmlFor="o-tax">Imposto de Renda</label>
              <select id="o-tax" value={tax} onChange={(e) => setTax(e.target.value as typeof tax)}>
                <option value="auto">Automático (saúde e educação contam)</option>
                <option value="yes">Dedutível</option>
                <option value="no">Não dedutível</option>
              </select>
            </div>
          )}

      </details>

      {t.receiptId && <ReceiptPreview id={t.receiptId} />}

      <div className="modal-actions" style={{ justifyContent: "space-between" }}>
        {t.ignored ? (
          <button type="button" className="btn ghost" onClick={restore} disabled={saving}>
            Voltar para os totais
          </button>
        ) : (
          <button type="button" className="btn danger" onClick={remove} disabled={saving}>
            <Trash2 size={15} /> {manual ? "Excluir" : "Ignorar"}
          </button>
        )}
        <div style={{ display: "flex", gap: 8, flex: 1, justifyContent: "flex-end" }}>
          <button type="button" className="btn ghost" onClick={() => closeModal()}>
            Cancelar
          </button>
          <button type="button" className="btn dark" disabled={!ok || saving} onClick={() => save()}>
            {saving ? <Spinner /> : null} Salvar
          </button>
        </div>
      </div>
    </>
  );
}
