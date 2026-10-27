// Pessoal ou Família: o conceito central do app, em dois botões (no lugar de um campo de seleção).
import { Lock, Users } from "lucide-react";
import type { Scope } from "../../shared/types";

const HINT: Record<Scope, string> = {
  personal: "Só você vê.",
  family: "Entra nos totais da casa, sem mostrar onde nem quem comprou.",
};

export function ScopeToggle({
  value,
  onChange,
  disabled,
  compact,
  label = "Visibilidade",
}: {
  value: Scope;
  onChange: (scope: Scope) => void;
  disabled?: boolean;
  /** Sem a frase de explicação (ex.: em cada parte de uma compra dividida) */
  compact?: boolean;
  label?: string;
}) {
  const option = (scope: Scope, icon: React.ReactNode, text: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={value === scope}
      className={value === scope ? "on" : ""}
      onClick={() => onChange(scope)}
      disabled={disabled}
    >
      {icon} {text}
    </button>
  );
  return (
    <div className={`scope-toggle ${compact ? "compact" : ""}`}>
      <div className="scope-options" role="radiogroup" aria-label={label}>
        {option("personal", <Lock size={14} />, "Pessoal")}
        {option("family", <Users size={14} />, "Família")}
      </div>
      {!compact && <span className="hint">{disabled ? "Escolha a categoria para definir." : HINT[value]}</span>}
    </div>
  );
}
