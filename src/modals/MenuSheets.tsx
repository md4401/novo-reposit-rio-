// "Adicionar" (botão + da barra) e "Menu" (as seções, pela foto no topo) — abrem como painel de baixo no celular.
import { Camera, ChevronRight, FileUp, Lock, MessageCircle, Minus, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Avatar, ModalHeader } from "../components/ui";
import { KID_NAV, NAV, navContext, sectionOf, SIMPLE_NAV, visibleTabs } from "../lib/nav";
import { navigate } from "../lib/router";
import { useApp } from "../state";
import { ImportModal } from "./AccountModals";
import { NewTransactionModal } from "./NewTransactionModal";
import { ReceiptModal } from "./ReceiptModal";

function SheetOption({ icon, title, text, tone, onClick }: { icon: ReactNode; title: string; text: string; tone?: "dark" | "lime"; onClick: () => void }) {
  return (
    <button type="button" className="sheet-option" onClick={onClick}>
      <span className={`sheet-ic ${tone ?? ""}`}>{icon}</span>
      <span className="sheet-text">
        <b>{title}</b>
        <small>{text}</small>
      </span>
      <ChevronRight size={16} className="muted" />
    </button>
  );
}

export function QuickAddSheet() {
  const { openModal, closeModal } = useApp();
  const then = (node: ReactNode) => closeModal(() => openModal(node));
  return (
    <div>
      <ModalHeader title="Adicionar" subtitle="Escolha como quer registrar." />
      <div className="sheet-list">
        <SheetOption tone="dark" icon={<Minus size={18} />} title="Despesa" text="Uma compra ou conta paga" onClick={() => then(<NewTransactionModal />)} />
        <SheetOption tone="lime" icon={<Plus size={18} />} title="Receita" text="Salário, Pix recebido, reembolso" onClick={() => then(<NewTransactionModal direction="income" />)} />
        <SheetOption icon={<FileUp size={18} />} title="Importar extrato" text="CSV ou OFX baixado do app do banco" onClick={() => then(<ImportModal />)} />
        <SheetOption icon={<Camera size={18} />} title="Foto da nota fiscal" text="A Nia lê os itens e as categorias" onClick={() => then(<ReceiptModal />)} />
        <SheetOption icon={<MessageCircle size={18} />} title="Contar para a Nia" text="“Gastei 80 no mercado” — por texto ou voz" onClick={() => closeModal(() => navigate("nia"))} />
      </div>
    </div>
  );
}

export function MoreSheet({ page, reduced, onShowAll }: { page: string; reduced?: boolean; onShowAll?: () => void }) {
  const { me, closeModal } = useApp();
  const [all, setAll] = useState(!reduced);
  const go = (key: string) => closeModal(() => navigate(key === "inicio" ? "" : key));
  const current = sectionOf(page).key;
  const ctx = navContext(me);
  // Modo simples ou criança: o menu curto primeiro, com a opção de ver tudo
  const short = me?.profile.uiMode === "kid" ? KID_NAV : SIMPLE_NAV;
  return (
    <div>
      <ModalHeader title="Menu" />
      {me && (
        <button type="button" className="sheet-profile" onClick={() => go("ajustes")}>
          <Avatar name={me.profile.name} color={me.profile.avatarColor} />
          <span className="sheet-text">
            <b>{me.profile.name}</b>
            <small>{me.household.name}</small>
          </span>
          <span className="chip green">
            <Lock size={11} /> Privado
          </span>
        </button>
      )}
      {all ? (
        <div className="sheet-sections">
          {NAV.map((n) => ({ n, tabs: visibleTabs(n, ctx) })).map(({ n, tabs }) => (
            <div key={n.key} className={`sheet-section ${current === n.key ? "on" : ""}`}>
              <button type="button" className="sheet-section-head" onClick={() => go(n.key)} aria-current={current === n.key && tabs.length === 1 ? "page" : undefined}>
                <span className="sheet-ic">{n.icon(17)}</span>
                <b>{n.label}</b>
                {tabs.length === 1 && <small>{n.hint}</small>}
              </button>
              {tabs.length > 1 && (
                <div className="sheet-screens">
                  {tabs.map((t) => (
                    <button key={t.key} type="button" className={`cat-chip ${page === t.key ? "on" : ""}`} onClick={() => go(t.key)} aria-current={page === t.key ? "page" : undefined}>
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="sheet-grid">
            {short.map((n) => (
              <button key={n.key} type="button" className={`sheet-tile ${page === n.key ? "on" : ""}`} onClick={() => go(n.key)} aria-current={page === n.key ? "page" : undefined}>
                <span className="sheet-ic">{n.icon(18)}</span>
                <b>{n.label}</b>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn ghost block"
            style={{ marginTop: 12 }}
            onClick={() => {
              setAll(true);
              onShowAll?.();
            }}
          >
            Ver todas as telas
          </button>
        </>
      )}
    </div>
  );
}
