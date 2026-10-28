// Telas que juntam duas antigas: a escolha fica num seletor logo abaixo das abas da seção,
// e o endereço guarda a escolha (#/compras?aba=precos) para links e para o botão voltar.
import type { ReactNode } from "react";
import { Segmented } from "../components/ui";
import { navigate } from "../lib/router";
import { BasketPage } from "./Basket";
import { BetweenPage } from "./Between";
import { HouseBillsPage } from "./HouseBills";
import { InstallmentsPage } from "./Installments";
import { ShoppingPage } from "./Shopping";
import { SimulatorPage } from "./Simulator";

type Part = { key: string; label: string; node: ReactNode };

function SubPages({ page, parts, current }: { page: string; parts: Part[]; current: string | null }) {
  const active = parts.find((p) => p.key === current) ?? parts[0];
  return (
    <>
      <div className="subpages">
        <Segmented value={active.key} options={parts.map((p) => [p.key, p.label])} onChange={(key) => navigate(key === parts[0].key ? page : `${page}?aba=${key}`)} />
      </div>
      {active.node}
    </>
  );
}

export function SimulatorsPage({ tab }: { tab: string | null }) {
  return (
    <SubPages
      page="simuladores"
      current={tab}
      parts={[
        { key: "parcelar", label: "Parcelar ou à vista?", node: <InstallmentsPage /> },
        { key: "momentos", label: "Grandes momentos", node: <SimulatorPage /> },
      ]}
    />
  );
}

export function SplitBillsPage({ tab }: { tab: string | null }) {
  return (
    <SubPages
      page="casa"
      current={tab}
      parts={[
        { key: "contas", label: "Contas da casa", node: <HouseBillsPage /> },
        { key: "acertos", label: "Quem deve a quem", node: <BetweenPage /> },
      ]}
    />
  );
}

export function GroceriesPage({ tab }: { tab: string | null }) {
  return (
    <SubPages
      page="compras"
      current={tab}
      parts={[
        { key: "lista", label: "Lista de compras", node: <ShoppingPage /> },
        { key: "precos", label: "Preços da cesta", node: <BasketPage /> },
      ]}
    />
  );
}
