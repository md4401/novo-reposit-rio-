import { Activity, Check, CircleX, FileUp, Lock, TriangleAlert } from "lucide-react";
import type { Health } from "../../shared/types";
import { ErrorBox, Heading, Panel, Progress, Skeleton } from "../components/ui";
import { relativeDays } from "../lib/format";
import { useData } from "../lib/useData";
import { ImportModal } from "../modals/AccountModals";
import { useApp } from "../state";

const STATUS = {
  ok: { label: "Em dia", cls: "", color: "#2b8e65", icon: <Check size={18} /> },
  warn: { label: "Atenção", cls: "warn", color: "#ab8238", icon: <TriangleAlert size={18} /> },
  stale: { label: "Desatualizada", cls: "bad", color: "#ba6757", icon: <CircleX size={18} /> },
  never: { label: "Sem dados", cls: "bad", color: "#ba6757", icon: <CircleX size={18} /> },
};

function Check4({ label, value, sub, ratio }: { label: string; value: string; sub: string; ratio: number }) {
  return (
    <div className="check-card">
      <div className="barlabel">
        <span>{label}</span>
        <Activity size={15} />
      </div>
      <strong className="num">{value}</strong>
      <small>{sub}</small>
      <Progress value={ratio} tone={ratio < 0.5 ? "warn" : undefined} />
    </div>
  );
}

export function HealthPage() {
  const { openModal } = useApp();
  const { data, error, reload } = useData<Health>("health");
  const pct = (a: number, b: number) => (b ? a / b : 1);

  return (
    <>
      <Heading
        title="Saúde dos dados"
        subtitle="Saiba quando os indicadores podem estar incompletos."
        actions={
          <button type="button" className="btn ghost" onClick={() => openModal(<ImportModal />)}>
            <FileUp size={15} /> Importar extrato
          </button>
        }
      />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? (
        <Skeleton height={300} />
      ) : (
        <>
          {data.warning ? (
            <div className="notice warn" style={{ marginBottom: 16 }}>
              <TriangleAlert size={19} />
              <div>
                <h3>Algumas informações exigem atenção</h3>
                <p>Há conta sem atualização recente. Os relatórios dos períodos afetados podem não incluir todas as movimentações — e uma “economia” pode ser só falta de dados.</p>
              </div>
            </div>
          ) : (
            <div className="notice info" style={{ marginBottom: 16 }}>
              <Check size={19} />
              <div>
                <h3>Fontes em dia</h3>
                <p>Todas as contas ativas foram atualizadas nos últimos dias.</p>
              </div>
            </div>
          )}
          <div className="check-grid">
            <Check4 label="Atualização das fontes" value={`${data.coverage.covered} de ${data.coverage.total}`} sub={`${Math.round(pct(data.coverage.covered, data.coverage.total) * 100)}% em dia`} ratio={pct(data.coverage.covered, data.coverage.total)} />
            <Check4 label="Transações categorizadas" value={`${data.classification.classified} de ${data.classification.total}`} sub={`${Math.round(pct(data.classification.classified, data.classification.total) * 100)}% neste mês`} ratio={pct(data.classification.classified, data.classification.total)} />
            <Check4 label="Divergências identificadas" value={String(data.duplicates)} sub={data.duplicates ? "Possíveis duplicidades" : "Sem casos em aberto"} ratio={data.duplicates ? 0.4 : 1} />
            <Check4 label="Pendências de revisão" value={String(data.pending)} sub="Compras para classificar" ratio={Math.max(0, 1 - data.pending * 0.2)} />
          </div>
          <div className="grid-2">
            <div className="stack">
              <Panel title="Estado das fontes">
                {data.sources.length === 0 && <p className="muted small">Nenhuma conta cadastrada. Cadastre em Contas e extratos.</p>}
                {data.sources.map((s) => {
                  const st = STATUS[s.status];
                  return (
                    <div className="status-item" key={s.accountId}>
                      <div className={`status-dot ${st.cls}`}>{st.icon}</div>
                      <div>
                        <h4>{s.name}</h4>
                        <p>Última atualização: {relativeDays(s.lastSyncedAt)}</p>
                      </div>
                      {s.status === "ok" ? (
                        <span className="status-value" style={{ color: st.color }}>
                          {st.label}
                        </span>
                      ) : (
                        <button type="button" className="btn ghost small" onClick={() => openModal(<ImportModal accountId={s.accountId} />)}>
                          Atualizar
                        </button>
                      )}
                    </div>
                  );
                })}
              </Panel>
              <Panel title="Últimas importações">
                {data.imports.length === 0 && <p className="muted small">Nenhuma importação ainda.</p>}
                {data.imports.map((r) => (
                  <div className="status-item" key={r.id}>
                    <div className={`status-dot ${r.status === "failed" ? "bad" : ""}`}>{r.status === "failed" ? <CircleX size={17} /> : <FileUp size={17} />}</div>
                    <div>
                      <h4>{r.fileName ?? r.format.toUpperCase()}</h4>
                      <p>
                        {r.accountName ?? "Conta removida"} · {relativeDays(r.createdAt)} · {r.rowsImported} novas
                        {r.rowsDuplicated ? `, ${r.rowsDuplicated} repetidas puladas` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </Panel>
            </div>
            <div className="stack">
              <Panel title="Como interpretar os dados?">
                <div className="insights">
                  <div className="insight">
                    <span className="insight-ic">🔄</span>
                    <div>
                      <h4>Atualização</h4>
                      <p>Há quanto tempo cada conta trouxe dados novos. Mais de 7 dias = desatualizada.</p>
                    </div>
                  </div>
                  <div className="insight">
                    <span className="insight-ic">🧩</span>
                    <div>
                      <h4>Cobertura</h4>
                      <p>Quantas das suas contas estão sendo acompanhadas. Conta fora do ninho = total incompleto.</p>
                    </div>
                  </div>
                  <div className="insight">
                    <span className="insight-ic">🏷️</span>
                    <div>
                      <h4>Classificação</h4>
                      <p>Quanto do mês já tem categoria. Pendências entram nos totais como “A confirmar”.</p>
                    </div>
                  </div>
                  <div className="insight">
                    <span className="insight-ic">🔍</span>
                    <div>
                      <h4>Reconciliação</h4>
                      <p>Importar o mesmo extrato de novo não duplica nada; cobranças iguais e próximas viram suspeita para você conferir.</p>
                    </div>
                  </div>
                </div>
              </Panel>
              <div className="privacy-line" style={{ margin: 0 }}>
                <Lock size={18} />
                <div>
                  <strong>Só você vê quais bancos precisam de atenção.</strong>O painel da família mostra apenas um aviso geral, sem revelar instituições ou contas de ninguém.
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
