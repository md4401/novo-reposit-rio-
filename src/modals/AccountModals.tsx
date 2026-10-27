// Contas/cartões e importação de extrato (CSV ou OFX baixado do app do banco).
import { FileUp } from "lucide-react";
import { useState } from "react";
import type { Account, AccountKind, ImportResult } from "../../shared/types";
import { ModalHeader, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { dayLabel, formatMoney } from "../lib/format";
import { navigate } from "../lib/router";
import { useApp } from "../state";

export const KIND_LABEL: Record<AccountKind, string> = {
  checking: "Conta corrente",
  credit_card: "Cartão de crédito",
  savings: "Poupança / conta digital",
  cash: "Dinheiro / carteira",
  other: "Outra",
};

export function NewAccountModal({ then }: { then?: (account: Account) => void }) {
  const { closeModal, toast, refreshMe } = useApp();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AccountKind>("checking");
  const [institution, setInstitution] = useState("");
  const [last4, setLast4] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const account = await api<Account>("accounts", { body: { name, kind, institution: institution || null, last4: last4 || null } });
      await refreshMe();
      toast("Conta adicionada. Agora é só importar o extrato dela.");
      closeModal(then ? () => then(account) : undefined);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <ModalHeader title="Nova conta ou cartão" subtitle="Só você vê suas contas. A família nunca sabe quais bancos você usa." />
      {error && <div className="form-error">{error}</div>}
      <div className="field">
        <label htmlFor="a-name">Nome</label>
        <input id="a-name" required maxLength={60} placeholder="Ex.: Nubank, Conta do Itaú" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="a-kind">Tipo</label>
          <select id="a-kind" value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
            {Object.entries(KIND_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="a-last4">Final (opcional)</label>
          <input id="a-last4" inputMode="numeric" maxLength={4} placeholder="4821" value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="a-inst">Banco (opcional)</label>
        <input id="a-inst" maxLength={60} value={institution} onChange={(e) => setInstitution(e.target.value)} />
      </div>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={() => closeModal()}>
          Cancelar
        </button>
        <button type="submit" className="btn dark" disabled={saving}>
          {saving && <Spinner />} Adicionar
        </button>
      </div>
    </form>
  );
}

async function readText(file: File) {
  const utf8 = await file.text();
  if (!utf8.includes("�")) return utf8;
  // Muitos bancos exportam em ISO-8859-1 (acentos quebrados em UTF-8)
  return new TextDecoder("iso-8859-1").decode(await file.arrayBuffer());
}

export function ImportModal({ accountId: initial }: { accountId?: string }) {
  const { me, closeModal, openModal, toast, refreshMe } = useApp();
  const accounts = (me?.accounts ?? []).filter((a) => a.active && a.kind !== "cash");
  const [accountId, setAccountId] = useState(initial ?? accounts[0]?.id ?? "");
  const account = accounts.find((a) => a.id === accountId);
  const [file, setFile] = useState<{ name: string; content: string } | null>(null);
  const [invert, setInvert] = useState(false);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (accounts.length === 0) {
    return (
      <>
        <ModalHeader title="Importar extrato" subtitle="Primeiro, cadastre a conta ou o cartão do extrato." />
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={() => closeModal()}>
            Fechar
          </button>
          <button type="button" className="btn dark" onClick={() => closeModal(() => openModal(<NewAccountModal then={(a) => openModal(<ImportModal accountId={a.id} />)} />))}>
            Adicionar conta
          </button>
        </div>
      </>
    );
  }

  async function pick(f: File | undefined) {
    setPreview(null);
    setError(null);
    if (!f) return;
    if (f.size > 2.5 * 1024 * 1024) return setError("Arquivo grande demais (máx. 2,5 MB). Exporte um período menor.");
    const content = await readText(f);
    setFile({ name: f.name, content });
    const isCsv = !/\.ofx$/i.test(f.name) && !/<OFX>/i.test(content.slice(0, 2000));
    const inv = isCsv && account?.kind === "credit_card";
    setInvert(inv);
    void run(false, { name: f.name, content }, inv);
  }

  async function run(commit: boolean, f = file, inv = invert) {
    if (!f) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<ImportResult>("import", { body: { accountId, fileName: f.name, content: f.content, invertSigns: inv, commit } });
      if (commit) {
        await refreshMe();
        closeModal(() => navigate("transacoes"));
        toast(
          result.imported
            ? `${result.imported} movimentações importadas${result.duplicates ? ` (${result.duplicates} já existiam e foram puladas)` : ""}. Confira as pendências!`
            : "Nada novo: todas as movimentações desse arquivo já estavam no ninho.",
        );
      } else setPreview(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const fresh = preview ? preview.total - preview.duplicates : 0;
  return (
    <>
      <ModalHeader title="Importar extrato" subtitle="Arquivo CSV ou OFX exportado do app ou site do seu banco." />
      {error && <div className="form-error">{error}</div>}
      <div className="field">
        <label htmlFor="i-acc">Conta ou cartão do extrato</label>
        <select
          id="i-acc"
          value={accountId}
          onChange={(e) => {
            setAccountId(e.target.value);
            setPreview(null);
          }}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.last4 ? ` •••• ${a.last4}` : ""} — {KIND_LABEL[a.kind]}
            </option>
          ))}
        </select>
      </div>
      <label className="file-drop">
        <FileUp size={26} />
        <span>{file ? file.name : "Escolher arquivo .csv ou .ofx"}</span>
        <input type="file" accept=".csv,.ofx,.txt,text/csv,application/x-ofx" onChange={(e) => void pick(e.target.files?.[0])} />
      </label>
      {file && preview?.bank && (
        <div className="modal-note" style={{ marginTop: 12 }}>
          🏦 Reconhecemos o formato <b>{preview.bank}</b>
          {preview.autoInverted ? " — compras da fatura entram como gastos automaticamente." : "."}
        </div>
      )}
      {file && !preview?.bank && (
        <label className="check-line" style={{ marginTop: 12 }}>
          <input
            type="checkbox"
            checked={invert}
            onChange={(e) => {
              setInvert(e.target.checked);
              void run(false, file, e.target.checked);
            }}
          />
          Neste arquivo, valores positivos são gastos (comum em fatura de cartão em CSV)
        </label>
      )}
      {!file && (
        <div className="modal-note" style={{ marginTop: 12 }}>
          <b>Como baixar:</b> no app do banco, abra o extrato (ou a fatura do cartão) e procure <i>Exportar</i>, <i>Compartilhar</i> ou{" "}
          <i>Baixar</i> em CSV ou OFX. Salve no celular e escolha aqui. Importar o mesmo arquivo de novo não duplica nada.
        </div>
      )}
      {busy && !preview && (
        <p className="muted small" style={{ marginTop: 12 }}>
          <Spinner size={14} /> Lendo o arquivo…
        </p>
      )}
      {preview && (
        <div style={{ marginTop: 14 }}>
          <div className="modal-note" style={{ marginBottom: 8 }}>
            {preview.format.toUpperCase()} · <b>{preview.total}</b> movimentações · <b>{fresh}</b> novas
            {preview.duplicates ? ` · ${preview.duplicates} já importadas (serão puladas)` : ""}
          </div>
          <div style={{ maxHeight: 260, overflow: "auto" }}>
            <table className="mini-table">
              <thead>
                <tr>
                  <th>DATA</th>
                  <th>DESCRIÇÃO</th>
                  <th>VALOR</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r, i) => (
                  <tr key={i} className={r.duplicate ? "dup" : ""}>
                    <td>{dayLabel(r.occurredOn)}</td>
                    <td>
                      {r.description}
                      {r.direction === "transfer" && <span className="chip gray" style={{ marginLeft: 6 }}>Não é gasto</span>}
                    </td>
                    <td className="num" style={{ color: r.direction === "income" ? "var(--green-ink)" : undefined }}>
                      {r.direction === "income" ? "+" : r.direction === "expense" ? "−" : ""} {formatMoney(r.amountCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={() => closeModal()}>
          Cancelar
        </button>
        <button type="button" className="btn dark" disabled={!preview || busy || fresh === 0} onClick={() => run(true)}>
          {busy && preview && <Spinner />} Importar {fresh || ""} movimentações
        </button>
      </div>
    </>
  );
}
