// Estado global: pessoa logada, valores ocultos, avisos (toast) e janelas (modal).
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Me } from "../shared/types";
import { checkUpdate, hasNativeUpdater } from "./lib/native";
import { syncNativeReminder } from "./lib/notifications";
import { flushOutbox } from "./lib/offline";
import { UpdateModal } from "./modals/UpdateModal";
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
  const offered = useRef<number | null>(null);

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
  // APK: mantém o lembrete diário agendado no horário escolhido
  const reminder = me ? `${me.notifyDigest}:${me.profile.digestHour}` : "";
  useEffect(() => {
    if (!me) return;
    void syncNativeReminder(me.notifyDigest, me.profile.digestHour);
  }, [reminder]);
  // Envia o que ficou guardado sem internet (ao entrar e quando a conexão volta)
  useEffect(() => {
    if (!signedIn) return;
    const flush = () =>
      void flushOutbox().then((n) => {
        if (n > 0) {
          toast(`${n} lançamento${n > 1 ? "s" : ""} feito${n > 1 ? "s" : ""} sem internet ${n > 1 ? "foram enviados" : "foi enviado"}.`);
          void refreshMe();
        }
      });
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [signedIn, toast, refreshMe]);
  useEffect(() => {
    if (!signedIn) return;
    // Confere ao abrir e sempre que o app volta para a tela; oferece cada versão uma vez por uso
    const offer = (force: boolean) =>
      void checkUpdate(force).then(async (u) => {
        if (!u?.latest || offered.current === u.latest.build) return;
        offered.current = u.latest.build;
        if (u.reinstall) return toast(`Nova versão do app (${u.latest.name}): veja em Configurações como reinstalar.`);
        // Com o atualizador no APK, oferece a atualização na hora; nas versões antigas, avisa
        if (await hasNativeUpdater()) openModal(<UpdateModal latest={u.latest} current={u.current.name} />);
        else toast(`Nova versão do app (${u.latest.name}). Atualize em Configurações.`);
      });
    offer(false);
    const onVisible = () => document.visibilityState === "visible" && offer(true);
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [signedIn, toast, openModal]);

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
