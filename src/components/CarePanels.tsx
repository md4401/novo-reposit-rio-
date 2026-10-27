// Configurações: modo de uso (completo, simples, criança) e acompanhamento consentido.
import { useState } from "react";
import type { GuardianInfo } from "../../shared/types";
import { api } from "../lib/api";
import { navigate } from "../lib/router";
import { useData } from "../lib/useData";
import { useApp } from "../state";
import { Panel, Segmented } from "./ui";

export function ModePanel() {
  const { me, refreshMe, toast } = useApp();
  if (!me) return null;
  async function set(mode: "full" | "simple" | "kid") {
    try {
      await api("me", { method: "PATCH", body: { uiMode: mode } });
      await refreshMe();
      toast(mode === "simple" ? "Modo simples: letras maiores e só o essencial." : mode === "kid" ? "Modo criança ligado." : "Modo completo.");
    } catch (err) {
      toast((err as Error).message);
    }
  }
  return (
    <Panel title="Modo de uso">
      <Segmented
        value={me.profile.uiMode}
        onChange={(m) => void set(m)}
        options={[
          ["full", "Completo"],
          ["simple", "Simples"],
          ["kid", "Criança"],
        ]}
      />
      <p className="small muted" style={{ marginTop: 8 }}>
        Simples: letras maiores e poucas telas, bom para quem tem menos intimidade com celular. Criança: mesada, cofrinhos e desafios.
      </p>
    </Panel>
  );
}

export function GuardianPanel() {
  const { me, toast } = useApp();
  const { data, reload } = useData<GuardianInfo>("guardians");
  const [pick, setPick] = useState("");
  if (!me) return null;
  const people = me.household.members.filter((m) => !m.isDemo && !m.isMe && !data?.guardians.some((g) => g.id === m.id));
  async function run(path: string, message: string, body?: unknown, method?: string) {
    try {
      await api(path, { body, method });
      toast(message);
      reload();
    } catch (err) {
      toast((err as Error).message);
    }
  }
  return (
    <Panel title="Acompanhamento">
      <p className="small muted" style={{ marginBottom: 8 }}>
        Autorize alguém de confiança (um filho, por exemplo) a ver seus <b>totais do mês, contas a pagar e alertas de golpe</b>. Suas compras e lojas continuam
        só suas. Você pode tirar a autorização quando quiser.
      </p>
      {data?.guardians.map((g) => (
        <div key={g.id} className="setting-row">
          <span>👀 {g.name} acompanha você</span>
          <button type="button" className="btn ghost small" onClick={() => void run(`guardians/${g.id}`, "Autorização retirada.", undefined, "DELETE")}>
            Tirar
          </button>
        </div>
      ))}
      {people.length > 0 && (
        <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 6 }}>
          <select aria-label="Quem pode acompanhar" value={pick} onChange={(e) => setPick(e.target.value)} style={{ flex: 1, minWidth: 140 }}>
            <option value="">Escolher pessoa…</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn dark small"
            disabled={!pick}
            onClick={() => window.confirm("Essa pessoa vai ver seus totais, contas a pagar e alertas de golpe. Confirmar?") && void run("guardians", "Autorizado.", { guardianId: pick })}
          >
            Autorizar
          </button>
        </div>
      )}
      {data && data.watching.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <p className="small muted">Você acompanha:</p>
          {data.watching.map((w) => (
            <div key={w.id} className="setting-row">
              <span>{w.name}</span>
              <div className="row" style={{ gap: 6 }}>
                <button type="button" className="btn primary small" onClick={() => navigate(`acompanhar?id=${w.id}`)}>
                  Ver
                </button>
                <button type="button" className="btn ghost small" onClick={() => void run(`guardians/${w.id}`, "Você deixou de acompanhar.", undefined, "DELETE")}>
                  Deixar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
