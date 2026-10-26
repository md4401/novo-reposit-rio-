import { Copy, Download, LogOut, RefreshCw, Share2, Smartphone, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { Me, Rule } from "../../shared/types";
import { Avatar, Heading, Panel, Spinner, Toggle } from "../components/ui";
import { api } from "../lib/api";
import { category } from "../lib/format";
import { checkUpdate, isNative, type UpdateInfo } from "../lib/native";
import { canInstall, isInstalled, onInstallChange, promptInstall } from "../lib/pwa";
import { useData } from "../lib/useData";
import { useApp } from "../state";
import { inviteText } from "./Family";

// No APK o link precisa ser absoluto: o Android entrega o download ao navegador.
const APK_URL = `${window.location.origin}/download/ninho.apk`;

export function SettingsPage() {
  const { me, refreshMe, toast, hidden, toggleHidden, signOut } = useApp();
  const rules = useData<Rule[]>("rules");
  const [name, setName] = useState(me?.profile.name ?? "");
  const [household, setHousehold] = useState(me?.household.name ?? "");
  const [hour, setHour] = useState(me?.profile.digestHour ?? 20);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [, force] = useState(0);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  useEffect(() => onInstallChange(() => force((n) => n + 1)), []);
  useEffect(() => void checkUpdate(true).then(setUpdate), []);
  if (!me) return null;
  const admin = me.profile.role === "admin";

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api<Me>("me", { method: "PATCH", body: { name, digestHour: hour, ...(admin ? { householdName: household } : {}) } });
      await refreshMe();
      toast("Configurações salvas.");
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function action(key: string, path: string, message: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(key);
    try {
      await api(path, { body: {} });
      await refreshMe();
      toast(message);
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function toggleRule(r: Rule, active: boolean) {
    await api(`rules/${r.id}`, { method: "PATCH", body: { active } });
    toast(active ? "Regra ligada." : "Regra desligada: esse estabelecimento volta a pedir revisão.");
  }

  async function deleteRule(r: Rule) {
    await api(`rules/${r.id}`, { method: "DELETE" });
    toast("Regra apagada.");
  }

  return (
    <>
      <Heading title="Configurações" subtitle="Seu perfil, sua família, privacidade e o app no celular." />
      <div className="grid-even" style={{ marginTop: 0 }}>
        <div className="stack">
          <Panel title="Seu perfil">
            <form onSubmit={saveProfile}>
              <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 16 }}>
                <Avatar name={me.profile.name} color={me.profile.avatarColor} large />
                <div>
                  <b>{me.profile.name}</b>
                  <div className="muted small">{me.profile.email}</div>
                </div>
              </div>
              <div className="field">
                <label htmlFor="s-name">Seu nome</label>
                <input id="s-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              {admin && (
                <div className="field">
                  <label htmlFor="s-house">Nome da família</label>
                  <input id="s-house" maxLength={60} value={household} onChange={(e) => setHousehold(e.target.value)} />
                </div>
              )}
              <div className="field">
                <label htmlFor="s-hour">Horário do resumo diário</label>
                <select id="s-hour" value={hour} onChange={(e) => setHour(Number(e.target.value))}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
                <span className="hint">As compras em dúvida ficam juntas num lote só, em vez de um aviso por compra.</span>
              </div>
              <button type="submit" className="btn dark" disabled={saving}>
                {saving && <Spinner />} Salvar
              </button>
            </form>
          </Panel>

          <Panel title="Família">
            <p className="muted small" style={{ marginBottom: 10 }}>
              Código para outra pessoa entrar em <b>{me.household.name}</b>:
            </p>
            <div className="code-box num">{me.household.inviteCode}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <a className="btn primary small" href={`https://wa.me/?text=${encodeURIComponent(inviteText(me.household.inviteCode))}`} target="_blank" rel="noreferrer">
                <Share2 size={13} /> Convidar pelo WhatsApp
              </a>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => {
                  void navigator.clipboard?.writeText(me.household.inviteCode);
                  toast("Código copiado.");
                }}
              >
                <Copy size={13} /> Copiar
              </button>
              {admin && (
                <button type="button" className="btn ghost small" disabled={busy === "invite"} onClick={() => action("invite", "household/invite", "Novo código gerado. O antigo não funciona mais.")}>
                  <RefreshCw size={13} /> Gerar novo código
                </button>
              )}
            </div>
            <div style={{ marginTop: 16 }}>
              {me.household.members.map((m) => (
                <div className="status-item" key={m.id}>
                  <Avatar name={m.name} color={m.avatarColor} />
                  <div>
                    <h4>
                      {m.name}
                      {m.isMe ? " (você)" : ""}
                    </h4>
                    <p>{m.isDemo ? "Integrante de exemplo" : m.role === "admin" ? "Administra a família" : "Integrante"}</p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Regras automáticas">
            <p className="muted small" style={{ marginBottom: 6 }}>
              Aprendidas com as suas confirmações. Valem só para as suas compras.
            </p>
            {rules.data?.length === 0 && <p className="muted small">Nenhuma regra ainda.</p>}
            {rules.data?.map((r) => (
              <div className="setting-row" key={r.id}>
                <div style={{ minWidth: 0 }}>
                  <h4 style={{ textTransform: "capitalize" }}>{r.merchant}</h4>
                  <p>
                    {category(r.categoryId).icon} {category(r.categoryId).name} · {r.scope === "family" ? "familiar" : "pessoal"} · usada {r.hits}×
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Toggle on={r.active} onChange={(v) => toggleRule(r, v)} label={`Regra ${r.merchant}`} />
                  <button type="button" className="icon-btn" style={{ width: 32, height: 32 }} aria-label="Apagar regra" onClick={() => deleteRule(r)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </Panel>
        </div>

        <div className="stack">
          <Panel title="Instalar o app no celular">
            {isInstalled() ? (
              <p className="small">✅ Você já está usando o ninho como aplicativo.</p>
            ) : (
              <>
                <p className="muted small" style={{ marginBottom: 12 }}>
                  Fica com ícone na tela inicial, abre em tela cheia e funciona como app.
                </p>
                {canInstall() ? (
                  <button type="button" className="btn dark" onClick={() => void promptInstall()}>
                    <Smartphone size={15} /> Instalar o ninho
                  </button>
                ) : (
                  <div className="modal-note">
                    No <b>Chrome do Android</b>: toque nos três pontinhos <b>⋮</b> → <b>Instalar app</b> (ou <b>Adicionar à tela inicial</b>).
                  </div>
                )}
              </>
            )}
            <div className="setting-row" style={{ marginTop: 8 }}>
              <div>
                <h4>App Android (APK)</h4>
                {isNative() ? (
                  <p>
                    Versão instalada: <b>{update?.current.name ?? "…"}</b>.{" "}
                    {update?.latest ? `Nova versão ${update.latest.name} disponível — baixe e instale por cima (seus dados continuam).` : "Você está na versão mais recente."}
                  </p>
                ) : (
                  <p>Versão instalável sem a Play Store. O Android pede para permitir “instalar apps desta fonte”.</p>
                )}
              </div>
              {(!isNative() || update?.latest) && (
                <a className={`btn small ${update?.latest ? "primary" : "ghost"}`} href={APK_URL} download>
                  <Download size={13} /> {update?.latest ? "Atualizar" : "Baixar"}
                </a>
              )}
            </div>
          </Panel>

          <Panel title="Privacidade">
            <div className="setting-row">
              <div>
                <h4>Ocultar valores</h4>
                <p>Mostra R$ ••••• no lugar dos valores neste aparelho (bom para usar em público).</p>
              </div>
              <Toggle on={hidden} onChange={() => toggleHidden()} label="Ocultar valores" />
            </div>
            <div className="setting-row">
              <div>
                <h4>O que a família vê</h4>
                <p>Só totais das partes que você marcar como “familiar”. Nunca seu extrato, lojas, comprovantes, contas, regras ou conversas.</p>
              </div>
            </div>
            <div className="setting-row">
              <div>
                <h4>Conversa com a Nia</h4>
                <p>Fica guardada só para você.</p>
              </div>
              <button type="button" className="btn ghost small" disabled={busy === "nia"} onClick={() => action("nia", "nia/clear", "Conversa apagada.", "Apagar toda a conversa com a Nia?")}>
                Apagar
              </button>
            </div>
          </Panel>

          <Panel title="Dados de exemplo">
            {me.hasDemoData ? (
              <>
                <p className="muted small" style={{ marginBottom: 12 }}>
                  Seus dados de exemplo (e os integrantes Mãe, Pai e Irmão, se você administra a família) podem ser removidos quando você começar a usar de verdade. Seus lançamentos reais ficam.
                </p>
                <button
                  type="button"
                  className="btn danger"
                  disabled={busy === "demo"}
                  onClick={() => action("demo", "demo/clear", "Dados de exemplo removidos.", "Remover todos os dados de exemplo?")}
                >
                  {busy === "demo" && <Spinner />} Remover dados de exemplo
                </button>
              </>
            ) : (
              <>
                <p className="muted small" style={{ marginBottom: 12 }}>Quer ver o app cheio para testar? Carregue 7 meses de movimentações fictícias.</p>
                <button type="button" className="btn ghost" disabled={busy === "demo"} onClick={() => action("demo", "demo/load", "Dados de exemplo carregados.")}>
                  {busy === "demo" && <Spinner />} Carregar dados de exemplo
                </button>
              </>
            )}
          </Panel>

          <Panel>
            <button type="button" className="btn ghost block" onClick={() => void signOut()}>
              <LogOut size={15} /> Sair da conta neste aparelho
            </button>
            <p className="footer-note" style={{ marginTop: 14 }}>
              ninho. v0.1 · protótipo funcional · dados no Neon (São Paulo)
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}
