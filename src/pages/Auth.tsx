// Entrar, criar conta (nova família) ou entrar numa família com código.
import { Check, Lock, Sparkles, Users } from "lucide-react";
import { useState } from "react";
import { Spinner } from "../components/ui";
import { api } from "../lib/api";
import { useApp } from "../state";

type Mode = "login" | "register" | "forgot";

/** Esqueci a senha: código por e-mail (se configurado) ou gerado por quem administra a família. */
function ForgotPassword({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  const { signIn } = useApp();
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"ask" | "code">("ask");
  const [emailSent, setEmailSent] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ emailEnabled: boolean }>("auth/forgot", { body: { email } });
      setEmailSent(r.emailEnabled);
      setStep("code");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token } = await api<{ token: string }>("auth/reset", { body: { email, code, password } });
      await signIn(token);
      window.location.hash = "#/";
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="auth-card" onSubmit={step === "ask" ? ask : reset}>
      <h2>Criar uma nova senha</h2>
      {step === "ask" ? (
        <p className="muted small">Informe seu e-mail. Você vai precisar de um código de 8 letras e números.</p>
      ) : emailSent ? (
        <p className="muted small">Se existir uma conta com esse e-mail, enviamos o código para ele. Ele vale por 30 minutos.</p>
      ) : (
        <div className="modal-note" style={{ marginBottom: 14 }}>
          Peça o código para <b>quem administra a sua família</b>: em <b>Configurações → Família</b>, ao lado do seu nome, em <b>“Código de senha”</b>.
        </div>
      )}
      {error && <div className="form-error">{error}</div>}
      <div className="field">
        <label htmlFor="fp-email">E-mail</label>
        <input id="fp-email" type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {step === "code" && (
        <>
          <div className="field">
            <label htmlFor="fp-code">Código</label>
            <input id="fp-code" required maxLength={12} placeholder="ABCD-EFGH" style={{ textTransform: "uppercase", letterSpacing: 2 }} value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="fp-pass">Nova senha</label>
            <input id="fp-pass" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <span className="hint">Mínimo de 8 caracteres. Você sai dos outros aparelhos.</span>
          </div>
        </>
      )}
      <button type="submit" className="btn dark block" disabled={busy} style={{ minHeight: 48 }}>
        {busy && <Spinner />} {step === "ask" ? "Continuar" : "Salvar nova senha e entrar"}
      </button>
      <button type="button" className="btn ghost block" style={{ marginTop: 10 }} onClick={step === "code" ? () => setStep("ask") : onBack}>
        Voltar
      </button>
    </form>
  );
}

export function AuthPage() {
  const { signIn } = useApp();
  const invite = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("convite") ?? "";
  const [mode, setMode] = useState<Mode>(invite ? "register" : "register");
  const [join, setJoin] = useState(Boolean(invite));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [inviteCode, setInviteCode] = useState(invite);
  const [demo, setDemo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token } =
        mode === "login"
          ? await api<{ token: string }>("auth/login", { body: { email, password } })
          : await api<{ token: string }>("auth/register", {
              body: { name, email, password, mode: join ? "join" : "create", householdName: householdName || undefined, inviteCode, demo },
            });
      await signIn(token);
      window.location.hash = "#/";
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-hero">
        <div className="rings" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="brand" style={{ padding: 0 }}>
          <div className="brand-mark">n</div>
          <div>
            <div className="brand-name">
              ninho<span>.</span>
            </div>
            <div className="brand-sub">FINANÇAS EM FAMÍLIA</div>
          </div>
        </div>
        <div>
          <h1>
            O dinheiro da casa, <span>organizado</span>. O seu, privado.
          </h1>
          <p>Centralize suas movimentações, classifique com ajuda da Nia e acompanhe os compromissos da família — sem expor o extrato de ninguém.</p>
          <div className="auth-points">
            <div>
              <Lock size={17} /> Cada pessoa vê só os próprios detalhes
            </div>
            <div>
              <Users size={17} /> A família vê apenas totais compartilhados
            </div>
            <div>
              <Sparkles size={17} /> Nia: classifique por texto ou voz
            </div>
            <div>
              <Check size={17} /> Importe o extrato do banco (CSV ou OFX)
            </div>
          </div>
        </div>
        <p className="hero-foot" style={{ fontSize: 12, color: "#78968a" }}>
          O ninho não faz Pix nem pagamentos. Seus dados ficam guardados com segurança no Brasil (Neon, São Paulo).
        </p>
      </section>
      <section className="auth-form">
        {mode === "forgot" ? (
          <ForgotPassword initialEmail={email} onBack={() => setMode("login")} />
        ) : (
        <form className="auth-card" onSubmit={submit}>
          <h2>{mode === "login" ? "Que bom te ver de novo" : "Crie sua conta grátis"}</h2>
          <p className="muted small">{mode === "login" ? "Entre com seu e-mail e senha." : "Leva menos de um minuto."}</p>
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "on" : ""} onClick={() => setMode("register")}>
              Criar conta
            </button>
            <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "on" : ""} onClick={() => setMode("login")}>
              Entrar
            </button>
          </div>
          {error && <div className="form-error">{error}</div>}
          {mode === "register" && (
            <>
              <div className="choice-grid" style={{ marginBottom: 14 }}>
                <button type="button" className={`choice ${!join ? "on" : ""}`} onClick={() => setJoin(false)}>
                  <b>🏠 Nova família</b>
                  <span>Sou a primeira pessoa</span>
                </button>
                <button type="button" className={`choice ${join ? "on" : ""}`} onClick={() => setJoin(true)}>
                  <b>🔑 Tenho um código</b>
                  <span>Alguém já me convidou</span>
                </button>
              </div>
              <div className="field">
                <label htmlFor="au-name">Seu nome</label>
                <input id="au-name" required maxLength={60} autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              {join ? (
                <div className="field">
                  <label htmlFor="au-code">Código da família</label>
                  <input id="au-code" required maxLength={12} placeholder="Ex.: MXL5S6" style={{ textTransform: "uppercase", letterSpacing: 2 }} value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />
                </div>
              ) : (
                <div className="field">
                  <label htmlFor="au-house">Nome da família (opcional)</label>
                  <input id="au-house" maxLength={60} placeholder="Ex.: Família Silva" value={householdName} onChange={(e) => setHouseholdName(e.target.value)} />
                </div>
              )}
            </>
          )}
          <div className="field">
            <label htmlFor="au-email">E-mail</label>
            <input id="au-email" type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="au-pass">Senha</label>
            <input
              id="au-pass"
              type="password"
              required
              minLength={mode === "register" ? 8 : 1}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === "register" && <span className="hint">Mínimo de 8 caracteres.</span>}
          </div>
          {mode === "register" && (
            <label className="check-line" style={{ marginBottom: 16 }}>
              <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
              <span>
                <b>Começar com dados de exemplo</b> — 7 meses fictícios {join ? "" : "e uma família de exemplo (Mãe, Pai, Irmão)"} para testar tudo. Dá para remover depois.
              </span>
            </label>
          )}
          <button type="submit" className="btn dark block" disabled={busy} style={{ minHeight: 48 }}>
            {busy && <Spinner />} {mode === "login" ? "Entrar" : busy ? "Preparando seu ninho…" : "Criar conta"}
          </button>
          {mode === "login" && (
            <button type="button" className="btn ghost block" style={{ marginTop: 10 }} onClick={() => setMode("forgot")}>
              Esqueci minha senha
            </button>
          )}
        </form>
        )}
      </section>
    </div>
  );
}
