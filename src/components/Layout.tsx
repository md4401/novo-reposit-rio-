// Estrutura: menu lateral com as seções (computador) e barra inferior com "+" no centro (celular).
// As telas de cada seção aparecem como abas no topo da página. Nos modos simples e criança, um menu curto.
import { Bell, Bot, Eye, EyeOff, Lock, Plus, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { BOTTOM_KEYS, BOTTOM_REDUCED, KID_NAV, NAV, PAGE_TITLES, sectionOf, SIMPLE_NAV, type NavItem, type NavLink } from "../lib/nav";
import { navigate } from "../lib/router";
import { DigestModal } from "../modals/DigestModal";
import { MoreSheet, QuickAddSheet } from "../modals/MenuSheets";
import { markWelcomeSeen, welcomeSeen, WelcomeModal } from "../modals/WelcomeModal";
import { useApp } from "../state";
import { Avatar } from "./ui";

const BOTTOM = BOTTOM_KEYS.map((key) => NAV.find((n) => n.key === key)!);
const BOTTOM_LABEL: Record<string, string> = { inicio: "Início", transacoes: "Transações", orcamento: "Planejar", familia: "Casa" };

// Aviso de uma vez só para quem já usava o app antes do menu novo (quem está testando com exemplo não conhecia o antigo)
const NEWS_KEY = "ninho.novidades.menu8";
function readSeen() {
  try {
    return localStorage.getItem(NEWS_KEY) === "1";
  } catch {
    return true;
  }
}

export function Layout({ page, children }: { page: string; children: ReactNode }) {
  const { me, hidden, toggleHidden, openModal, toast } = useApp();
  const pending = me?.pendingCount ?? 0;
  const section = sectionOf(page);
  const [seenNews, setSeenNews] = useState(readSeen);
  const [showAll, setShowAll] = useState(false);
  const mode = me?.profile.uiMode ?? "full";
  const reduced = mode !== "full" && !showAll;

  // Primeira vez numa conta sem lançamentos: boas-vindas (marcadas como vistas ao abrir, mesmo se fechar no X)
  const profileId = me?.profile.id;
  // No modo criança não: a tela inicial dela já explica o básico
  const fresh = me ? !me.setup.hasTransactions && me.profile.uiMode !== "kid" : false;
  useEffect(() => {
    if (!profileId || !fresh || welcomeSeen(profileId)) return;
    markWelcomeSeen(profileId);
    openModal(<WelcomeModal />);
  }, [profileId, fresh, openModal]);

  const go = (key: string) => navigate(key === "inicio" ? "" : key);
  const quickAdd = () => openModal(<QuickAddSheet />);
  const openMenu = () => openModal(<MoreSheet page={page} reduced={reduced} onShowAll={() => setShowAll(true)} />);
  const shortNav = mode === "kid" ? KID_NAV : SIMPLE_NAV;

  const hideNews = () => {
    try {
      localStorage.setItem(NEWS_KEY, "1");
    } catch {
      // sem armazenamento: some só nesta visita
    }
    setSeenNews(true);
  };

  const navButton = (n: NavItem) => (
    <button key={n.key} type="button" className={`nav-btn ${section.key === n.key ? "active" : ""}`} onClick={() => go(n.key)} aria-current={section.key === n.key ? "page" : undefined}>
      {n.icon(17)}
      <span>{n.label}</span>
      {n.key === "transacoes" && pending > 0 && (
        <span className="count" title="Compras a revisar">
          {pending}
        </span>
      )}
    </button>
  );

  // Menu curto: cada item é uma tela (sem abas)
  const linkButton = (n: NavLink) => (
    <button key={n.key} type="button" className={`nav-btn ${page === n.key ? "active" : ""}`} onClick={() => go(n.key)} aria-current={page === n.key ? "page" : undefined}>
      {n.icon(17)}
      <span>{n.label}</span>
      {n.key === "transacoes" && pending > 0 && <span className="count">{pending}</span>}
    </button>
  );
  const reducedBottom = (key: string, label: string) => {
    const link = [...SIMPLE_NAV, ...KID_NAV].find((n) => n.key === key)!;
    return (
      <button key={key} type="button" className={page === key ? "active" : ""} onClick={() => go(key)} aria-current={page === key ? "page" : undefined}>
        <span className="ic">{link.icon(20)}</span>
        {label}
        {key === "transacoes" && pending > 0 && <span className="badge">{pending}</span>}
      </button>
    );
  };

  const bottomButton = (n: NavItem) => (
    <button key={n.key} type="button" className={section.key === n.key ? "active" : ""} onClick={() => go(n.key)} aria-current={section.key === n.key ? "page" : undefined}>
      <span className="ic">{n.icon(20)}</span>
      {BOTTOM_LABEL[n.key] ?? n.label}
      {n.key === "transacoes" && pending > 0 && <span className="badge">{pending}</span>}
    </button>
  );
  const bottomItems = mode === "full" ? BOTTOM.map(bottomButton) : BOTTOM_REDUCED[mode].map(([key, label]) => reducedBottom(key, label));

  return (
    <div className={`app ${mode}`}>
      <aside className="sidebar" aria-label="Menu">
        <div className="brand">
          <div className="brand-mark">n</div>
          <div>
            <div className="brand-name">
              ninho<span>.</span>
            </div>
            <div className="brand-sub">FINANÇAS EM FAMÍLIA</div>
          </div>
        </div>
        <button type="button" className="btn primary block sidebar-add" onClick={quickAdd}>
          <Plus size={16} /> Adicionar
        </button>
        <nav className="nav">{reduced ? shortNav.map(linkButton) : NAV.map(navButton)}</nav>
        {mode !== "full" && (
          <button type="button" className="link sidebar-all" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Mostrar menos" : "Ver todas as telas"}
          </button>
        )}
        {me && (
          <button type="button" className="sidebar-footer" onClick={() => go("ajustes")}>
            <Avatar name={me.profile.name} color={me.profile.avatarColor} />
            <div style={{ minWidth: 0 }}>
              <div className="name">{me.profile.name}</div>
              <div className="role">{me.household.name}</div>
            </div>
            <Lock size={14} style={{ marginLeft: "auto", color: "#779788" }} aria-label="Espaço privado" />
          </button>
        )}
      </aside>

      <main className="main">
        <header className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <div className="mobile-brand">
              <div className="brand-mark">n</div>
              <span>
                ninho<span style={{ color: "#4a9271" }}>.</span>
              </span>
            </div>
            <span className="crumb">
              {me?.household.name ?? "Seu espaço"} <span style={{ padding: "0 9px" }}>/</span> <b>{PAGE_TITLES[page] ?? ""}</b>
            </span>
          </div>
          <div className="top-right">
            {me?.hasDemoData && (
              <button type="button" className="demo-pill" onClick={() => go("ajustes?aba=privacidade")} title="Dados fictícios para testar. Remova em Configurações.">
                <span className="hide-mobile">● DADOS DE </span>EXEMPLO
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                toggleHidden();
                toast(hidden ? "Valores visíveis." : "Valores ocultos neste aparelho.");
              }}
              aria-label={hidden ? "Mostrar valores" : "Ocultar valores"}
              title={hidden ? "Mostrar valores" : "Ocultar valores"}
            >
              {hidden ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
            <button type="button" className="icon-btn hide-mobile" onClick={() => openModal(<DigestModal />)} aria-label="Revisar compras" title="Revisar compras">
              <Bell size={17} />
              {pending > 0 && <span className="dot-badge">{pending}</span>}
            </button>
            <button type="button" className="icon-btn show-mobile" onClick={() => go("nia")} aria-label="Assistente Nia" title="Assistente Nia">
              <Bot size={17} />
            </button>
            {me && (
              <button type="button" className="avatar-btn show-mobile" onClick={openMenu} aria-label="Menu e configurações" title="Menu">
                <Avatar name={me.profile.name} color={me.profile.avatarColor} />
              </button>
            )}
          </div>
        </header>
        <div className="content">
          {!seenNews && me?.setup.hasTransactions && !me.hasDemoData && (
            <div className="news-bar" role="status">
              <span>
                <b>O menu ficou mais simples:</b> poucas seções, e as telas de cada uma viram abas no topo. No celular, o menu completo abre pela sua foto, no canto de cima.
              </span>
              <button type="button" className="icon-btn" onClick={hideNews} aria-label="Entendi">
                <X size={15} />
              </button>
            </div>
          )}
          {!reduced && section.tabs.length > 1 && (
            <div className="chips-row section-tabs" role="tablist" aria-label={section.label}>
              {section.tabs.map((t) => (
                <button key={t.key} type="button" role="tab" aria-selected={page === t.key} className={`filter-chip ${page === t.key ? "on" : ""}`} onClick={() => go(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <div className="page" key={page}>
            {children}
          </div>
        </div>
      </main>

      <nav className="bottom-nav" aria-label="Navegação principal">
        {bottomItems.slice(0, 2)}
        <button type="button" className="bottom-add" onClick={quickAdd} aria-label="Adicionar">
          <span className="ic">
            <Plus size={24} />
          </span>
        </button>
        {bottomItems.slice(2)}
      </nav>
    </div>
  );
}
