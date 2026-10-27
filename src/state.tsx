// Estado global: pessoa logada, valores ocultos, avisos (toast) e janelas (modal).
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Me } from "../shared/types";
import { checkUpdate } from "./lib/native";
import { api, getToken, onLogout, setToken } from "./lib/api";
import { clearCache } from "./lib/useData";

type Toast = { id: number; text: string };

type AppState = {
  me: Me | null;
  loadingMe: boolean;
  refreshMe: () => Promise<void>;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
  hidden: boolean;
  toggleHidden: () => void;
  toast: (text: string) => void;
  openModal: (node: ReactNode) => void;
  closeModal: (after?: () => void) => void;
};

const Ctx = createContext<AppState | null>(null);

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp fora do AppProvider");
  return ctx;
}

function readHidden() {
  try {
    return localStorage.getItem("ninho.hide") === "1";
  } catch {
    return false;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loadingMe, setLoadingMe] = useState(Boolean(getToken()));
  const [hidden, setHidden] = useState(readHidden);
  const [toastState, setToastState] = useState<Toast | null>(null);
  const [modal, setModal] = useState<ReactNode>(null);
  const afterClose = useRef<(() => void) | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const refreshMe = useCallback(async () => {
    if (!getToken()) {
      setMe(null);
      setLoadingMe(false);
      return;
    }
    try {
      setMe(await api<Me>("me"));
    } catch {
      // 401 já limpa o token (onLogout)
    } finally {
      setLoadingMe(false);
    }
  }, []);

  useEffect(() => {
    void refreshMe();
    return onLogout(() => {
      clearCache();
      setMe(null);
    });
  }, [refreshMe]);

  const signIn = useCallback(
    async (token: string) => {
      setToken(token);
      clearCache();
      setLoadingMe(true);
      await refreshMe();
    },
    [refreshMe],
  );

  const signOut = useCallback(async () => {
    try {
      await api("auth/logout", { method: "POST", body: {} });
    } catch {
      // sai mesmo sem conexão
    }
    setToken(null);
    clearCache();
    setMe(null);
    window.location.hash = "#/";
  }, []);

  const toggleHidden = useCallback(() => {
    setHidden((h) => {
      try {
        localStorage.setItem("ninho.hide", h ? "0" : "1");
      } catch {
        // ignora
      }
      return !h;
    });
  }, []);

  const toast = useCallback((text: string) => {
    window.clearTimeout(toastTimer.current);
    setToastState({ id: Date.now(), text });
    toastTimer.current = window.setTimeout(() => setToastState(null), 3800);
  }, []);

  // Janela aberta = uma entrada no histórico: o botão "voltar" do Android fecha a janela.
  const openModal = useCallback((node: ReactNode) => {
    setModal(node);
    if (!(window.history.state as { ninhoModal?: boolean } | null)?.ninhoModal) {
      window.history.pushState({ ninhoModal: true }, "");
    }
  }, []);

  const closeModal = useCallback((after?: () => void) => {
    afterClose.current = after ?? null;
    if ((window.history.state as { ninhoModal?: boolean } | null)?.ninhoModal) {
      window.history.back();
    } else {
      setModal(null);
      const fn = afterClose.current;
      afterClose.current = null;
      fn?.();
    }
  }, []);

  useEffect(() => {
    const onPop = () => {
      setModal(null);
      const fn = afterClose.current;
      afterClose.current = null;
      if (fn) window.setTimeout(fn, 0);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    document.body.style.overflow = modal ? "hidden" : "";
  }, [modal]);

  // App Android desatualizado: avisa uma vez por abertura
  const signedIn = Boolean(me);
  useEffect(() => {
    if (!signedIn) return;
    void checkUpdate().then(
      (u) => u?.latest && toast(u.reinstall ? `Nova versão do app (${u.latest.name}): veja em Configurações como reinstalar.` : `Nova versão do app (${u.latest.name}). Atualize em Configurações.`),
    );
  }, [signedIn, toast]);

  return (
    <Ctx.Provider value={{ me, loadingMe, refreshMe, signIn, signOut, hidden, toggleHidden, toast, openModal, closeModal }}>
      {children}
      {modal && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="modal">{modal}</div>
        </div>
      )}
      {toastState && (
        <div className="toast" role="status" aria-live="polite" key={toastState.id}>
          {toastState.text}
        </div>
      )}
    </Ctx.Provider>
  );
}
