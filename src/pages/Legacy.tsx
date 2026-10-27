// "E se eu faltar?": instruções para uma pessoa de confiança (onde estão as contas, seguros, o que pagar).
// Nunca senhas. Liberação: já, ou só depois de muitos dias sem a pessoa abrir o app.
import { useEffect, useState } from "react";
import type { LegacyMine, LegacyShared } from "../../shared/types";
import { ErrorBox, Heading, Panel, Segmented, Skeleton, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { useData } from "../lib/useData";
import { useApp } from "../state";

const TEMPLATE = `Bancos e contas: (ex.: Nubank — conta e cartão; Caixa — poupança)
Seguros: (ex.: seguro de vida Porto, apólice na gaveta do escritório)
Contas que vencem todo mês: (luz, água, aluguel — débito automático?)
Investimentos: (onde estão, quem é o gerente)
Documentos importantes: (onde guardo)
Quem procurar: (contador, advogado, gerente do banco)
Recados:`;

export function LegacyPage() {
  const { me, toast } = useApp();
  const { data, error, reload } = useData<{ mine: LegacyMine; shared: LegacyShared }>("legacy");
  const [content, setContent] = useState("");
  const [trustedId, setTrustedId] = useState("");
  const [mode, setMode] = useState<"now" | "inactive">("inactive");
  const [days, setDays] = useState(60);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!data) return;
    setContent(data.mine?.content ?? TEMPLATE);
    setTrustedId(data.mine?.trustedId ?? "");
    setMode(data.mine?.releaseMode ?? "inactive");
    setDays(data.mine?.inactiveDays ?? 60);
  }, [data]);
  const people = (me?.household.members ?? []).filter((m) => !m.isDemo && !m.isMe);

  async function save() {
    setBusy(true);
    try {
      await api("legacy", { method: "PUT", body: { content, trustedId: trustedId || null, releaseMode: mode, inactiveDays: days } });
      toast("Guardado com cuidado. 💚");
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Heading title="E se eu faltar?" subtitle="Um bilhete para quem você confia: o que existe e onde está. Nunca escreva senhas — só onde elas ficam guardadas." />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? (
        <Skeleton />
      ) : (
        <div className="stack">
          {data.shared.length > 0 && (
            <Panel title="Deixaram para você">
              {data.shared.map((s) => (
                <div key={s.ownerName} style={{ marginBottom: 12 }}>
                  <h4>{s.ownerName}</h4>
                  {s.available ? (
                    <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 14, marginTop: 6 }}>{s.content}</pre>
                  ) : (
                    <p className="small muted">
                      {s.ownerName} te escolheu como pessoa de confiança. O bilhete só abre se {s.ownerName} ficar {s.inactiveDays} dias sem abrir o ninho.
                    </p>
                  )}
                </div>
              ))}
            </Panel>
          )}
          <Panel title="Meu bilhete">
            <textarea aria-label="Instruções" rows={10} maxLength={8000} value={content} onChange={(e) => setContent(e.target.value)} style={{ width: "100%" }} />
            <div className="field" style={{ marginTop: 10 }}>
              <label htmlFor="lg-who">Pessoa de confiança</label>
              <select id="lg-who" value={trustedId} onChange={(e) => setTrustedId(e.target.value)}>
                <option value="">Ninguém ainda</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Quando a pessoa pode ler</label>
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  ["inactive", "Só se eu sumir"],
                  ["now", "Já pode ler"],
                ]}
              />
              {mode === "inactive" && (
                <select aria-label="Dias sem abrir o app" value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ marginTop: 8 }}>
                  {[30, 60, 90, 180].map((d) => (
                    <option key={d} value={d}>
                      Depois de {d} dias sem eu abrir o ninho
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn dark" disabled={busy || !content.trim()} onClick={() => void save()}>
                {busy && <Spinner />} Salvar
              </button>
              {data.mine && (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() =>
                    window.confirm("Apagar o bilhete?") && void api("legacy", { method: "DELETE" }).then(() => toast("Bilhete apagado."), (e: Error) => toast(e.message))
                  }
                >
                  Apagar
                </button>
              )}
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}
