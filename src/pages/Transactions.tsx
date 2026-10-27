import { CalendarRange, Download, FileUp, Lock, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { Transaction } from "../../shared/types";
import { TxList } from "../components/TxRow";
import { Empty, ErrorBox, Heading, Money, PeriodControl, Skeleton } from "../components/ui";
import { scopeLabel, txCategoryLabel, txScope } from "../lib/format";
import type { Route } from "../lib/router";
import { useData } from "../lib/useData";
import { ImportModal } from "../modals/AccountModals";
import { QuickAddSheet } from "../modals/MenuSheets";
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

  const filters: [Filter, string][] = [
    ["all", "Todas"],
    ["pending", `Pendentes${me?.pendingCount ? ` · ${me.pendingCount}` : ""}`],
    ["family", "Familiares"],
    ["personal", "Pessoais"],
    ["ignored", "Ignoradas"],
  ];

  return (
    <>
      <Heading
        title="Transações"
        subtitle="Tudo o que entrou e saiu das suas contas. Toque numa linha para classificar ou dividir."
        actions={
          <>
            <button type="button" className="btn dark" onClick={() => openModal(<QuickAddSheet />)}>
              <Plus size={15} /> Adicionar
            </button>
            <button type="button" className="btn ghost" onClick={() => openModal(<ImportModal />)}>
              <FileUp size={15} /> Importar extrato
            </button>
            {items.length > 0 && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  exportCsv(items);
                  toast("CSV exportado só com as suas transações desta lista.");
                }}
              >
                <Download size={15} /> Exportar CSV
              </button>
            )}
          </>
        }
      />
      <div className="tx-toolbar">
        <div className="search-wrap">
          <Search size={17} />
          <input className="search" type="search" placeholder="Buscar estabelecimento ou descrição…" aria-label="Buscar transações" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {filter !== "pending" && (
          <div className="tx-period">
            {allMonths ? <span className="period-all">Todos os meses</span> : <PeriodControl month={month} onChange={setMonth} max={today} />}
            <button type="button" className="btn ghost small" onClick={() => setAllMonths((v) => !v)}>
              <CalendarRange size={14} /> {allMonths ? "Por mês" : "Tudo"}
            </button>
          </div>
        )}
      </div>
      <div className="chips-row" role="tablist" aria-label="Filtrar transações">
        {filters.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={filter === key} className={`filter-chip ${filter === key ? "on" : ""}`} onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
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
          <div className="tx-summary">
            <div>
              <span>Saídas</span>
              <b className="down">
                <Money cents={out} sign="-" />
              </b>
            </div>
            <div>
              <span>Entradas</span>
              <b className="up">
                <Money cents={inc} sign="+" />
              </b>
            </div>
            <div>
              <span>Movimentações</span>
              <b>{items.length}</b>
            </div>
          </div>
          <div className="list-box">
            <TxList items={items} />
          </div>
          <p className="muted small" style={{ marginTop: 12 }}>
            <Lock size={12} style={{ verticalAlign: -1 }} /> Só as suas transações aparecem aqui.
          </p>
        </>
      )}
    </>
  );
}
