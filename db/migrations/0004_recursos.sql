-- ninho. — fatura, contas a pagar, previsão, etiquetas, IR, patrimônio, dívidas, desejos,
-- desafios, mesada, captura de notificações e cesta da família (só acrescenta).

-- Fatura do cartão: dia de fechamento e de vencimento
ALTER TABLE financial_accounts ADD COLUMN closing_day smallint CHECK (closing_day BETWEEN 1 AND 31);
ALTER TABLE financial_accounts ADD COLUMN due_day smallint CHECK (due_day BETWEEN 1 AND 31);

-- Contas a pagar (pessoais): próxima data, repetição e lembrete
CREATE TABLE payables (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name         text NOT NULL,
  category_id  text NOT NULL REFERENCES categories(id),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  due_on       date NOT NULL,
  recurrence   text NOT NULL CHECK (recurrence IN ('once', 'monthly', 'yearly')),
  remind_days  smallint NOT NULL DEFAULT 3 CHECK (remind_days BETWEEN 0 AND 60),
  account_id   uuid REFERENCES financial_accounts(id) ON DELETE SET NULL,
  -- Sazonal: sugere guardar um pouco por mês até o vencimento
  seasonal     boolean NOT NULL DEFAULT false,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payables_profile_idx ON payables (profile_id, due_on);

CREATE TABLE payable_payments (
  payable_id     uuid NOT NULL REFERENCES payables(id) ON DELETE CASCADE,
  due_on         date NOT NULL,
  amount_cents   bigint NOT NULL CHECK (amount_cents > 0),
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  paid_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (payable_id, due_on)
);

-- Orçamento que acumula de um mês para o outro
ALTER TABLE budgets ADD COLUMN rollover boolean NOT NULL DEFAULT false;

-- Etiquetas (de uma pessoa só)
CREATE TABLE tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name       text NOT NULL,
  color      text NOT NULL DEFAULT '#4a9271',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tags_name_idx ON tags (profile_id, lower(name));

CREATE TABLE transaction_tags (
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tag_id         uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);
CREATE INDEX transaction_tags_tag_idx ON transaction_tags (tag_id);

-- Imposto de Renda: null = segue a categoria (saúde e educação são dedutíveis)
ALTER TABLE transactions ADD COLUMN tax_deductible boolean;

-- Patrimônio e dívidas
CREATE TABLE assets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('investment', 'property', 'vehicle', 'other')),
  value_cents bigint NOT NULL CHECK (value_cents >= 0),
  updated_on  date NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assets_profile_idx ON assets (profile_id);

CREATE TABLE debts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name              text NOT NULL,
  balance_cents     bigint NOT NULL CHECK (balance_cents >= 0),
  -- juros ao mês, em centésimos de ponto percentual (2,5% = 250)
  monthly_rate_bp   integer NOT NULL DEFAULT 0 CHECK (monthly_rate_bp BETWEEN 0 AND 5000),
  min_payment_cents bigint NOT NULL DEFAULT 0 CHECK (min_payment_cents >= 0),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX debts_profile_idx ON debts (profile_id);

CREATE TABLE net_worth_snapshots (
  profile_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  month        text NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  assets_cents bigint NOT NULL,
  debts_cents  bigint NOT NULL,
  PRIMARY KEY (profile_id, month)
);

-- Lista de desejos da família (com votos)
CREATE TABLE wishes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  created_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  name         text NOT NULL,
  price_cents  bigint NOT NULL CHECK (price_cents > 0),
  note         text,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'goal', 'bought')),
  goal_id      uuid REFERENCES financial_goals(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wishes_household_idx ON wishes (household_id, created_at DESC);

CREATE TABLE wish_votes (
  wish_id    uuid NOT NULL REFERENCES wishes(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (wish_id, profile_id)
);

-- Desafios (o progresso é calculado a partir das transações)
CREATE TABLE challenges (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('no_delivery', 'organized', 'spend_less', 'no_spend_day')),
  params     jsonb NOT NULL DEFAULT '{}',
  starts_on  date NOT NULL,
  ends_on    date NOT NULL,
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'won', 'lost', 'abandoned')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX challenges_profile_idx ON challenges (profile_id, created_at DESC);

-- Mesada: quem administra define; entra sozinha como receita de quem recebe
CREATE TABLE allowances (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  member_id    uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  frequency    text NOT NULL CHECK (frequency IN ('weekly', 'monthly')),
  -- semanal: 0 (domingo) a 6; mensal: dia 1 a 28
  pay_day      smallint NOT NULL,
  limit_cents  bigint CHECK (limit_cents > 0),
  created_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  last_paid_on date,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK ((frequency = 'weekly' AND pay_day BETWEEN 0 AND 6) OR (frequency = 'monthly' AND pay_day BETWEEN 1 AND 28))
);

-- Novas origens: notificação do banco capturada no celular e mesada automática
ALTER TABLE transactions DROP CONSTRAINT transactions_source_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_source_check
  CHECK (source IN ('manual', 'csv', 'ofx', 'voice', 'receipt', 'demo', 'notification', 'allowance'));

-- Cesta da família: itens das notas fiscais (o agregado não mostra quem nem onde)
CREATE TABLE receipt_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES transactions(id) ON DELETE CASCADE,
  name           text NOT NULL,
  product_key    text NOT NULL,
  amount_cents   bigint NOT NULL CHECK (amount_cents > 0),
  occurred_on    date NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX receipt_items_key_idx ON receipt_items (product_key, occurred_on);
CREATE INDEX receipt_items_profile_idx ON receipt_items (profile_id);
