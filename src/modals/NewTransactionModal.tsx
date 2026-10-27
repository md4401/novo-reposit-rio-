// Registrar despesa ou receita à mão (ou confirmar uma proposta da Nia / nota fiscal).
import { useState } from "react";
import type { Allocation, Direction, Proposal, Scope } from "../../shared/types";
import { ModalHeader, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { createTransaction } from "../lib/offline";
import { category, centsToInput, dayLabel, formatMoney, parseMoney } from "../lib/format";
import { useApp } from "../state";
import { ScopeToggle } from "../components/ScopeToggle";
import { CategoryPicker } from "../components/CategoryPicker";
import { addDays } from "../../shared/time";

export function NewTransactionModal({
  proposal,
  source = "manual",
  receiptImage,
  direction: initialDirection = "expense",
  receiptItems,
}: {
  proposal?: Proposal;
  source?: "manual" | "voice" | "receipt";
  /** Foto da nota (já comprimida) para guardar junto com o lançamento */
  receiptImage?: string;
  /** Começar como despesa ou receita (botão "Adicionar") */
  direction?: Direction;
  /** Produtos lidos da nota (alimentam a cesta da família) */
  receiptItems?: { name: string; amountCents: number; categoryId: string }[];
}) {
  const { me, closeModal, toast, refreshMe } = useApp();
  const [direction, setDirection] = useState<Direction>(proposal?.direction ?? initialDirection);
  const [description, setDescription] = useState(proposal?.description ?? "");
  const [amount, setAmount] = useState(proposal ? centsToInput(proposal.amountCents) : "");
  const [date, setDate] = useState(proposal?.occurredOn ?? me?.today ?? "");
  const [categoryId, setCategoryId] = useState<string>(proposal?.allocations[0]?.categoryId ?? "auto");
  const [scope, setScope] = useState<Scope>(proposal?.allocations[0]?.scope ?? "personal");
  const [accountId, setAccountId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const split = proposal && proposal.allocations.length > 1 ? proposal.allocations : null;
  const cents = parseMoney(amount);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!cents || cents <= 0) return setError("Informe um valor maior que zero.");
    setSaving(true);
    setError(null);
    try {
      let allocations: Allocation[] | undefined;
      if (split && cents === proposal!.amountCents) allocations = split;
      else if (categoryId !== "auto") allocations = [{ categoryId, amountCents: cents, scope }];
      const { tx: created, queued } = await createTransaction({
        description: description.trim(),
        amountCents: cents,
        direction,
        occurredOn: date,
        accountId: accountId || null,
        allocations,
        source,
      });
      if (!created || queued) {
        closeModal();
        toast("Sem internet: guardei no aparelho e envio sozinho quando a conexão voltar.");
        return;
      }
      if (receiptImage) await api("receipts", { body: { image: receiptImage, transactionId: created.id }, silent: true }).catch(() => undefined);
      if (receiptItems?.length)
        await api(`transactions/${created.id}/items`, { method: "PUT", body: { items: receiptItems }, silent: true }).catch(() => undefined);
      await refreshMe();
      closeModal();
      toast(
        created.status === "pending"
          ? "Lançamento salvo. Ele ficou em “A revisar” para você escolher a categoria."
          : `${direction === "income" ? "Receita" : "Despesa"} registrada: ${created.allocations.length > 1 ? "várias categorias" : category(created.allocations[0]?.categoryId).name}.`,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <ModalHeader
        title={proposal ? "Conferir lançamento" : direction === "income" ? "Registrar receita" : "Registrar despesa"}
        subtitle={proposal ? "A Nia preparou este lançamento. Confira antes de salvar." : "Um lançamento privado: só você vê os detalhes."}
      />
      {error && <div className="form-error">{error}</div>}
      <div className="segmented" style={{ marginBottom: 14 }}>
        {(
          [
            ["expense", "Despesa"],
            ["income", "Receita"],
          ] as [Direction, string][]
        ).map(([d, label]) => (
          <button
            key={d}
            type="button"
            className={direction === d ? "on" : ""}
            onClick={() => {
              setDirection(d);
              setCategoryId("auto");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="field">
        <label htmlFor="nt-desc">{direction === "income" ? "Descrição" : "Estabelecimento ou descrição"}</label>
        <input id="nt-desc" required maxLength={120} autoFocus={!proposal} placeholder={direction === "income" ? "Ex.: Salário" : "Ex.: Mercado da esquina"} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="nt-amount">Valor em reais</label>
        <input id="nt-amount" className="amount-input" required inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      {split && cents === proposal!.amountCents ? (
        <div className="modal-note" style={{ marginBottom: 14 }}>
          <b>Divisão proposta:</b>{" "}
          {split.map((a) => `${category(a.categoryId).name} ${formatMoney(a.amountCents)} (${a.scope === "family" ? "familiar" : "pessoal"})`).join(" · ")}
          . Para mudar, salve e toque no lançamento.
        </div>
      ) : (
        <>
          <div className="field">
            <span className="field-label">Categoria</span>
            <CategoryPicker direction={direction} value={categoryId} onChange={setCategoryId} allowAuto />
          </div>
          <div className="field">
            <span className="field-label">Quem vê</span>
            <ScopeToggle value={scope} onChange={setScope} disabled={categoryId === "auto"} />
          </div>
        </>
      )}
      <details className="more-options" open={date !== me?.today || Boolean(proposal)}>
        <summary>
          Data e conta <small>{date === me?.today ? "hoje" : dayLabel(date)}{accountId ? ` · ${me?.accounts.find((a) => a.id === accountId)?.name ?? ""}` : ""}</small>
        </summary>
        <div className="field">
          <label htmlFor="nt-date">Data</label>
          <div className="date-quick">
            <button type="button" className={`cat-chip ${date === me?.today ? "on" : ""}`} onClick={() => me && setDate(me.today)}>
              Hoje
            </button>
            <button type="button" className={`cat-chip ${me && date === addDays(me.today, -1) ? "on" : ""}`} onClick={() => me && setDate(addDays(me.today, -1))}>
              Ontem
            </button>
            <input id="nt-date" type="date" required value={date} max={me?.today} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        {me && me.accounts.length > 0 && (
          <div className="field">
            <label htmlFor="nt-acc">Conta ou cartão (opcional)</label>
            <select id="nt-acc" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Sem conta</option>
              {me.accounts.filter((a) => a.active).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.last4 ? ` •••• ${a.last4}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
      </details>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={() => closeModal()}>
          Cancelar
        </button>
        <button className="btn dark" type="submit" disabled={saving}>
          {saving && <Spinner />} {proposal ? "Confirmar e salvar" : "Registrar"}
        </button>
      </div>
    </form>
  );
}
