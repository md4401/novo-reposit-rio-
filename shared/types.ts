import type { NiaAction } from "./nia-intents.js";
export type { NiaAction } from "./nia-intents.js";
// Contratos entre a API (server/) e as telas (src/). Valores sempre em centavos.

export type Scope = "personal" | "family";
export type Direction = "expense" | "income" | "transfer";
export type TxStatus = "pending" | "auto" | "confirmed";
export type ClassifiedBy = "user" | "rule" | "history" | "keyword" | "ai";
export type AccountKind = "checking" | "credit_card" | "savings" | "cash" | "other" | "benefit";

export type Member = {
  id: string;
  name: string;
  avatarColor: string;
  isDemo: boolean;
  role: "admin" | "member";
  isMe: boolean;
  /** Parte na divisão proporcional à renda, em pontos-base (só a porcentagem; a renda nunca é mostrada) */
  splitBp: number | null;
};

export type Account = {
  id: string;
  name: string;
  kind: AccountKind;
  institution: string | null;
  last4: string | null;
  active: boolean;
  lastSyncedAt: string | null;
  /** Saldo informado pela pessoa e a data dele */
  balanceCents: number | null;
  balanceOn: string | null;
  /** Saldo estimado hoje (informado + movimentações depois da data) */
  currentBalanceCents: number | null;
  /** Cartão de crédito: gastos do mês nesta conta */
  monthSpentCents: number;
  history: { month: string; balanceCents: number }[];
  /** Cartão: dia de fechamento e de vencimento da fatura */
  closingDay: number | null;
  dueDay: number | null;
  /** Conta faz parte da reserva de emergência */
  isReserve: boolean;
};

export type Me = {
  profile: {
    id: string;
    name: string;
    email: string;
    role: "admin" | "member";
    avatarColor: string;
    digestHour: number;
    timezone: string;
    incomeMode: "fixed" | "variable";
    selfSalaryCents: number | null;
    uiMode: "full" | "simple" | "kid";
    /** Informou a renda para a divisão proporcional */
    hasSplitIncome: boolean;
    /** Como as despesas novas entram quando não se escolhe: Família (só nos totais) ou Pessoal */
    defaultScope: Scope;
    /** Quantas pessoas esta pessoa acompanha (a aba Acompanhar só aparece se for > 0) */
    watchingCount?: number;
  };
  household: {
    id: string;
    name: string;
    inviteCode: string;
    members: Member[];
    /** Menor limite dos combinados ("acima disso, conversamos antes") */
    agreementLimitCents: number | null;
  };
  accounts: Account[];
  pendingCount: number;
  /** Quer receber a notificação do resumo diário */
  notifyDigest: boolean;
  aiEnabled: boolean;
  /** Mensagens de voz gravadas e transcritas no servidor (Whisper) */
  voiceEnabled: boolean;
  hasDemoData: boolean;
  /** Primeiros passos já dados (guia de boas-vindas da tela inicial) */
  setup: { hasTransactions: boolean; hasBudget: boolean; hasGoal: boolean };
  today: string;
};

export type Allocation = { categoryId: string; amountCents: number; scope: Scope };

export type Transaction = {
  id: string;
  occurredOn: string;
  description: string;
  merchant: string;
  amountCents: number;
  direction: Direction;
  status: TxStatus;
  classifiedBy: ClassifiedBy | null;
  source: "manual" | "csv" | "ofx" | "voice" | "receipt" | "demo" | "notification" | "allowance";
  accountId: string | null;
  accountName: string | null;
  method: string | null;
  ignored: boolean;
  notes: string | null;
  allocations: Allocation[];
  /** Meta para a qual este lançamento conta */
  goalId: string | null;
  /** Foto da nota fiscal guardada */
  receiptId: string | null;
  tags: { id: string; name: string; color: string }[];
  /** IR: null = segue a categoria */
  taxDeductible: boolean | null;
};

