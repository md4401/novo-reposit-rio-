// Senha e conta: trocar senha, código de senha para um integrante e apagar a conta.
import { useState } from "react";
import { ModalHeader, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { useApp } from "../state";

export function ChangePasswordModal() {
  const { toast, closeModal } = useApp();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("me/password", { body: { current, password }, silent: true });
      toast("Senha trocada. Os outros aparelhos precisam entrar de novo.");
      closeModal();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <ModalHeader title="Trocar senha" subtitle="Você continua conectado neste aparelho." />
      {error && <div className="form-error">{error}</div>}
      <div className="field">
        <label htmlFor="pw-current">Senha atual</label>
        <input id="pw-current" type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="pw-new">Nova senha</label>
        <input id="pw-new" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <span className="hint">Mínimo de 8 caracteres.</span>
      </div>
      <div className="modal-actions">
        <button type="submit" className="btn dark" disabled={busy}>
          {busy && <Spinner />} Salvar nova senha
        </button>
      </div>
    </form>
  );
}

export function ResetCodeModal({ memberId, name }: { memberId: string; name: string }) {
  const [result, setResult] = useState<{ code: string; minutes: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      setResult(await api<{ code: string; minutes: number }>(`household/members/${memberId}/reset-code`, { body: {}, silent: true }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ModalHeader title={`Código de senha para ${name.split(" ")[0]}`} subtitle="Use quando a pessoa esqueceu a senha." />
      {error && <div className="form-error">{error}</div>}
      {result ? (
        <>
          <div className="code-box num">{result.code}</div>
          <p className="muted small" style={{ marginTop: 10 }}>
            Passe o código <b>pessoalmente ou por mensagem privada</b>. Na tela de entrada, a pessoa toca em “Esqueci minha senha”, digita o
            e-mail, este código e a nova senha. Vale por {result.minutes} minutos e uma única vez.
          </p>
        </>
      ) : (
        <p className="muted small">O código permite criar uma senha nova para {name}. Você não vê a senha nem os dados pessoais dela.</p>
      )}
      <div className="modal-actions">
        {!result && (
          <button type="button" className="btn dark" disabled={busy} onClick={generate}>
            {busy && <Spinner />} Gerar código
          </button>
        )}
      </div>
    </>
  );
}

export function DeleteAccountModal() {
  const { signOut, toast, closeModal } = useApp();
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("me/delete", { body: { password }, silent: true });
      toast("Conta apagada. Seus dados foram removidos.");
      closeModal(() => void signOut());
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <ModalHeader title="Apagar minha conta" subtitle="Não dá para desfazer." />
      <div className="notice warn" style={{ marginBottom: 14 }}>
        <div>
          Apaga <b>todas</b> as suas transações, contas, metas pessoais, orçamentos, notas fiscais, regras e conversas com a Nia. Suas partes
          familiares deixam de contar nos totais da família. Se você administra a família, outra pessoa passa a administrar.
        </div>
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="field">
        <label htmlFor="del-pass">Sua senha</label>
        <input id="del-pass" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="del-confirm">Digite APAGAR para confirmar</label>
        <input id="del-confirm" required value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
      </div>
      <div className="modal-actions">
        <button type="submit" className="btn danger" disabled={busy || confirmText.trim().toUpperCase() !== "APAGAR"}>
          {busy && <Spinner />} Apagar tudo
        </button>
      </div>
    </form>
  );
}
