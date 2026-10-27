// Estrutura: menu lateral (computador) e barra inferior + gaveta (celular), como no protótipo.
import { Activity, ArrowLeftRight, Banknote, Bell, Bot, Briefcase, Calculator, CalendarClock, Eye, EyeOff, FileText, FolderLock, Gift, HandCoins, Handshake, HeartHandshake, House, Landmark, LifeBuoy, ListChecks, Lock, Menu, MessagesSquare, Milestone, PiggyBank, Plus, Receipt, Repeat, Scale, Settings, ShieldAlert, ShoppingBasket, Sparkles, Tags, Target, Ticket, TrendingUp, Trophy, Users, Wallet } from "lucide-react";
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
  { key: "renda", label: "Renda variável", icon: <Briefcase size={17} /> },
  { key: "parcelar", label: "Parcelar ou à vista?", icon: <Calculator size={17} /> },
  { key: "momentos", label: "Grandes momentos", icon: <Milestone size={17} /> },
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
const TOGETHER: NavItem[] = [
  { key: "acertos", label: "Quem deve a quem", icon: <Handshake size={17} /> },
  { key: "reuniao", label: "Reunião do mês", icon: <MessagesSquare size={17} /> },
  { key: "compras", label: "Lista de compras", icon: <ListChecks size={17} /> },
];
const CARE: NavItem[] = [
  { key: "receber", label: "Valores a receber", icon: <HandCoins size={17} /> },
  { key: "bancos", label: "Custo dos bancos", icon: <Banknote size={17} /> },
  { key: "pontos", label: "Benefícios e pontos", icon: <Ticket size={17} /> },
  { key: "reserva", label: "Reserva de emergência", icon: <LifeBuoy size={17} /> },
  { key: "documentos", label: "Documentos e garantias", icon: <FolderLock size={17} /> },
  { key: "seguranca", label: "Golpes e segurança", icon: <ShieldAlert size={17} /> },
  { key: "legado", label: "E se eu faltar?", icon: <HeartHandshake size={17} /> },
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

export const PAGE_TITLES: Record<string, string> = {
  ...Object.fromEntries([...MAIN, ...TOGETHER, ...PLAN, ...CARE, ...SMART, ...MORE].map((n) => [n.key, n.label])),
  acompanhar: "Acompanhar",
};

// Modo simples (letras maiores, poucas telas) e modo criança
const SIMPLE: NavItem[] = [
  { key: "inicio", label: "Início", icon: <House size={17} /> },
  { key: "transacoes", label: "Meus lançamentos", icon: <ArrowLeftRight size={17} /> },
  { key: "pagar", label: "Contas a pagar", icon: <CalendarClock size={17} /> },
  { key: "seguranca", label: "Golpes e segurança", icon: <ShieldAlert size={17} /> },
  { key: "nia", label: "Falar com a Nia", icon: <Bot size={17} /> },
  { key: "ajustes", label: "Configurações", icon: <Settings size={17} /> },
];
const KID: NavItem[] = [
  { key: "inicio", label: "Meu dinheiro", icon: <House size={17} /> },
  { key: "metas", label: "Cofrinhos", icon: <PiggyBank size={17} /> },
  { key: "desafios", label: "Desafios", icon: <Trophy size={17} /> },
  { key: "transacoes", label: "O que gastei", icon: <ArrowLeftRight size={17} /> },
  { key: "nia", label: "Nia", icon: <Bot size={17} /> },
  { key: "ajustes", label: "Configurações", icon: <Settings size={17} /> },
];

const BOTTOM: NavItem[] = [
  { key: "inicio", label: "Início", icon: <House size={20} /> },
  { key: "transacoes", label: "Transações", icon: <ArrowLeftRight size={20} /> },
  { key: "nia", label: "Nia", icon: <Bot size={20} /> },
  { key: "familia", label: "Família", icon: <Users size={20} /> },
];

export function Layout({ page, children }: { page: string; children: ReactNode }) {
  const { me, hidden, toggleHidden, openModal, toast } = useApp();
  const [drawer, setDrawer] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const pending = me?.pendingCount ?? 0;
  const mode = me?.profile.uiMode ?? "full";
  const reduced = mode !== "full" && !showAll;

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

  // Na criança, o "Gastei" já fica na tela inicial
  const showFab = ["inicio", "meu", "transacoes"].includes(page) && !(mode === "kid" && page === "inicio");
  const bottom = mode === "kid" ? BOTTOM.map((n) => (n.key === "familia" ? { key: "metas", label: "Cofrinhos", icon: <PiggyBank size={20} /> } : n)) : BOTTOM;

  return (
    <div className={`app ${mode}`}>
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
        {reduced ? (
          <nav className="nav">{(mode === "kid" ? KID : SIMPLE).map(navButton)}</nav>
        ) : (
          <>
          <div className="group-label">PAINEL</div>
          <nav className="nav">{MAIN.map(navButton)}</nav>
          <div className="group-label" style={{ marginTop: 24 }}>
            ENTRE NÓS
          </div>
          <nav className="nav">{TOGETHER.map(navButton)}</nav>
          <div className="group-label" style={{ marginTop: 24 }}>
            PLANEJAMENTO
          </div>
          <nav className="nav">{PLAN.map(navButton)}</nav>
          <div className="group-label" style={{ marginTop: 24 }}>
            PROTEÇÃO
          </div>
          <nav className="nav">{CARE.map(navButton)}</nav>
          <div className="group-label" style={{ marginTop: 24 }}>
            INTELIGÊNCIA
          </div>
          <nav className="nav">{SMART.map(navButton)}</nav>
          <div className="group-label" style={{ marginTop: 24 }}>
            CONTA
          </div>
          <nav className="nav">{MORE.map(navButton)}</nav>
          </>
        )}
        {mode !== "full" && (
          <button type="button" className="link" style={{ marginTop: 14 }} onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Mostrar menos" : "Ver todas as telas"}
          </button>
        )}
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
        {bottom.map((n) => (
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
