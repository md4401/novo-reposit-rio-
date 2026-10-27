// Estado global: pessoa logada, valores ocultos, avisos (toast) e janelas (modal).
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Me } from "../shared/types";
import { checkUpdate, hasNativeUpdater, onNativeLaunch, syncCaptures, takeLaunchRoute } from "./lib/native";
import { syncNativeReminder } from "./lib/notifications";
import { flushOutbox } from "./lib/offline";
import { DigestModal } from "./modals/DigestModal";
import { NewTransactionModal } from "./modals/NewTransactionModal";
import { UpdateModal } from "./modals/UpdateModal";
import { api, getToken, onLogout, setToken } from "./lib/api";
import { clearCache } from "./lib/useData";

/** Botão opcional no aviso (ex.: "Desfazer"). */
export type ToastAction = { label: string; run: () => void };
type Toast = { id: number; text: string; action?: ToastAction };

/** Pergunta de confirmação do próprio app (no lugar do window.confirm do navegador). */
export type ConfirmOptions = { title: string; text?: string; confirmLabel?: string; danger?: boolean };

type AppState = {
  me: Me | null;
  loadingMe: boolean;
  refreshMe: () => Promise<void>;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
  hidden: boolean;
  toggleHidden: () => void;
  toast: (text: string, action?: ToastAction) => void;
  /** Abre a confirmação por cima de tudo (inclusive de uma janela aberta) e diz o que a pessoa escolheu. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
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

  const toast = useCallback((text: string, action?: ToastAction) => {
    window.clearTimeout(toastTimer.current);
    setToastState({ id: Date.now(), text, action });
    // Com "Desfazer" o aviso fica um pouco mais, para dar tempo de tocar
    toastTimer.current = window.setTimeout(() => setToastState(null), action ? 7000 : 3800);
  }, []);

  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setConfirmState({ ...options, resolve })), []);
  const answer = useCallback(
    (ok: boolean) => {
      confirmState?.resolve(ok);
      setConfirmState(null);
    },
    [confirmState],
  );
  useEffect(() => {
    if (!confirmState) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && answer(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmState, answer]);

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
  // APK: compras capturadas das notificações do banco, "Compartilhar", atalhos e widget
  useEffect(() => {
    if (!signedIn) return;
    const run = async () => {
      try {
        const created = await syncCaptures((items) => api<{ created: number }>("capture/notifications", { body: { items } }));
        if (created > 0) {
          toast(`${created} compra${created > 1 ? "s" : ""} capturada${created > 1 ? "s" : ""} das notificações do banco. Confira no resumo.`);
          void refreshMe();
        }
      } catch {
        // sem internet: tenta na próxima vez
      }
      // Atalhos do app instalado pelo navegador (?abrir=nova)
      const opened = new URLSearchParams(window.location.search).get("abrir");
      if (opened) window.history.replaceState(null, "", window.location.pathname + window.location.hash);
      const route = opened ?? (await takeLaunchRoute());
      if (route === "nova") openModal(<NewTransactionModal />);
      else if (route === "resumo") openModal(<DigestModal />);
      else if (route) window.location.hash = `#/${route === "inicio" ? "" : route}`;
    };
    void run();
    const onVisible = () => document.visibilityState === "visible" && void run();
    document.addEventListener("visibilitychange", onVisible);
    const off = onNativeLaunch(() => void run());
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      off();
    };
  }, [signedIn, toast, refreshMe, openModal]);

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
    <Ctx.Provider value={{ me, loadingMe, refreshMe, signIn, signOut, hidden, toggleHidden, toast, confirm, openModal, closeModal }}>
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
      {confirmState && (
        <div
          className="modal-overlay confirm-layer"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) answer(false);
          }}
        >
          <div className="modal confirm-box">
            <h2 id="confirm-title">{confirmState.title}</h2>
            {confirmState.text && <p>{confirmState.text}</p>}
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => answer(false)}>
                Cancelar
              </button>
              <button type="button" className={`btn ${confirmState.danger ? "danger" : "dark"}`} autoFocus onClick={() => answer(true)}>
                {confirmState.confirmLabel ?? "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
      {toastState && (
        <div className="toast" role="status" aria-live="polite" key={toastState.id}>
          <span>{toastState.text}</span>
          {toastState.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                toastState.action!.run();
                setToastState(null);
              }}
            >
              {toastState.action.label}
            </button>
          )}
        </div>
      )}
    </Ctx.Provider>
  );
}
