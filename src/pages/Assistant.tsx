// Assistente Nia: conversa privada, lançamentos por texto ou voz (com confirmação) e nota fiscal.
import { Bell, Camera, Check, ChevronRight, Lock, Mic, Pencil, Send, Sparkles, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { NiaMessage, Proposal } from "../../shared/types";
import { ErrorBox, Heading, Panel, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { createTransaction } from "../lib/offline";
import { category, dayLabel, formatMoney } from "../lib/format";
import { blobToDataUrl, recordingSupported, startRecording, type Recording } from "../lib/recorder";
import { listen, speechSupported } from "../lib/speech";
import { useData } from "../lib/useData";
import { DigestModal } from "../modals/DigestModal";
import { NewTransactionModal } from "../modals/NewTransactionModal";
import { ReceiptModal } from "../modals/ReceiptModal";
import { useApp } from "../state";

const QUICK = ["Quanto gastei este mês?", "O que falta classificar?", "Quais assinaturas estão ativas?", "Como está a família?", "Gastei 45 na farmácia"];
const SAVED_KEY = "ninho.savedProposals";

function savedProposals(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function ProposalCard({ message, onSaved, saved }: { message: NiaMessage; saved: boolean; onSaved: (id: string) => void }) {
  const { openModal, toast, refreshMe } = useApp();
  const [busy, setBusy] = useState(false);
  const p = message.proposal as Proposal;

  async function confirm() {
    setBusy(true);
    try {
      const { queued } = await createTransaction({
        description: p.description,
        amountCents: p.amountCents,
        direction: p.direction,
        occurredOn: p.occurredOn,
        allocations: p.allocations,
        source: "voice",
      });
      onSaved(message.id);
      if (queued) return toast("Sem internet: guardei no aparelho e envio quando a conexão voltar.");
      await refreshMe();
      toast("Lançamento salvo. ✅");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="proposal">
      <div className="proposal-row">
        <b>{p.description}</b>
        <b className="num">{formatMoney(p.amountCents)}</b>
      </div>
      {p.allocations.map((a, i) => (
        <div className="proposal-row" key={i}>
          <span>
            {category(a.categoryId).icon} {category(a.categoryId).name} · {a.scope === "family" ? "🏠 familiar" : "🔒 pessoal"}
          </span>
          <span className="num">{formatMoney(a.amountCents)}</span>
        </div>
      ))}
      <div className="proposal-row muted">
        <span>{p.direction === "income" ? "Receita" : "Despesa"}</span>
        <span>{dayLabel(p.occurredOn)}</span>
      </div>
      {saved ? (
        <div className="chip green" style={{ marginTop: 8 }}>
          <Check size={12} /> Salvo
        </div>
      ) : (
        <div className="proposal-actions">
          <button type="button" className="btn dark small" disabled={busy} onClick={confirm}>
            {busy ? <Spinner size={13} /> : <Check size={13} />} Confirmar
          </button>
          <button type="button" className="btn ghost small" onClick={() => openModal(<NewTransactionModal proposal={p} source="voice" />)}>
            <Pencil size={13} /> Editar
          </button>
        </div>
      )}
    </div>
  );
}

export function AssistantPage() {
  const { me, openModal, toast } = useApp();
  const { data, error, reload } = useData<NiaMessage[]>("nia");
  const [messages, setMessages] = useState<NiaMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [saved, setSaved] = useState(savedProposals);
  const stop = useRef<() => void>(() => undefined);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (data) setMessages(data);
  }, [data]);
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);
  useEffect(() => () => stop.current(), []);
  // Cronômetro da gravação (para sozinho em 60 s)
  useEffect(() => {
    if (!recording) return;
    setSeconds(0);
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [recording]);
  useEffect(() => {
    if (recording && seconds >= 60) void finishRecording();
  }, [seconds]);

  function markSaved(id: string) {
    setSaved((s) => {
      const next = new Set(s).add(id);
      try {
        localStorage.setItem(SAVED_KEY, JSON.stringify([...next].slice(-200)));
      } catch {
        // ignora
      }
      return next;
    });
  }

  async function send(message: string) {
    const clean = message.trim();
    if (!clean || sending) return;
    setText("");
    setSending(true);
    const optimistic: NiaMessage = { id: `tmp-${Date.now()}`, role: "user", content: clean, proposal: null, createdAt: new Date().toISOString() };
    setMessages((m) => [...m.filter((x) => x.id !== "welcome"), optimistic]);
    try {
      const reply = await api<NiaMessage[]>("nia", { body: { message: clean } });
      setMessages((m) => [...m.filter((x) => x.id !== optimistic.id), ...reply]);
    } catch (e) {
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      setText(clean);
      toast((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function finishRecording() {
    if (!recording) return;
    const rec = recording;
    setRecording(null);
    setTranscribing(true);
    try {
      const audio = await blobToDataUrl(await rec.stop());
      const { text: heard } = await api<{ text: string }>("nia/transcribe", { body: { audio }, silent: true });
      setText((t) => (t ? `${t} ${heard}` : heard));
      toast("Confira o que entendi e toque em enviar.");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setTranscribing(false);
    }
  }

  async function toggleVoice() {
    // Com IA de transcrição: grava e transcreve no servidor (funciona também no APK)
    if (me?.voiceEnabled && recordingSupported()) {
      if (recording) return finishRecording();
      try {
        setRecording(await startRecording());
        toast("Pode falar. Toque no quadrado vermelho para terminar.");
      } catch {
        toast("Permita o uso do microfone para mandar mensagens de voz.");
      }
      return;
    }
    if (listening) {
      stop.current();
      return;
    }
    if (!speechSupported()) {
      toast("Use o microfone do teclado do celular para ditar — a transcrição aparece no campo antes de enviar.");
      return;
    }
    setListening(true);
    stop.current = listen(
      (t) => setText(t),
      (err) => {
        setListening(false);
        if (err === "not-allowed") toast("Permita o uso do microfone para falar com a Nia.");
        else if (err && err !== "no-speech" && err !== "aborted") toast("Não consegui ouvir. Tente de novo ou digite.");
      },
    );
  }

  async function clear() {
    if (!window.confirm("Apagar toda a conversa com a Nia?")) return;
    setMessages(await api<NiaMessage[]>("nia/clear", { body: {} }));
  }

  const pending = me?.pendingCount ?? 0;
  return (
    <>
      <Heading
        title="Assistente Nia"
        subtitle="Um jeito natural de entender e organizar suas finanças."
        actions={
          <button type="button" className="btn ghost" onClick={() => openModal(<DigestModal />)}>
            <Bell size={15} /> Pendências do dia {pending > 0 && <span className="chip lime">{pending}</span>}
          </button>
        }
      />
      {error && <ErrorBox message={error} onRetry={reload} />}
      <div className="assistant-layout">
        <div>
          <div className="chat-card">
            <div className="chat-head">
              <div className="chat-orb">
                <Sparkles size={22} />
              </div>
              <div style={{ minWidth: 0 }}>
                <h3>Nia • Sua assistente financeira</h3>
                <div className="online">● {me?.aiEnabled ? "IA conectada" : "Respostas do ninho (sem IA externa)"} · conversa privada</div>
              </div>
              <button type="button" className="icon-btn" style={{ marginLeft: "auto" }} onClick={clear} aria-label="Apagar conversa" title="Apagar conversa">
                <Trash2 size={15} />
              </button>
            </div>
            <div className="chat-messages" ref={box} aria-live="polite">
              {!data && <Spinner />}
              {messages.map((m) => (
                <div key={m.id} className={`bubble ${m.role}`}>
                  {m.content}
                  {m.proposal && <ProposalCard message={m} saved={saved.has(m.id)} onSaved={markSaved} />}
                </div>
              ))}
              {sending && (
                <div className="bubble assistant">
                  <Spinner size={14} /> Pensando…
                </div>
              )}
            </div>
            <form
              className="chat-footer"
              onSubmit={(e) => {
                e.preventDefault();
                void send(text);
              }}
            >
              <button
                type="button"
                className={`icon-btn ${listening || recording ? "listening" : ""}`}
                onClick={() => void toggleVoice()}
                disabled={transcribing}
                aria-label={listening || recording ? "Parar de gravar" : "Mandar mensagem de voz"}
                title="Falar (a transcrição aparece antes de enviar)"
              >
                {transcribing ? <Spinner size={16} /> : recording ? <Square size={15} /> : <Mic size={17} />}
              </button>
              <button type="button" className="icon-btn" onClick={() => openModal(<ReceiptModal />)} aria-label="Ler nota fiscal" title="Ler nota fiscal">
                <Camera size={17} />
              </button>
              <input className="chat-input" placeholder={
                  recording
                    ? `Gravando… 0:${String(seconds).padStart(2, "0")}`
                    : transcribing
                      ? "Transcrevendo seu áudio…"
                      : listening
                        ? "Ouvindo… fale naturalmente"
                        : "Pergunte ou conte uma compra…"
                } value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} autoComplete="off" />
              <button className="chat-send" type="submit" disabled={!text.trim() || sending} aria-label="Enviar">
                <Send size={17} />
              </button>
            </form>
          </div>
          <div className="chat-quick">
            {QUICK.map((q) => (
              <button key={q} type="button" className="quick" onClick={() => send(q)}>
                {q}
              </button>
            ))}
          </div>
        </div>
        <div className="stack">
          <Panel title="O que a Nia pode fazer?">
            <div className="insights">
              <div className="insight">
                <span className="insight-ic">🎙️</span>
                <div>
                  <h4>Entender sua voz</h4>
                  <p>Toque no microfone e fale “comprei 80 de comida e 30 de limpeza no mercado”. Você confere o texto antes de enviar.</p>
                </div>
              </div>
              <div className="insight">
                <span className="insight-ic">📸</span>
                <div>
                  <h4>Ler notas fiscais</h4>
                  <p>{me?.aiEnabled ? "Transforma os produtos da foto em categorias." : "Exemplo simulado até configurar a chave de IA."}</p>
                </div>
              </div>
              <div className="insight">
                <span className="insight-ic">🧠</span>
                <div>
                  <h4>Aprender com você</h4>
                  <p>Depois de 2 confirmações iguais, o estabelecimento vira regra automática (desligável).</p>
                </div>
              </div>
            </div>
          </Panel>
          <Panel>
            <h3>Seu resumo diário</h3>
            <div className="num" style={{ fontSize: 31, fontWeight: 850, letterSpacing: -1, margin: "12px 0 4px" }}>
              {String(pending).padStart(2, "0")}
            </div>
            <p className="muted small">transações precisam da sua atenção.</p>
            <button type="button" className="btn primary block" style={{ marginTop: 16 }} onClick={() => openModal(<DigestModal />)}>
              Revisar pendências <ChevronRight size={14} />
            </button>
          </Panel>
          <div className="privacy-line" style={{ marginTop: 0 }}>
            <Lock size={17} />
            <div>
              <strong>Conversa privada</strong>A Nia só usa os seus dados e os totais da família. Ela nunca faz Pix nem pagamentos.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