export type MonthTotals = { incomeCents: number; expenseCents: number; balanceCents: number };
export type CategoryTotal = { categoryId: string; cents: number };
export type SeriesPoint = { month: string; incomeCents: number; expenseCents: number };

export type Insight = {
  id: string;
  icon: string;
  title: string;
  text: string;
  page?: string;
  /** Texto do botão quando o aviso pede uma ação ("Revisar", "Pagar"…) */
  cta?: string;
};

/** Agenda dos próximos dias na tela inicial (só itens da própria pessoa). */
export type UpcomingItem = {
  on: string;
  label: string;
  amountCents: number;
  kind: "bill" | "card" | "subscription" | "house";
  overdue: boolean;
  page: string;
};

export type Overview = {
  month: string;
  family: MonthTotals & { previousExpenseCents: number };
  familyCategories: CategoryTotal[];
  familySeries: SeriesPoint[];
  mine: MonthTotals & { previousExpenseCents: number };
  /** Categorias das suas compras no mês (partes pessoais e familiares) */
  mineCategories: CategoryTotal[];
  pendingCount: number;
  recent: Transaction[];
  insights: Insight[];
  /** "Precisa de você": alertas com ação, mais urgentes primeiro (até 4) */
  actions: Insight[];
  /** Dicas sem urgência (até 2) */
  tips: Insight[];
  /** Próximos 7 dias: contas, fatura, assinaturas e a sua parte nas contas da casa */
  upcoming: UpcomingItem[];
  /** Saldo previsto no fim do mês (só com saldo informado em alguma conta) */
  forecastEndOfMonthCents: number | null;
  dataWarning: boolean;
  budgets: BudgetSummary;
  /** Nos primeiros dias do mês: o mês que acabou de fechar */
  closingMonth: string | null;
};

export type Personal = {
  month: string;
  totals: MonthTotals;
  categories: CategoryTotal[];
  counts: { pending: number; categorized: number; total: number };
  activeRules: number;
  transactions: Transaction[];
  series: SeriesPoint[];
};

export type Goal = {
  id: string;
  name: string;
  icon: string;
  targetCents: number;
  savedCents: number;
  myContributionCents: number;
  scope: Scope;
  isOwner: boolean;
  deadline: string | null;
};

export type Family = {
  month: string;
  totals: MonthTotals;
  savingsRate: number | null;
  categories: CategoryTotal[];
  series: SeriesPoint[];
  goals: Goal[];
  members: { name: string; avatarColor: string; isDemo: boolean }[];
  dataWarning: boolean;
};

export type Recurring = {
  merchant: string;
  label: string;
  categoryId: string | null;
  kind: "assinatura" | "conta" | "parcela";
  intervalDays: number;
  lastOn: string;
  nextExpectedOn: string | null;
  lastAmountCents: number;
  previousAmountCents: number | null;
  count: number;
  installment: { n: number; of: number } | null;
};

export type AlertType = "increase" | "duplicate" | "unusual";
export type Alert = {
  key: string;
  type: AlertType;
  title: string;
  text: string;
  transactionIds: string[];
};

export type Commitments = {
  month: string;
  totalCents: number;
  items: { label: string; amountCents: number; kind: Recurring["kind"]; on: string }[];
};

export type AlertsPayload = {
  recurring: Recurring[];
  installments: Recurring[];
  alerts: Alert[];
  monthlyRecurringCents: number;
  /** Já comprometido para o mês que vem */
  commitments: Commitments;
};

export type SourceHealth = {
  accountId: string;
  name: string;
  kind: AccountKind;
  lastSyncedAt: string | null;
  daysSince: number | null;
  status: "ok" | "warn" | "stale" | "never";
};

export type ImportRun = {
  id: string;
  accountName: string | null;
  format: string;
  fileName: string | null;
  status: "success" | "failed";
  rowsTotal: number;
  rowsImported: number;
  rowsDuplicated: number;
  createdAt: string;
};

