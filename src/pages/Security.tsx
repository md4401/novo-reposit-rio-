// Golpes e segurança: movimentos suspeitos dos últimos 7 dias e dicas contra os golpes mais comuns.
import type { ScamAlert } from "../../shared/types";
import { ErrorBox, Heading, Money, Panel, Skeleton } from "../components/ui";
import { dayLabel } from "../lib/format";
import { useData } from "../lib/useData";

const TIPS = [
  ["📱", "Golpe do falso parente", "Mensagem de número novo dizendo “troquei de celular” e pedindo Pix urgente. Ligue para o número antigo antes de qualquer coisa."],
  ["🏦", "Falsa central do banco", "O banco nunca pede senha, código por SMS nem para transferir dinheiro para uma “conta segura”. Desligue e ligue você para o número do cartão."],
  ["🔗", "Links e boletos falsos", "Confira o nome de quem recebe antes de pagar um boleto ou Pix. Desconfie de promoção boa demais."],
  ["💳", "Cartão clonado", "Várias compras pequenas seguidas costumam ser teste de cartão. Bloqueie no app e peça um novo."],
  ["⏱️", "Limite noturno do Pix", "Diminua o limite do Pix à noite no app do banco: atrapalha golpes e sequestros relâmpago."],
] as const;

export function SecurityPage() {
  const { data, error, reload } = useData<ScamAlert[]>("security");
  return (
    <>
      <Heading title="Golpes e segurança" subtitle="O ninho olha os últimos 7 dias e avisa quando algo foge do seu padrão." />
      {error && <ErrorBox message={error} onRetry={reload} />}
      <div className="stack">
        {!data ? (
          <Skeleton />
        ) : (
          <Panel title={data.length ? "Confira estes movimentos" : "Nada suspeito nos últimos 7 dias ✅"}>
            {data.map((a) => (
              <div key={a.id} className="setting-row">
                <div style={{ minWidth: 0 }}>
                  <h4>
                    🛡️ {a.description} · {dayLabel(a.occurredOn)}
                  </h4>
                  <p>{a.reason}</p>
                </div>
                <Money cents={a.amountCents} />
              </div>
            ))}
            {data.length === 0 && <p className="small muted">Pix altos para quem nunca recebeu de você e cobranças pequenas em série aparecem aqui.</p>}
          </Panel>
        )}
        <Panel title="Como se proteger">
          {TIPS.map(([icon, title, text]) => (
            <div key={title} className="setting-row">
              <div>
                <h4>
                  {icon} {title}
                </h4>
                <p>{text}</p>
              </div>
            </div>
          ))}
        </Panel>
      </div>
    </>
  );
}
