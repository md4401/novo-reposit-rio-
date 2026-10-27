// Componentes básicos reaproveitados pelas telas.
import { ChevronLeft, ChevronRight, Info, LoaderCircle, X } from "lucide-react";
import type { ReactNode } from "react";
import type { Transaction } from "../../shared/types";
import { formatMoney, initials, monthLabel } from "../lib/format";
import { useApp } from "../state";

/** Valor em reais que respeita o botão "ocultar valores". */
export function Money({ cents, sign, className }: { cents: number; sign?: "-" | "+"; className?: string }) {
  const { hidden } = useApp();
  return (
    <span className={`num ${className ?? ""}`}>
      {sign ? `${sign === "-" ? "−" : "+"} ` : ""}
      {hidden ? "R$ •••••" : formatMoney(cents)}
    </span>
  );
}

export function Heading({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="heading-actions">{actions}</div>}
    </div>
  );
}

export function Metric({
  label,
  value,
  foot,
  icon,
  dark,
  onClick,
}: {
  label: string;
  value: ReactNode;
  foot?: ReactNode;
  icon: ReactNode;
  dark?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="cap">{label}</span>
      <span className="metric-icon">{icon}</span>
      <div className="val">{value}</div>
      {foot && <div className="foot">{foot}</div>}
    </>
  );
  return onClick ? (
    <button type="button" className={`metric ${dark ? "dark-card" : ""}`} onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className={`metric ${dark ? "dark-card" : ""}`}>{content}</div>
  );
}

export function Panel({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className ?? ""}`}>
      {(title || action) && (
        <div className="panel-title">
          {typeof title === "string" ? <h2>{title}</h2> : title}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function LinkButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="link" onClick={onClick}>
      {children} <ChevronRight size={13} />
    </button>
  );
}

export function StatusChip({ t }: { t: Transaction }) {
  if (t.ignored) return <span className="chip gray">Ignorada</span>;
  if (t.status === "pending") return <span className="chip amber">Revisar</span>;
  if (t.direction === "transfer") return <span className="chip gray">Transferência</span>;
  if (t.status === "auto") {
    const label = t.classifiedBy === "rule" ? "Regra" : t.classifiedBy === "history" ? "Histórico" : t.classifiedBy === "ai" ? "IA" : "Sugestão";
    return <span className="chip green">{label}</span>;
  }
  return <span className="chip blue">Confirmada</span>;
}

export function Avatar({ name, color, large }: { name: string; color: string; large?: boolean }) {
  return (
    <span className={`avatar ${large ? "lg" : ""}`} style={{ background: color }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function Progress({ value, tone }: { value: number; tone?: "lime" | "warn" }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className={`progress ${tone ?? ""}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}

export function PeriodControl({ month, onChange, max }: { month: string; onChange: (m: string) => void; max: string }) {
  const [y, m] = month.split("-").map(Number);
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    onChange(d.toISOString().slice(0, 7));
  };
  const label = monthLabel(month);
  return (
    <div className="period" aria-label="Mês">
      <button type="button" onClick={() => shift(-1)} aria-label="Mês anterior">
        <ChevronLeft size={16} />
      </button>
      <span>{label.charAt(0).toUpperCase() + label.slice(1)}</span>
      <button type="button" onClick={() => shift(1)} disabled={month >= max} aria-label="Próximo mês">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map(([key, label]) => (
        <button key={key} type="button" role="tab" aria-selected={value === key} className={value === key ? "on" : ""} onClick={() => onChange(key)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`toggle ${on ? "on" : ""}`} onClick={() => onChange(!on)} />;
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div style={{ fontSize: 30 }}>{icon}</div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function ModalHeader({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  const { closeModal } = useApp();
  return (
    <div className="modal-head">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <button type="button" className="icon-btn" onClick={() => closeModal()} aria-label="Fechar">
        <X size={18} />
      </button>
    </div>
  );
}

export function DemoFlag() {
  const { me } = useApp();
  if (!me?.hasDemoData) return null;
  return (
    <div className="mock-flag">
      <Info size={15} />
      <span>
        <b>Dados de exemplo:</b> valores fictícios para você testar o app. Quando quiser usar de verdade, remova em{" "}
        <a href="#/ajustes">Configurações</a>.
      </span>
    </div>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <LoaderCircle size={size} className="spin" aria-label="Carregando" />;
}

export function Skeleton({ height = 140 }: { height?: number }) {
  return <div className="skeleton" style={{ height }} />;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="notice warn" style={{ marginBottom: 16 }}>
      <Info size={18} />
      <div>
        <h3>Não foi possível carregar</h3>
        <p>{message}</p>
        {onRetry && (
          <button type="button" className="btn ghost small" style={{ marginTop: 8 }} onClick={onRetry}>
            Tentar de novo
          </button>
        )}
      </div>
    </div>
  );
}
