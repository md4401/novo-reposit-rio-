import { useCallback, useEffect, useRef, useState } from "react";
import { api, onChange } from "./api";

const cache = new Map<string, unknown>();

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
