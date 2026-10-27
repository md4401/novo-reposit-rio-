// Atualização do app Android: baixa a versão nova e abre o instalador (a pessoa toca em "Instalar").
import { Download } from "lucide-react";
import { useState } from "react";
import { ModalHeader, Progress, Spinner } from "../components/ui";
import { installUpdate, type PublishedVersion } from "../lib/native";
import { useApp } from "../state";

export function UpdateModal({ latest, current }: { latest: PublishedVersion; current: string }) {
  const { closeModal } = useApp();
  const [state, setState] = useState<"idle" | "downloading" | "settings" | "started">("idle");
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function update() {
    setError(null);
    setState("downloading");
    try {
      setState(await installUpdate(latest, (p) => setPercent(Math.max(0, p))));
    } catch (e) {
      const err = e as { code?: string; message?: string };
      setError(err.message ?? "Não foi possível atualizar agora.");
      setState("idle");
    }
  }

  return (
    <>
      <ModalHeader title="Nova versão do ninho" subtitle={`Versão ${latest.name} disponível (você tem a ${current}).`} />
      {error && <div className="form-error">{error}</div>}
      {state === "downloading" && (
        <div style={{ margin: "8px 0 14px" }}>
          <Progress value={percent / 100} tone="lime" />
          <p className="muted small" style={{ marginTop: 8 }}>
            <Spinner size={13} /> Baixando… {percent > 0 ? `${percent}%` : ""}
          </p>
        </div>
      )}
      {state === "settings" && (
        <div className="modal-note">
          O Android pediu uma permissão: ative <b>“Permitir desta fonte”</b> para o ninho, volte aqui e toque em <b>Atualizar agora</b> de novo.
        </div>
      )}
      {state === "started" ? (
        <div className="modal-note">
          Toque em <b>Instalar</b> na tela do Android. Seus dados ficam guardados na sua conta: depois da instalação, é só abrir o ninho.
        </div>
      ) : (
        <p className="muted small">A atualização leva menos de um minuto. O arquivo é conferido antes de instalar, e seus dados continuam na sua conta.</p>
      )}
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={() => closeModal()}>
          {state === "started" ? "Fechar" : "Depois"}
        </button>
        {state !== "started" && (
          <button type="button" className="btn primary" disabled={state === "downloading"} onClick={() => void update()}>
            {state === "downloading" ? <Spinner size={14} /> : <Download size={15} />} Atualizar agora
          </button>
        )}
      </div>
    </>
  );
}
