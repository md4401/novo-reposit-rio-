// Navegação por hash (#/transacoes): funciona em qualquer hospedagem e no app Android,
// e o botão "voltar" do celular volta para a tela anterior.
import { useEffect, useState } from "react";

export type Route = { page: string; query: URLSearchParams };

/** Telas que viraram parte de outra: o endereço antigo abre a aba certa. */
const MOVED: Record<string, string> = {
  parcelar: "simuladores?aba=parcelar",
  momentos: "simuladores?aba=momentos",
  acertos: "casa?aba=acertos",
  cesta: "compras?aba=precos",
};

function parse(): Route {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [path, search = ""] = raw.split("?");
  const moved = MOVED[path];
  if (moved) {
    window.history.replaceState(null, "", `#/${moved}`);
    return parse();
  }
  return { page: path || "inicio", query: new URLSearchParams(search) };
}

export function navigate(to: string) {
  const clean = to.replace(/^\/?#?\/?/, "");
  const [path] = clean.split("?");
  const target = `#/${MOVED[path] ?? clean}`;
  if (window.location.hash !== target) window.location.hash = target;
  window.scrollTo({ top: 0 });
}

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onHash = () => setRoute(parse());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route;
}
