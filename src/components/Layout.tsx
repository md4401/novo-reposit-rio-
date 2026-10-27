// Estrutura: menu lateral (computador) e barra inferior + gaveta (celular), como no protótipo.
import { Activity, ArrowLeftRight, Bell, Bot, CalendarClock, Eye, EyeOff, FileText, Gift, House, Landmark, Lock, Menu, PiggyBank, Plus, Receipt, Repeat, Scale, Settings, ShoppingBasket, Sparkles, Tags, Target, TrendingUp, Trophy, Users, Wallet } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { navigate } from "../lib/router";
import { DigestModal } from "../modals/DigestModal";
import { NewTransactionModal } from "../modals/NewTransactionModal";
import { useApp } from "../state";
import { Avatar } from "./ui";

type NavItem = { key: string; label: string; icon: ReactNode };

const PLAN: NavItem[] = [
  { key: "orcamento", label: "Orçamento", icon: <PiggyBank size={17} /> },
  { key: "pagar", label: "Contas a pagar", icon: <CalendarClock size={17} /> },
  { key: "previsao", label: "Saldo previsto", icon: <TrendingUp size={17} /> },
  { key: "patrimonio", label: "Patrimônio e dívidas", icon: <Scale size={17} /> },
  { key: "ir", label: "Imposto de Renda", icon: <FileText size={17} /> },
];
const MAIN: NavItem[] = [
  { key: "inicio", label: "Visão geral", icon: <House size={17} /> },
  { key: "meu", label: "Meu financeiro", icon: <Wallet size={17} /> },
  { key: "familia", label: "Nossa família", icon: <Users size={17} /> },
  { key: "transacoes", label: "Transações", icon: <ArrowLeftRight size={17} /> },
  { key: "casa", label: "Contas da casa", icon: <Receipt size={17} /> },
  { key: "metas", label: "Metas e objetivos", icon: <Target size={17} /> },
  { key: "desejos", label: "Lista de desejos", icon: <Gift size={17} /> },
];
const SMART: NavItem[] = [
  { key: "nia", label: "Assistente Nia", icon: <Bot size={17} /> },
  { key: "alertas", label: "Assinaturas e alertas", icon: <Repeat size={17} /> },
  { key: "desafios", label: "Desafios", icon: <Trophy size={17} /> },
  { key: "cesta", label: "Cesta da família", icon: <ShoppingBasket size={17} /> },
  { key: "saude", label: "Saúde dos dados", icon: <Activity size={17} /> },
];
const MORE: NavItem[] = [
  { key: "etiquetas", label: "Etiquetas", icon: <Tags size={17} /> },
  { key: "contas", label: "Contas e extratos", icon: <Landmark size={17} /> },
  { key: "ajustes", label: "Configurações", icon: <Settings size={17} /> },
];

export const PAGE_TITLES: Record<string, string> = Object.fromEntries([...MAIN, ...PLAN, ...SMART, ...MORE].map((n) => [n.key, n.label]));

const BOTTOM: NavItem[] = [
  { key: "inicio", label: "Início", icon: <House size={20} /> },
  { key: "transacoes", label: "Transações", icon: <ArrowLeftRight size={20} /> },
  { key: "nia", label: "Nia", icon: <Bot size={20} /> },
  { key: "familia", label: "Família", icon: <Users size={20} /> },
];

export function Layout({ page, children }: { page: string; children: ReactNode }) {
  const { me, hidden, toggleHidden, openModal, toast } = useApp();
  const [drawer, setDrawer] = useState(false);
  const pending = me?.pendingCount ?? 0;

  useEffect(() => setDrawer(false), [page]);

  const go = (key: string) => {
    setDrawer(false);
    navigate(key === "inicio" ? "" : key);
  };

  const navButton = (n: NavItem) => (
    <button key={n.key} type="button" className={`nav-btn ${page === n.key ? "active" : ""}`} onClick={() => go(n.key)} aria-current={page === n.key ? "page" : undefined}>
      {n.icon}
      <span>{n.label}</span>
      {n.key === "nia" && pending > 0 && <span className="count">{pending}</span>}
    </button>
  );

  const showFab = ["inicio", "meu", "transacoes"].includes(page);

  return (
    <div className="app">
      <div className={`drawer-overlay ${drawer ? "open" : ""}`} onClick={() => setDrawer(false)} />
      <aside className={`sidebar ${drawer ? "open" : ""}`} aria-label="Menu">
        <div className="brand">
          <div className="brand-mark">n</div>
          <div>
            <div className="brand-name">
              ninho<span>.</span>
            </div>
            <div className="brand-sub">FINANÇAS EM FAMÍLIA</div>
          </div>
        </div>
        <div className="group-label">PAINEL</div>
        <nav className="nav">{MAIN.map(navButton)}</nav>
        <div className="group-label" style={{ marginTop: 24 }}>
          PLANEJAMENTO
        </div>
        <nav className="nav">{PLAN.map(navButton)}</nav>
        <div className="group-label" style={{ marginTop: 24 }}>
          INTELIGÊNCIA
        </div>
        <nav className="nav">{SMART.map(navButton)}</nav>
        <div className="group-label" style={{ marginTop: 24 }}>
          CONTA
        </div>
        <nav className="nav">{MORE.map(navButton)}</nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip hide-mobile">
            <div className="tip-star">
              <Sparkles size={17} />
            </div>
            <h3>Mais clareza, menos trabalho.</h3>
            <p>Um lugar para organizar seu dinheiro, proteger sua privacidade e planejar o futuro.</p>
          </div>
          {me && (
            <button type="button" className="sidebar-footer" onClick={() => go("ajustes")}>
              <Avatar name={me.profile.name} color={me.profile.avatarColor} />
              <div style={{ minWidth: 0 }}>
                <div className="name">{me.profile.name}</div>
                <div className="role">Espaço privado</div>
              </div>
              <Lock size={15} style={{ marginLeft: "auto", color: "#779788" }} />
            </button>
          )}
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
            {me?.hasDemoData && <span className="demo-pill">● DADOS DE EXEMPLO</span>}
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
            <button type="button" className="icon-btn" onClick={() => openModal(<DigestModal />)} aria-label="Resumo diário" title="Resumo diário">
              <Bell size={17} />
              {pending > 0 && <span className="dot-badge">{pending}</span>}
            </button>
          </div>
        </header>
        <div className="content">
          <div className="page" key={page}>
            {children}
          </div>
        </div>
      </main>

      {showFab && (
        <button type="button" className="fab" onClick={() => openModal(<NewTransactionModal />)}>
          <Plus size={20} /> Nova despesa
        </button>
      )}

      <nav className="bottom-nav" aria-label="Navegação principal">
        {BOTTOM.map((n) => (
          <button key={n.key} type="button" className={page === n.key ? "active" : ""} onClick={() => go(n.key)} aria-current={page === n.key ? "page" : undefined}>
            <span className="ic">{n.icon}</span>
            {n.label}
            {n.key === "nia" && pending > 0 && <span className="badge">{pending}</span>}
          </button>
        ))}
        <button type="button" className={!BOTTOM.some((b) => b.key === page) ? "active" : ""} onClick={() => setDrawer(true)}>
          <span className="ic">
            <Menu size={20} />
          </span>
          Mais
        </button>
      </nav>
    </div>
  );
}
