// Estrutura: menu lateral (computador) e barra inferior com "+" no centro (celular).
import { Bell, Eye, EyeOff, Lock, Menu, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { BOTTOM_KEYS, NAV, PAGE_TITLES, type NavItem } from "../lib/nav";
import { navigate } from "../lib/router";
import { DigestModal } from "../modals/DigestModal";
import { MoreSheet, QuickAddSheet } from "../modals/MenuSheets";
import { useApp } from "../state";
import { Avatar } from "./ui";

const BOTTOM = BOTTOM_KEYS.map((key) => NAV.flatMap((g) => g.items).find((n) => n.key === key)!);

export function Layout({ page, children }: { page: string; children: ReactNode }) {
  const { me, hidden, toggleHidden, openModal, toast } = useApp();
  const pending = me?.pendingCount ?? 0;

  const go = (key: string) => navigate(key === "inicio" ? "" : key);
  const quickAdd = () => openModal(<QuickAddSheet />);

  const navButton = (n: NavItem) => (
    <button key={n.key} type="button" className={`nav-btn ${page === n.key ? "active" : ""}`} onClick={() => go(n.key)} aria-current={page === n.key ? "page" : undefined}>
      {n.icon(17)}
      <span>{n.label}</span>
      {n.key === "nia" && pending > 0 && <span className="count">{pending}</span>}
    </button>
  );

  const bottomButton = (n: NavItem) => (
    <button key={n.key} type="button" className={page === n.key ? "active" : ""} onClick={() => go(n.key)} aria-current={page === n.key ? "page" : undefined}>
      <span className="ic">{n.icon(20)}</span>
      {n.key === "inicio" ? "Início" : n.key === "nia" ? "Nia" : n.label}
      {n.key === "nia" && pending > 0 && <span className="badge">{pending}</span>}
    </button>
  );

  return (
    <div className="app">
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
        {NAV.map((group) => (
          <div key={group.label ?? "principal"} className="nav-group">
            {group.label && <div className="group-label">{group.label}</div>}
            <nav className="nav">{group.items.map(navButton)}</nav>
          </div>
        ))}
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

      <nav className="bottom-nav" aria-label="Navegação principal">
        {BOTTOM.slice(0, 2).map(bottomButton)}
        <button type="button" className="bottom-add" onClick={quickAdd} aria-label="Adicionar">
          <span className="ic">
            <Plus size={24} />
          </span>
        </button>
        {BOTTOM.slice(2).map(bottomButton)}
        <button type="button" className={!BOTTOM.some((b) => b.key === page) ? "active" : ""} onClick={() => openModal(<MoreSheet page={page} />)}>
          <span className="ic">
            <Menu size={20} />
          </span>
          Mais
        </button>
      </nav>
    </div>
  );
}
