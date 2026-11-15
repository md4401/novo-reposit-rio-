// Logo do ninho: três ovos (a família) num ninho de galhos, dentro do círculo de destaque.
// Usa as cores do tema (--accent e --on-accent). As partes têm classes para a abertura animar.
const TWIGS = [
  "M8.5 26 C14.5 30.5 33.5 30.5 39.5 26",
  "M11 31.6 C17 36 31 36 37 31.6",
  "M15.5 37 C20.5 39.6 27.5 39.6 32.5 37",
];

export function LogoMark({ size = 38, className = "" }: { size?: number; className?: string }) {
  return (
    <svg className={`logo-mark ${className}`} viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" focusable="false">
      <circle className="lg-bg" cx="24" cy="24" r="24" />
      {/* Cada ovo num grupo: a abertura move o grupo sem desfazer a inclinação do ovo */}
      <g className="lg-egg e1">
        <ellipse cx="24" cy="20.5" rx="4.6" ry="6" />
      </g>
      <g className="lg-egg e0">
        <ellipse cx="16.2" cy="23" rx="3.7" ry="4.8" transform="rotate(-16 16.2 23)" />
      </g>
      <g className="lg-egg e2">
        <ellipse cx="31.8" cy="23" rx="3.7" ry="4.8" transform="rotate(16 31.8 23)" />
      </g>
      {/* Borda do ninho na cor do fundo: separa os ovos dos galhos */}
      <path className="lg-halo" d="M7.5 25.5 C14 30.5 34 30.5 40.5 25.5" />
      {TWIGS.map((d, i) => (
        <path key={i} className={`lg-twig t${i}`} d={d} pathLength={1} />
      ))}
    </svg>
  );
}