export type Health = {
  sources: SourceHealth[];
  coverage: { covered: number; total: number };
  classification: { classified: number; total: number };
  pending: number;
  duplicates: number;
  warning: boolean;
  imports: ImportRun[];
};

export type Rule = {
  id: string;
  merchant: string;
  categoryId: string;
  scope: Scope;
  origin: "learned" | "explicit";
  active: boolean;
  hits: number;
  createdAt: string;
};

export type ImportRow = {
  occurredOn: string;
  description: string;
  amountCents: number;
  direction: Direction;
  duplicate: boolean;
};

export type ImportResult = {
  format: "csv" | "ofx";
  rows: ImportRow[];
  total: number;
  duplicates: number;
  imported: number;
  committed: boolean;
  /** Banco reconhecido pelo cabeçalho do CSV */
  bank: string | null;
  /** Fatura de cartão reconhecida: sinais invertidos automaticamente */
  autoInverted: boolean;
  /** Mês (AAAA-MM) da movimentação mais recente do arquivo: a lista abre nele depois de importar */
  latestMonth: string | null;
  /** Quantas das importadas ficaram sem categoria (a revisar) */
  pending: number;
};

export type Proposal = {
  description: string;
  amountCents: number;
  direction: Direction;
  occurredOn: string;
  allocations: Allocation[];
};

export type NiaMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  proposal: Proposal | null;
  /** Pedido que a pessoa confirma (lista de compras, lembrete de conta, acerto, valor a receber) */
  action: NiaAction | null;
  /** Próximas perguntas sugeridas */
  suggestions: string[];
  createdAt: string;
};

export type ReceiptItem = { name: string; amountCents: number; categoryId: string };
export type ReceiptReading = {
  merchant: string | null;
  occurredOn: string | null;
  totalCents: number;
  items: ReceiptItem[];
  match: { transactionId: string; description: string; occurredOn: string } | null;
};

export type Budget = {
  id: string;
  scope: Scope;
  categoryId: string;
  limitCents: number;
  spentCents: number;
  /** gasto ÷ limite do mês (com o acumulado, se houver) */
  ratio: number;
  rollover: boolean;
  /** Sobra (+) ou falta (−) dos meses anteriores somada ao limite */
  carryCents: number;
};
export type BudgetsPayload = {
  month: string;
  personal: Budget[];
  family: Budget[];
  /** Pode editar o orçamento da família */
  canEditFamily: boolean;
};
export type BudgetSummary = { total: number; over: number; near: number };

export type HouseBillShare = { profileId: string; name: string; amountCents: number; paid: boolean; isMe: boolean };
export type HouseBill = {
  id: string;
  name: string;
  categoryId: string;
  amountCents: number;
  dueOn: string;
  shares: HouseBillShare[];
  canDelete: boolean;
};

export type MonthReport = {
  month: string;
  totals: MonthTotals;
  previousExpenseCents: number;
  categories: CategoryTotal[];
  biggest: { description: string; amountCents: number; occurredOn: string }[];
  family: MonthTotals;
  goals: { name: string; icon: string; savedCents: number; targetCents: number; scope: Scope }[];
  budgets: BudgetSummary;
};

export type CardInvoice = {
  accountId: string;
  accountName: string;
  closingOn: string;
  dueOn: string;
  totalCents: number;
  /** closed: fechada, esperando pagamento; open: recebendo compras; future: só parcelas já previstas */
  status: "closed" | "open" | "future";
  installmentsCents: number;
};

export type Payable = {
  id: string;
  name: string;
  categoryId: string;
  amountCents: number;
  dueOn: string;
  recurrence: "once" | "monthly" | "yearly";
  remindDays: number;
  accountId: string | null;
  seasonal: boolean;
  daysLeft: number;
  /** Sazonal: quanto guardar por mês até vencer */
  monthlySavingCents: number | null;
  status: "overdue" | "soon" | "ok";
};

