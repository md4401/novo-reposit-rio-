import { Lock, Plus, Trash2 } from "lucide-react";
import type { Goal } from "../../shared/types";
import { Empty, ErrorBox, Heading, Money, Progress, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { useData } from "../lib/useData";
import { ContributeModal, NewGoalModal } from "../modals/GoalModals";
import { useApp } from "../state";

export function GoalsPage() {
  const { openModal, toast, confirm } = useApp();
  const { data, error, reload } = useData<Goal[]>("goals");

  async function remove(g: Goal) {
    if (!(await confirm({ title: `Apagar a meta “${g.name}”?`, text: "As contribuições já feitas deixam de contar para ela.", confirmLabel: "Apagar", danger: true }))) return;
    try {
      await api(`goals/${g.id}`, { method: "DELETE" });
      toast("Meta apagada.");
    } catch (e) {
      toast((e as Error).message);
    }
  }

  return (
    <>
      <Heading
        title="Metas"
        subtitle="Transforme planos importantes em etapas possíveis."
        actions={
          <button type="button" className="btn dark" onClick={() => openModal(<NewGoalModal />)}>
            <Plus size={15} /> Nova meta
          </button>
        }
      />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? (
        <Skeleton height={220} />
      ) : data.length === 0 ? (
        <div className="list-box">
          <Empty
            icon="🎯"
            title="Nenhuma meta ainda"
            text="Crie uma meta pessoal ou da família, como uma reserva de emergência ou uma viagem."
            action={
              <button type="button" className="btn dark small" onClick={() => openModal(<NewGoalModal />)}>
                <Plus size={14} /> Criar a primeira meta
              </button>
            }
          />
        </div>
      ) : (
        <div className="goals">
          {data.map((g) => {
            const pct = g.savedCents / g.targetCents;
            return (
              <div className="goal-card" key={g.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div className="goal-icon">{g.icon}</div>
                  {g.isOwner && (
                    <button type="button" className="icon-btn" style={{ width: 32, height: 32 }} aria-label="Apagar meta" onClick={() => remove(g)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <div>
                  <h3>{g.name}</h3>
                  <div className="muted small">{g.scope === "family" ? "Meta da família" : "Meta pessoal"}</div>
                </div>
                <div className="goal-value">
                  <Money cents={g.savedCents} />{" "}
                  <small>
                    de <Money cents={g.targetCents} />
                  </small>
                </div>
                <Progress value={pct} tone={pct >= 1 ? "lime" : undefined} />
                <div className="muted small">
                  {pct >= 1 ? "🎉 Meta alcançada!" : `${Math.round(pct * 100)}% da meta alcançada`}
                  {g.scope === "family" && (
                    <>
                      {" "}
                      · você guardou <Money cents={g.myContributionCents} />
                    </>
                  )}
                </div>
                <button type="button" className="btn ghost small" onClick={() => openModal(<ContributeModal goal={g} />)}>
                  <Plus size={12} /> Guardar dinheiro
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="privacy-line" style={{ maxWidth: 680 }}>
        <Lock size={17} />
        <div>
          <strong>Metas pessoais e compartilhadas</strong>
          Nas metas da família, todos veem o progresso total; suas contribuições detalhadas continuam privadas. Metas pessoais só você vê.
        </div>
      </div>
    </>
  );
}
