-- ninho. — recursos para uso em família (só acrescenta; nada é apagado).

-- Senha: códigos de redefinição (e-mail ou gerado por quem administra a família)
CREATE TABLE password_resets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Hash SHA-256 do código (o código em si só aparece uma vez)
  code_hash   text NOT NULL,
  created_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  attempts    smallint NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX password_resets_profile_idx ON password_resets (profile_id, created_at DESC);

-- Notificações do resumo diário
ALTER TABLE profiles ADD COLUMN notify_digest boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN last_digest_on date;

CREATE TABLE push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint   text NOT NULL UNIQUE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_subscriptions_profile_idx ON push_subscriptions (profile_id);

-- Configurações geradas pelo próprio servidor (ex.: chaves VAPID das notificações)
CREATE TABLE app_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Orçamento mensal por categoria: pessoal (só a pessoa) ou da família (sobre as partes familiares)
CREATE TABLE budgets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  owner_id     uuid REFERENCES profiles(id) ON DELETE CASCADE,
  scope        text NOT NULL CHECK (scope IN ('personal', 'family')),
  category_id  text NOT NULL REFERENCES categories(id),
  limit_cents  bigint NOT NULL CHECK (limit_cents > 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope = 'personal') = (owner_id IS NOT NULL))
);
CREATE UNIQUE INDEX budgets_personal_idx ON budgets (owner_id, category_id) WHERE scope = 'personal';
CREATE UNIQUE INDEX budgets_family_idx ON budgets (household_id, category_id) WHERE scope = 'family';

-- Saldo informado da conta (o saldo de hoje = informado + movimentações depois da data)
ALTER TABLE financial_accounts ADD COLUMN balance_cents bigint;
ALTER TABLE financial_accounts ADD COLUMN balance_on date;

-- Lançamento feito sem internet: o id gerado no aparelho evita gravar duas vezes ao reenviar
ALTER TABLE transactions ADD COLUMN client_ref text;
CREATE UNIQUE INDEX transactions_client_ref_idx ON transactions (profile_id, client_ref) WHERE client_ref IS NOT NULL;

-- Metas ligadas a lançamentos
ALTER TABLE goal_contributions ADD COLUMN transaction_id uuid REFERENCES transactions(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX goal_contributions_tx_idx ON goal_contributions (transaction_id) WHERE transaction_id IS NOT NULL;

-- "Sempre que for este estabelecimento, conta para a meta X" (de uma pessoa só)
CREATE TABLE goal_rules (
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  merchant   text NOT NULL,
  goal_id    uuid NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, merchant)
);

-- Contas da casa divididas (luz, internet…): conta e partes são visíveis para a família
CREATE TABLE house_bills (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  created_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  name         text NOT NULL,
  category_id  text NOT NULL REFERENCES categories(id),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  due_on       date NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX house_bills_household_idx ON house_bills (household_id, due_on DESC);

CREATE TABLE house_bill_shares (
  bill_id        uuid NOT NULL REFERENCES house_bills(id) ON DELETE CASCADE,
  profile_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount_cents   bigint NOT NULL CHECK (amount_cents > 0),
  paid_at        timestamptz,
  -- Lançamento da parte no financeiro de quem pagou
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  PRIMARY KEY (bill_id, profile_id)
);

-- Foto da nota fiscal (comprimida no aparelho); só o dono vê
CREATE TABLE receipts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES transactions(id) ON DELETE CASCADE,
  mime           text NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  image          bytea NOT NULL,
  size_bytes     integer NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX receipts_profile_idx ON receipts (profile_id, created_at DESC);
CREATE INDEX receipts_tx_idx ON receipts (transaction_id);

-- Link de uso único e curto para baixar o relatório em PDF (o APK entrega ao navegador)
CREATE TABLE download_tokens (
  token_hash text PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('report')),
  payload    jsonb NOT NULL DEFAULT '{}',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
