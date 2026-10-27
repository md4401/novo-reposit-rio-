// Desafios: pequenas metas de comportamento, com progresso calculado pelos lançamentos.
import { Flag, X } from "lucide-react";
import type { Challenge } from "../../shared/types";
import { CHALLENGES, type ChallengeKind } from "../../shared/planning";
import { Empty, ErrorBox, Heading, Panel, Progress, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { dayLabel } from "../lib/format";
import { useData } from "../lib/useData";
import { useApp } from "../state";
import { Glyph } from "../components/icons";

export function ChallengesPage() {
  const { toast } = useApp();
  const { data, error, reload } = useData<Challenge[]>("challenges");
  const active = new Set((data ?? []).filter((c) => c.status === "active").map((c) => c.kind));
  const won = (data ?? []).filter((c) => c.status === "won").length;

  async function start(kind: ChallengeKind) {
    try {
      await api("challenges", { body: { kind } });
      toast("Desafio aceito! Boa sorte. 💪");
    } catch (err) {
      toast((err as Error).message);
    }
  }

  return (
    <>
      <Heading title="Desafios" subtitle={`Pequenas metas para criar bons hábitos. ${won ? `Você já conquistou ${won}! 🏆` : "Escolha um para começar."}`} />
      {error && <ErrorBox message={error} onRetry={reload} />}
      <Panel title="Escolha um desafio">
        <div className="insights">
          {(Object.keys(CHALLENGES) as ChallengeKind[]).map((k) => (
            <div className="insight" key={k}>
              <span className="insight-ic">
                <Glyph emoji={CHALLENGES[k].icon} />
              </span>
              <div style={{ flex: 1 }}>
                <h4>{CHALLENGES[k].title}</h4>
                <p>{CHALLENGES[k].text}</p>
              </div>
              <button type="button" className="btn primary small" disabled={active.has(k)} onClick={() => void start(k)}>
                <Flag size={13} /> {active.has(k) ? "Em andamento" : "Aceitar"}
              </button>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Seus desafios">
        {!data ? (
          <Skeleton />
        ) : data.length === 0 ? (
          <Empty icon="🏁" title="Nenhum desafio ainda" />
        ) : (
          data.map((c) => (
            <div className="budget-row" key={c.id}>
              <div className="budget-top" style={{ paddingRight: c.status === "active" ? 40 : 0 }}>
                <span className="budget-name">
                  {c.icon} {c.title}
                </span>
                <span className={`chip ${c.status === "won" ? "green" : c.status === "active" ? "amber" : "gray"}`}>
                  {c.status === "won" ? "Conquistado" : c.status === "active" ? "Em andamento" : c.status === "lost" ? "Não deu" : "Desistiu"}
                </span>
              </div>
              <Progress value={c.progress} tone="lime" />
              <div className="budget-foot">
                <span>{c.detail}</span>
                <span className="muted">
                  {dayLabel(c.startsOn)} a {dayLabel(c.endsOn)}
                </span>
              </div>
              {c.status === "active" && (
                <div className="budget-actions">
                  <button type="button" className="icon-btn" aria-label="Desistir" onClick={() => window.confirm("Desistir deste desafio?") && void api(`challenges/${c.id}/abandon`, { body: {} })}>
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </Panel>
    </>
  );
}
