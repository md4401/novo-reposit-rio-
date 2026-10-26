import { Camera, Download, FileUp, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { Transaction } from "../../shared/types";
import { TxList } from "../components/TxRow";
import { DemoFlag, Empty, ErrorBox, Heading, Money, PeriodControl, Segmented, Skeleton } from "../components/ui";
import { scopeLabel, txCategoryLabel, txScope } from "../lib/format";
import type { Route } from "../lib/router";
import { useData } from "../lib/useData";
import { ImportModal } from "../modals/AccountModals";
import { NewTransactionModal } from "../modals/NewTransactionModal";
import { ReceiptModal } from "../modals/ReceiptModal";
import { useApp } from "../state";

type Filter = "all" | "pending" | "family" | "personal" | "ignored";

function exportCsv(items: Transaction[]) {
  const rows = [
    ["Data", "Descrição", "Tipo", "Categoria", "Âmbito", "Valor (R$)", "Estado"],
    ...items.map((t) => [
      t.occurredOn,
      t.description,
      t.direction === "income" ? "Receita" : t.direction === "transfer" ? "Transferência" : "Despesa",
      txCategoryLabel(t),
      scopeLabel(txScope(t)),
      (t.amountCents / 100).toFixed(2).replace(".", ","),
      t.status === "pending" ? "Revisar" : t.status === "auto" ? "Automática" : "Confirmada",
    ]),
  ];
  const csv = "﻿" + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "ninho-transacoes.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function TransactionsPage({ route }: { route: Route }) {
  const { me, openModal, toast } = useApp();
  const today = me?.today.slice(0, 7) ?? "";
  const [month, setMonth] = useState(today);
  const [allMonths, setAllMonths] = useState(false);
  const [filter, setFilter] = useState<Filter>(route.query.get("filtro") === "pendentes" ? "pending" : "all");
  const [search, setSearch] = useState(route.query.get("q") ?? "");
  const [q, setQ] = useState(search);

  useEffect(() => {
    const id = window.setTimeout(() => setQ(search.trim()), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  const params = new URLSearchParams();
  if (!allMonths && filter !== "pending") params.set("month", month);
  if (q) params.set("q", q);
  if (filter === "pending" || filter === "ignored") params.set("status", filter);
  if (filter === "family" || filter === "personal") params.set("scope", filter);
  const { data, error, reload } = useData<Transaction[]>(`transactions?${params}`);
  const items = data ?? [];
  const out = items.filter((t) => t.direction === "expense" && !t.ignored).reduce((s, t) => s + t.amountCents, 0);
  const inc = items.filter((t) => t.direction === "income" && !t.ignored).reduce((s, t) => s + t.amountCents, 0);

  return (
    <>
      <Heading
        title="Transações"
        subtitle="Acompanhe, categorize e distribua suas próprias movimentações."
        actions={
          <>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                exportCsv(items);
                toast("CSV exportado só com as suas transações desta lista.");
              }}
              disabled={!items.length}
            >
              <Download size={15} /> Exportar CSV
            </button>
            <button type="button" className="btn ghost" onClick={() => openModal(<ImportModal />)}>
              <FileUp size={15} /> Importar extrato
            </button>
            <button type="button" className="btn ghost" onClick={() => openModal(<ReceiptModal />)}>
              <Camera size={15} /> Nota fiscal
            </button>
            <button type="button" className="btn dark hide-mobile" onClick={() => openModal(<NewTransactionModal />)}>
              <Plus size={15} /> Registrar compra
            </button>
          </>
        }
      />
      <DemoFlag />
      <div className="filterbar">
        <div className="search-wrap">
          <Search size={17} />
          <input className="search" type="search" placeholder="Buscar estabelecimento ou descrição…" aria-label="Buscar transações" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {filter !== "pending" && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {!allMonths && <PeriodControl month={month} onChange={setMonth} max={today} />}
            <button type="button" className={`btn small ${allMonths ? "dark" : "ghost"}`} onClick={() => setAllMonths((v) => !v)}>
              {allMonths ? "Todos os meses" : "Ver todos"}
            </button>
          </div>
        )}
      </div>
      <div className="filterbar">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            ["all", "Todas"],
            ["pending", `Pendentes${me?.pendingCount ? ` (${me.pendingCount})` : ""}`],
            ["family", "Familiares"],
            ["personal", "Pessoais"],
            ["ignored", "Ignoradas"],
          ]}
        />
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? (
        <Skeleton height={320} />
      ) : items.length === 0 ? (
        <div className="list-box">
          <Empty
            icon="🧾"
            title={filter === "pending" ? "Nenhuma pendência" : "Nenhuma transação encontrada"}
            text={filter === "pending" ? "Tudo classificado. Bom trabalho!" : "Registre uma despesa ou importe o extrato do seu banco (CSV ou OFX)."}
            action={
              <button type="button" className="btn dark small" onClick={() => openModal(<ImportModal />)}>
                <FileUp size={14} /> Importar extrato
              </button>
            }
          />
        </div>
      ) : (
        <>
          <p className="muted small" style={{ marginBottom: 8 }}>
            {items.length} movimentaç{items.length === 1 ? "ão" : "ões"} · saídas <Money cents={out} /> · entradas <Money cents={inc} />
          </p>
          <div className="list-box">
            <TxList items={items} />
          </div>
          <p className="muted small" style={{ marginTop: 12 }}>
            Toque numa transação para editar categorias, dividir valores ou marcar como pessoal/familiar. Só os seus dados aparecem aqui.
          </p>
        </>
      )}
    </>
  );
}
