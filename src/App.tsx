import { Layout } from "./components/Layout";
import { Spinner } from "./components/ui";
import { useRoute } from "./lib/router";
import { AccountsPage } from "./pages/Accounts";
import { AlertsPage } from "./pages/Alerts";
import { AssistantPage } from "./pages/Assistant";
import { AuthPage } from "./pages/Auth";
import { BudgetsPage } from "./pages/Budgets";
import { ChallengesPage } from "./pages/Challenges";
import { FamilyPage } from "./pages/Family";
import { ForecastPage } from "./pages/Forecast";
import { GoalsPage } from "./pages/Goals";
import { HealthPage } from "./pages/Health";
import { HomePage } from "./pages/Home";
import { HouseBillsPage } from "./pages/HouseBills";
import { PayablesPage } from "./pages/Payables";
import { PersonalPage } from "./pages/Personal";
import { WealthPage } from "./pages/Wealth";
import { WishesPage } from "./pages/Wishes";
import { BasketPage } from "./pages/Basket";
import { SettingsPage } from "./pages/Settings";
import { SharePage } from "./pages/Share";
import { TagsPage } from "./pages/Tags";
import { TaxPage } from "./pages/Tax";
import { TransactionsPage } from "./pages/Transactions";
import { useApp } from "./state";

export function App() {
  const { me, loadingMe } = useApp();
  const route = useRoute();

  if (loadingMe) {
    return (
      <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "var(--dark)", color: "#fff" }}>
        <div style={{ display: "grid", justifyItems: "center", gap: 14 }}>
          <div className="brand-mark" style={{ width: 56, height: 56, fontSize: 28, borderRadius: 16 }}>
            n
          </div>
          <Spinner size={22} />
        </div>
      </div>
    );
  }
  if (!me) return <AuthPage />;

  const pages: Record<string, React.ReactNode> = {
    inicio: <HomePage />,
    meu: <PersonalPage />,
    familia: <FamilyPage />,
    transacoes: <TransactionsPage route={route} key={route.query.toString()} />,
    orcamento: <BudgetsPage />,
    pagar: <PayablesPage />,
    previsao: <ForecastPage />,
    patrimonio: <WealthPage />,
    ir: <TaxPage />,
    etiquetas: <TagsPage />,
    desejos: <WishesPage />,
    desafios: <ChallengesPage />,
    cesta: <BasketPage />,
    compartilhar: <SharePage />,
    casa: <HouseBillsPage />,
    metas: <GoalsPage />,
    nia: <AssistantPage />,
    alertas: <AlertsPage />,
    saude: <HealthPage />,
    contas: <AccountsPage />,
    ajustes: <SettingsPage />,
  };
  const page = pages[route.page] ? route.page : "inicio";
  return <Layout page={page}>{pages[page]}</Layout>;
}
