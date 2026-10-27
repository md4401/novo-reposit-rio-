// Boas-vindas em 3 telas, só na primeira vez: o que é pessoal, o que a família vê e como os dados entram.
import { ArrowRight, Camera, FileUp, Lock, MessageCircle, Plus, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useApp } from "../state";

const seenKey = (profileId: string) => `ninho.boasvindas.${profileId}`;

export function welcomeSeen(profileId: string) {
  try {
    return localStorage.getItem(seenKey(profileId)) === "1";
  } catch {
    // sem armazenamento: não insiste a cada visita
    return true;
  }
}

export function markWelcomeSeen(profileId: string) {
  try {
    localStorage.setItem(seenKey(profileId), "1");
  } catch {
    // ignora
  }
}

type Screen = { icon: ReactNode; title: string; body: ReactNode };

export function WelcomeModal() {
  const { me, closeModal } = useApp();
  const [step, setStep] = useState(0);
  const firstName = me?.profile.name.split(" ")[0] ?? "";

  const screens: Screen[] = [
    {
      icon: <Lock size={26} />,
      title: firstName ? `Oi, ${firstName}! Aqui, o que é seu é só seu` : "Aqui, o que é seu é só seu",
      body: (
        <>
          <p>Tudo o que você lança fica no seu espaço pessoal: lojas, descrições e valores.</p>
          <p>Ninguém da família vê esses detalhes — nem quem criou a casa.</p>
        </>
      ),
    },
    {
      icon: <Users size={26} />,
      title: "A família vê só os totais",
      body: (
        <>
          <p>
            Ao marcar uma compra como <b>Família</b>, o valor entra no total da casa, somado por categoria.
          </p>
          <div className="welcome-example" aria-label="Exemplo">
            <div>
              <small>Você vê</small>
              <b>Mercado Pão Dourado · R$ 230,00</b>
            </div>
            <ArrowRight size={16} />
            <div>
              <small>A casa vê</small>
              <b>Alimentação + R$ 230,00</b>
            </div>
          </div>
          <p className="muted small">Sem loja, sem descrição e sem o nome de quem comprou.</p>
        </>
      ),
    },
    {
      icon: <Plus size={26} />,
      title: "Quatro jeitos de registrar",
      body: (
        <>
          <ul className="welcome-ways">
            <li>
              <Plus size={16} /> <span><b>Lançar</b> uma despesa ou receita no botão +</span>
            </li>
            <li>
              <FileUp size={16} /> <span><b>Importar o extrato</b> (CSV ou OFX) do app do banco</span>
            </li>
            <li>
              <Camera size={16} /> <span><b>Foto da nota fiscal:</b> os itens viram categorias</span>
            </li>
            <li>
              <MessageCircle size={16} /> <span><b>Contar para a Nia:</b> “gastei 80 no mercado”</span>
            </li>
          </ul>
          <p className="muted small">A Nia nunca grava sozinha: você confere e confirma.</p>
        </>
      ),
    },
  ];

  const finish = () => closeModal();
  const screen = screens[step];
  const last = step === screens.length - 1;

  return (
    <div className="welcome">
      <div className="welcome-ic">{screen.icon}</div>
      <h2>{screen.title}</h2>
      <div className="welcome-body">{screen.body}</div>
      <div className="welcome-dots" aria-label={`Tela ${step + 1} de ${screens.length}`}>
        {screens.map((_, i) => (
          <span key={i} className={i === step ? "on" : ""} />
        ))}
      </div>
      <div className="modal-actions">
        {last ? (
          <span />
        ) : (
          <button type="button" className="btn ghost" onClick={finish}>
            Pular
          </button>
        )}
        <button type="button" className="btn dark" onClick={() => (last ? finish() : setStep(step + 1))} autoFocus>
          {last ? "Começar" : "Próximo"}
        </button>
      </div>
    </div>
  );
}