export type ForecastPayload = {
  startCents: number;
  /** Algum saldo de conta foi informado (sem isso a previsão parte de zero) */
  knownBalance: boolean;
  series: { on: string; balanceCents: number }[];
  events: { on: string; label: string; amountCents: number; kind: "bill" | "card" | "income" | "subscription" }[];
  lowest: { on: string; balanceCents: number };
  firstNegative: string | null;
  endCents: number;
};

export type Tag = { id: string; name: string; color: string; count: number; totalCents: number };

export type TaxItem = { transactionId: string; occurredOn: string; description: string; amountCents: number; kind: "saude" | "educacao" | "outros"; overridden: boolean };
export type TaxReport = {
  year: number;
  items: TaxItem[];
  totals: { saude: number; educacao: number; outros: number };
  /** Limite anual de dedução com educação por pessoa (referência IRPF) */
  educationLimitCents: number;
};

export type Asset = { id: string; name: string; kind: "investment" | "property" | "vehicle" | "other"; valueCents: number; updatedOn: string; isReserve?: boolean };
export type Debt = { id: string; name: string; balanceCents: number; monthlyRatePercent: number; minPaymentCents: number };
export type Wealth = {
  accountsCents: number;
  assets: Asset[];
  debts: Debt[];
  cardsCents: number;
  assetsCents: number;
  debtsCents: number;
  netWorthCents: number;
  history: { month: string; netWorthCents: number }[];
};
export type DebtPlan = {
  extraCents: number;
  snowball: { months: number; interestCents: number; feasible: boolean; order: { id: string; name: string; paidOffMonth: number }[] };
  avalanche: { months: number; interestCents: number; feasible: boolean; order: { id: string; name: string; paidOffMonth: number }[] };
};

export type Wish = {
  id: string;
  name: string;
  priceCents: number;
  note: string | null;
  status: "open" | "goal" | "bought";
  goalId: string | null;
  votes: number;
  votedByMe: boolean;
  createdBy: string | null;
  canDelete: boolean;
};

export type Challenge = {
  id: string;
  kind: "no_delivery" | "organized" | "spend_less" | "no_spend_day";
  title: string;
  icon: string;
  text: string;
  startsOn: string;
  endsOn: string;
  status: "active" | "won" | "lost" | "abandoned";
  progress: number;
  detail: string;
};

export type Allowance = {
  id: string;
  memberId: string;
  memberName: string;
  amountCents: number;
  frequency: "weekly" | "monthly";
  payDay: number;
  limitCents: number | null;
  lastPaidOn: string | null;
  /** Para quem recebe: gastos do mês, para comparar com o limite */
  spentThisMonthCents: number | null;
  isMe: boolean;
};

export type BasketProduct = {
  key: string;
  name: string;
  categoryId: string;
  lastCents: number;
  changeBp: number | null;
  purchases: number;
  points: { month: string; avgCents: number; count: number }[];
};

export type Basket = {
  months: number;
  products: BasketProduct[];
  /** Quantas notas da família alimentam a cesta (sem dizer de quem) */
  receipts: number;
};

export type Iou = {
  id: string;
  description: string;
  amountCents: number;
  occurredOn: string;
  /** true: a outra pessoa me deve; false: eu devo a ela */
  owedToMe: boolean;
  otherId: string;
  otherName: string;
  settled: boolean;
  canDelete: boolean;
};
export type IouPayload = {
  items: Iou[];
  /** Saldo com cada pessoa: positivo = ela me deve */
  balances: { otherId: string; name: string; netCents: number }[];
};

export type Agreement = { id: string; text: string; limitCents: number | null; createdBy: string | null; canDelete: boolean };

