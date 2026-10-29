import { useCallback, useEffect, useRef, useState } from "react";
import { api, onChange } from "./api";

const cache = new Map<string, unknown>();

// O que outra pessoa da família lançou no celular dela só chega aqui buscando de novo:
// recarrega as telas abertas ao voltar para o app e a cada minuto com o app na tela.
const refreshers = new Set<() => void>();
let autoRefresh = false;
function startAutoRefresh() {
  if (autoRefresh || typeof document === "undefined") return;
  autoRefresh = true;
  let last = Date.now();
  const refresh = () => {
    if (document.visibilityState !== "visible" || !navigator.onLine || Date.now() - last < 15_000) return;
    last = Date.now();
    refreshers.forEach((r) => r());
  };
  document.addEventListener("visibilitychange", refresh);
  window.addEventListener("focus", refresh);
  window.setInterval(refresh, 60_000);
}

/** Busca dados da API, mostra o último resultado conhecido na hora e recarrega após mudanças. */
export function useData<T>(path: string | null) {
  const [data, setData] = useState<T | undefined>(() => (path ? (cache.get(path) as T | undefined) : undefined));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const current = useRef(path);
  current.current = path;

  useEffect(() => onChange(() => setVersion((v) => v + 1)), []);
  useEffect(() => {
    startAutoRefresh();
    const refresh = () => setVersion((v) => v + 1);
    refreshers.add(refresh);
    return () => void refreshers.delete(refresh);
  }, []);

  useEffect(() => {
    if (!path) return;
    let alive = true;
    if (cache.has(path)) setData(cache.get(path) as T);
    setLoading(true);
    api<T>(path)
      .then((result) => {
        cache.set(path, result);
        if (alive && current.current === path) {
          setData(result);
          setError(null);
        }
      })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [path, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, loading, reload };
}

export function clearCache() {
  cache.clear();
}
