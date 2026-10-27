// Contratos entre a API (server/) e as telas (src/). Valores sempre em centavos.

export type Scope = "personal" | "family";
export type Direction = "expense" | "income" | "transfer";
export type TxStatus = "pending" | "auto" | "confirmed";
export type ClassifiedBy = "user" | "rule" | "history" | "keyword" | "ai";
export type AccountKind = "checking" | "credit_card" | "savings" | "cash" | "other";

export type Member = { id: string; name: string; avatarColor: string; isDemo: boolean; role: "admin" | "member"; isMe: boolean };

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
};

export type Me = {
  profile: { id: string; name: string; email: string; role: "admin" | "member"; avatarColor: string; digestHour: number; timezone: string };
  household: { id: string; name: string; inviteCode: string; members: Member[] };
  accounts: Account[];
  pendingCount: number;
  /** Quer receber a notificação do resumo diário */
  notifyDigest: boolean;
  aiEnabled: boolean;
  /** Mensagens de voz gravadas e transcritas no servidor (Whisper) */
  voiceEnabled: boolean;
  hasDemoData: boolean;
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

export type Insight = { id: string; icon: string; title: string; text: string; page?: string };

export type Overview = {
  month: string;
  family: MonthTotals & { previousExpenseCents: number };
  familyCategories: CategoryTotal[];
  familySeries: SeriesPoint[];
  mine: MonthTotals;
  pendingCount: number;
  recent: Transaction[];
  insights: Insight[];
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

export type Asset = { id: string; name: string; kind: "investment" | "property" | "vehicle" | "other"; valueCents: number; updatedOn: string };
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