export type MeetingAgenda = {
  month: string;
  family: { incomeCents: number; expenseCents: number; previousExpenseCents: number; topCategories: { categoryId: string; cents: number }[] };
  budgets: { categoryId: string; spentCents: number; limitCents: number }[];
  goals: { name: string; icon: string; savedCents: number; targetCents: number }[];
  bills: { name: string; amountCents: number; dueOn: string; unpaidCents: number }[];
  wishes: { name: string; priceCents: number; votes: number }[];
  ious: { name: string; netCents: number }[];
  agreements: Agreement[];
  notes: string;
  heldAt: string | null;
};

export type Receivable = {
  id: string;
  name: string;
  kind: "saude" | "empresa" | "restituicao" | "emprestimo" | "outro";
  amountCents: number;
  expectedOn: string | null;
  received: boolean;
  receivedAt: string | null;
  overdue: boolean;
};

export type BankCosts = {
  year: number;
  totalCents: number;
  byKind: { kind: "tarifa" | "juros" | "iof" | "anuidade" | "multa"; cents: number; count: number }[];
  byAccount: { name: string; cents: number }[];
  items: { occurredOn: string; description: string; amountCents: number; kind: string; accountName: string | null }[];
};

export type Loyalty = {
  id: string;
  program: string;
  kind: "pontos" | "milhas" | "cashback";
  balance: number;
  valueCents: number | null;
  expiresOn: string | null;
  updatedOn: string;
  daysLeft: number | null;
};

export type ReserveStatus = {
  /** Custo essencial por mês (moradia, mercado, saúde, transporte, educação, limpeza, higiene) */
  essentialCents: number;
  reserveCents: number;
  months: number;
  targetMonths: number;
  targetCents: number;
  items: { kind: "account" | "asset"; id: string; name: string; cents: number; isReserve: boolean }[];
};

export type DocumentItem = {
  id: string;
  name: string;
  kind: "garantia" | "seguro" | "contrato" | "documento" | "outro";
  expiresOn: string | null;
  remindDays: number;
  notes: string | null;
  shared: boolean;
  hasImage: boolean;
  owner: string;
  isMine: boolean;
  daysLeft: number | null;
};

export type LegacyMine = { content: string; trustedId: string | null; releaseMode: "now" | "inactive"; inactiveDays: number; updatedAt: string } | null;
export type LegacyShared = { ownerName: string; available: boolean; content: string | null; releaseMode: "now" | "inactive"; inactiveDays: number }[];

export type ScamAlert = { id: string; occurredOn: string; description: string; amountCents: number; reason: string };

export type IncomeOverview = {
  mode: "fixed" | "variable";
  selfSalaryCents: number | null;
  suggestedCents: number | null;
  averageCents: number;
  months: { month: string; incomeCents: number; diffCents: number; bufferCents: number }[];
};

export type GuardianInfo = {
  /** Quem me acompanha (eu autorizei) */
  guardians: { id: string; name: string }[];
  /** Quem eu acompanho (me autorizaram) */
  watching: { id: string; name: string }[];
};

export type GuardianSummary = {
  name: string;
  month: string;
  incomeCents: number;
  expenseCents: number;
  previousExpenseCents: number;
  pendingCount: number;
  bills: { name: string; amountCents: number; dueOn: string; status: "overdue" | "soon" | "ok" }[];
  alerts: { reason: string; amountCents: number; occurredOn: string }[];
};

export type KidSummary = {
  month: string;
  allowanceCents: number;
  spentCents: number;
  leftCents: number;
  goals: { id: string; name: string; icon: string; savedCents: number; targetCents: number }[];
};

export type PlanBase = {
  /** Médias mensais dos últimos 3 meses completos (só da pessoa) */
  incomeCents: number;
  expenseCents: number;
  /** Parcelas já previstas para o mês que vem */
  installmentsCents: number;
  /** Parcelas ÷ renda média (0,3 = 30%) */
  installmentsRatio: number;
};

export type ShoppingItem = { id: string; name: string; quantity: number; checked: boolean; addedBy: string | null; estimateCents: number | null };
export type ShoppingList = { items: ShoppingItem[]; estimateCents: number; unknownCount: number };
