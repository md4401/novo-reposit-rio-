// Abertura: o ninho se forma. Continua a tela de carregamento (mesmo fundo, mesmo pontinho no centro):
// o pontinho cresce e vira o círculo do logo, os galhos do ninho se desenham, os três ovos (a família)
// caem e se acomodam, o nome aparece e o logo voa até o topo enquanto a cortina se fecha nele.
// Roda enquanto os dados carregam; toque para pular.
import { useEffect, useRef, useState } from "react";
import { markIntroFinished, markIntroShown, pickIntroMode, type IntroMode } from "../lib/intro";
import { LogoMark } from "./Logo";

type Phase = "nest" | "mark" | "hold" | "exit";

export function Intro({ ready }: { ready: boolean }) {
  const [mode] = useState<IntroMode>(pickIntroMode);
  const [phase, setPhase] = useState<Phase>(mode === "full" ? "nest" : "mark");
  const [done, setDone] = useState(false);
  const [skip, setSkip] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLDivElement>(null);
  const started = useRef(performance.now());

  // Some a moldura estática do index.html (a cena começa idêntica a ela)
  useEffect(() => {
    document.getElementById("boot")?.remove();
  }, []);

  // Linha do tempo: ninho → logo → espera os dados → saída
  useEffect(() => {
    if (mode !== "full") return;
    const t = window.setTimeout(() => setPhase((p) => (p === "nest" ? "mark" : p)), skip ? 0 : 1300);
    return () => window.clearTimeout(t);
  }, [mode, skip]);

  useEffect(() => {
    if (phase === "exit" || done) return;
    const minimum = mode === "full" ? 2050 : mode === "short" ? 650 : 0;
    const elapsed = performance.now() - started.current;
    const wait = skip ? 120 : Math.max(0, minimum - elapsed);
    // Se os dados demorarem, o ninho "respira"; depois de 7 s sai de qualquer jeito
    const t = window.setTimeout(() => setPhase(ready || elapsed > 7000 ? "exit" : "hold"), wait);
    const safety = window.setTimeout(() => setPhase("exit"), Math.max(0, 7000 - elapsed));
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(safety);
    };
  }, [ready, phase, mode, skip, done]);

  // Saída: o logo voa até o logo de verdade do topo e a cortina se fecha nele
  useEffect(() => {
    if (phase !== "exit") return;
    const el = root.current;
    const logo = mark.current;
    if (!el) return;
    markIntroShown();
    const finish = () => {
      setDone(true);
      markIntroFinished();
    };
    if (mode === "fade" || !logo) {
      el.classList.add("intro-fade-out");
      const t = window.setTimeout(finish, 320);
      return () => window.clearTimeout(t);
    }
    // Logo do topo visível (celular ou menu lateral); sem ele (tela de login), só esmaece
    const target = [...document.querySelectorAll<HTMLElement>(".mobile-brand .brand-mark, .sidebar .brand .brand-mark")].find((t) => {
      const r = t.getBoundingClientRect();
      return r.width > 0 && r.top >= 0 && r.top < 200;
    });
    const from = logo.getBoundingClientRect();
    const speed = skip ? 0.6 : 1;
    if (!target) {
      el.classList.add("intro-fade-out");
      const t = window.setTimeout(finish, 420);
      return () => window.clearTimeout(t);
    }
    const to = target.getBoundingClientRect();
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const scale = to.width / from.width;
    const cx = to.left + to.width / 2;
    const cy = to.top + to.height / 2;
    const far = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy)) + 40;
    const flight = logo.animate(
      [{ transform: "translate(0, 0) scale(1)" }, { transform: `translate(${dx}px, ${dy}px) scale(${scale})` }],
      { duration: 620 * speed, easing: "cubic-bezier(.65,0,.25,1)", fill: "forwards" },
    );
    el.animate([{ clipPath: `circle(${far}px at ${cx}px ${cy}px)` }, { clipPath: `circle(${to.width / 2}px at ${cx}px ${cy}px)` }], {
      duration: 640 * speed,
      easing: "cubic-bezier(.7,0,.3,1)",
      fill: "forwards",
    });
    let fading: Animation | null = null;
    flight.onfinish = () => {
      fading = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: "forwards" });
      fading.onfinish = finish;
    };
    return () => {
      flight.cancel();
      fading?.cancel();
    };
  }, [phase, mode, skip]);

  if (done) return null;
  return (
    <div
      ref={root}
      className={`intro intro-${mode} is-${phase}`}
      aria-hidden="true"
      onPointerDown={() => {
        setSkip(true);
        setPhase((p) => (p === "nest" ? "mark" : p));
      }}
    >
      <div className="intro-light" />
      <div className="intro-stage">
        <div className="intro-ripple" />
        <div ref={mark} className="intro-mark">
          <LogoMark size={112} />
        </div>
        <div className="intro-word">
          {"ninho".split("").map((c, i) => (
            <span key={i} style={{ animationDelay: `${(mode === "full" ? 1180 : 220) + i * 50}ms` }}>
              {c}
            </span>
          ))}
          <span className="dot" style={{ animationDelay: `${mode === "full" ? 1480 : 470}ms` }}>
            .
          </span>
        </div>
        {mode === "full" && <div className="intro-tag">finanças em família</div>}
      </div>
    </div>
  );
}
