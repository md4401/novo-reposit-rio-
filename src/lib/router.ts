// Navegação por hash (#/transacoes): funciona em qualquer hospedagem e no app Android,
// e o botão "voltar" do celular volta para a tela anterior.
import { useEffect, useState } from "react";

export type Route = { page: string; query: URLSearchParams };

function parse(): Route {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [path, search = ""] = raw.split("?");
  return { page: path || "inicio", query: new URLSearchParams(search) };
}

export function navigate(to: string) {
  const target = `#/${to.replace(/^\/?#?\/?/, "")}`;
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
