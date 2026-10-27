// Guia de primeiros passos na tela inicial: some quando tudo estiver feito (ou se a pessoa ocultar).
import { Check, ChevronRight, Sparkles, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api, onChange } from "../lib/api";
import { navigate } from "../lib/router";
import { NewAccountModal } from "../modals/AccountModals";
import { NewGoalModal } from "../modals/GoalModals";
import { QuickAddSheet } from "../modals/MenuSheets";
import { useApp } from "../state";
import { Progress, Spinner } from "./ui";

type Step = { key: string; title: string; text: string; done: boolean; action: () => void };

const hiddenKey = (profileId: string) => `ninho.guide.${profileId}`;

function readHidden(profileId: string) {
  try {
    return localStorage.getItem(hiddenKey(profileId)) === "1";
  } catch {
    return false;
  }
}

export function GettingStarted() {
  const { me, openModal, refreshMe, toast } = useApp();
  const [hidden, setHidden] = useState(() => (me ? readHidden(me.profile.id) : false));
  const [loadingDemo, setLoadingDemo] = useState(false);
  // Conta, meta ou orçamento criados em outra janela: atualiza o progresso
  useEffect(() => (hidden ? undefined : onChange(() => void refreshMe())), [hidden, refreshMe]);
  if (!me || hidden) return null;

  const realMembers = me.household.members.filter((m) => !m.isDemo).length;
  const steps: Step[] = [
    {
      key: "account",
      title: "Cadastre sua conta ou cartão",
      text: "Conta corrente, cartão de crédito ou dinheiro.",
      done: me.accounts.length > 0,
      action: () => openModal(<NewAccountModal />),
    },
    {
      key: "tx",
      title: "Registre ou importe movimentações",
      text: "Lance uma despesa ou traga o extrato do banco.",
      done: me.setup.hasTransactions,
      action: () => openModal(<QuickAddSheet />),
    },
    {
      key: "family",
      title: "Convide sua família",
      text: "Cada pessoa tem a própria conta; a casa vê só os totais.",
      done: realMembers > 1,
      action: () => navigate("familia"),
    },
    {
      key: "budget",
      title: "Defina um orçamento",
      text: "Um limite por categoria. A Nia avisa em 80%.",
      done: me.setup.hasBudget,
      action: () => navigate("orcamento"),
    },
    {
      key: "goal",
      title: "Crie uma meta",
      text: "Viagem, reserva de emergência, um sonho da casa.",
      done: me.setup.hasGoal,
      action: () => openModal(<NewGoalModal />),
    },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const next = steps.find((s) => !s.done)!;

  function hide() {
    try {
      localStorage.setItem(hiddenKey(me!.profile.id), "1");
    } catch {
      // sem armazenamento: some só nesta visita
    }
    setHidden(true);
  }

  async function loadDemo() {
    setLoadingDemo(true);
    try {
      await api("demo/load", { body: {} });
      await refreshMe();
      toast("Dados de exemplo carregados. Remova quando quiser em Configurações.");
    } catch (error) {
      toast((error as Error).message);
    } finally {
      setLoadingDemo(false);
    }
  }

  return (
    <section className="guide" aria-label="Primeiros passos">
      <div className="guide-head">
        <div>
          <span className="guide-badge">
            <Sparkles size={13} /> Primeiros passos
          </span>
          <h2>Deixe o ninho com a sua cara</h2>
          <p>
            {done} de {steps.length} concluídos · leva poucos minutos
          </p>
        </div>
        <button type="button" className="icon-btn ghost-dark" onClick={hide} aria-label="Ocultar guia" title="Ocultar guia">
          <X size={16} />
        </button>
      </div>
      <Progress value={done / steps.length} tone="lime" />
      <ol className="guide-steps">
        {steps.map((s, i) => (
          <GuideStep key={s.key} n={i + 1} step={s} current={s === next} />
        ))}
      </ol>
      {!me.hasDemoData && !me.setup.hasTransactions && (
        <div className="guide-demo">
          <span>Prefere ver como fica antes? Explore com 7 meses de dados fictícios.</span>
          <button type="button" className="btn ghost small" onClick={loadDemo} disabled={loadingDemo}>
            {loadingDemo && <Spinner size={14} />} Explorar com exemplo
          </button>
        </div>
      )}
    </section>
  );
}

function GuideStep({ n, step, current }: { n: number; step: Step; current: boolean }): ReactNode {
  return (
    <li>
      <button type="button" className={`guide-step ${step.done ? "done" : ""} ${current ? "current" : ""}`} onClick={step.action} disabled={step.done}>
        <span className="guide-n">{step.done ? <Check size={14} /> : n}</span>
        <span className="guide-text">
          <b>{step.title}</b>
          <small>{step.done ? "Feito" : step.text}</small>
        </span>
        {!step.done && <ChevronRight size={16} />}
      </button>
    </li>
  );
}
