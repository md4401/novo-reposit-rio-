-- ninho. — acertos entre a família, divisão proporcional, combinados, valores a receber, benefícios,
-- pontos, reserva, documentos, "e se eu faltar", renda variável, modos simples/criança,
-- acompanhamento consentido e lista de compras (só acrescenta).

-- Quem deve a quem (visível só para as duas pessoas envolvidas)
CREATE TABLE ious (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  creditor_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  debtor_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  description  text NOT NULL,
  occurred_on  date NOT NULL,
  created_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  settled_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (creditor_id <> debtor_id)
);
CREATE INDEX ious_creditor_idx ON ious (creditor_id, settled_at);
CREATE INDEX ious_debtor_idx ON ious (debtor_id, settled_at);

-- Renda informada só para dividir contas na proporção (a família vê apenas a porcentagem)
ALTER TABLE profiles ADD COLUMN split_income_cents bigint CHECK (split_income_cents > 0);

-- Combinados da família e reunião do mês
CREATE TABLE agreements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  text         text NOT NULL,
  -- "Compra acima de X a gente conversa antes"
  limit_cents  bigint CHECK (limit_cents > 0),
  created_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agreements_household_idx ON agreements (household_id);

CREATE TABLE family_meetings (
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  month        text NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  notes        text NOT NULL DEFAULT '',
  held_at      timestamptz,
  updated_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, month)
);

-- Valores a receber (reembolso, restituição, empréstimo…)
CREATE TABLE receivables (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name           text NOT NULL,
  kind           text NOT NULL CHECK (kind IN ('saude', 'empresa', 'restituicao', 'emprestimo', 'outro')),
  amount_cents   bigint NOT NULL CHECK (amount_cents > 0),
  expected_on    date,
  received_at    timestamptz,
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX receivables_profile_idx ON receivables (profile_id, received_at);

-- Vale-refeição/alimentação como conta; contas e bens que formam a reserva de emergência
ALTER TABLE financial_accounts DROP CONSTRAINT financial_accounts_kind_check;
ALTER TABLE financial_accounts ADD CONSTRAINT financial_accounts_kind_check
  CHECK (kind IN ('checking', 'credit_card', 'savings', 'cash', 'other', 'benefit'));
ALTER TABLE financial_accounts ADD COLUMN is_reserve boolean NOT NULL DEFAULT false;
ALTER TABLE assets ADD COLUMN is_reserve boolean NOT NULL DEFAULT false;

-- Pontos, milhas e cashback
CREATE TABLE loyalty (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  program     text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('pontos', 'milhas', 'cashback')),
  balance     bigint NOT NULL CHECK (balance >= 0),
  -- Quanto vale em reais (estimativa da pessoa), opcional
  value_cents bigint CHECK (value_cents >= 0),
  expires_on  date,
  updated_on  date NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX loyalty_profile_idx ON loyalty (profile_id);

-- Garantias, seguros, contratos e documentos (foto opcional, comprimida no aparelho)
CREATE TABLE documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- true = a família vê (ex.: garantia da geladeira); false = só o dono
  shared      boolean NOT NULL DEFAULT false,
  name        text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('garantia', 'seguro', 'contrato', 'documento', 'outro')),
  expires_on  date,
  remind_days smallint NOT NULL DEFAULT 30 CHECK (remind_days BETWEEN 0 AND 365),
  notes       text,
  mime        text CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  image       bytea,
  size_bytes  integer,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK ((image IS NULL) = (mime IS NULL))
);
CREATE INDEX documents_profile_idx ON documents (profile_id, expires_on);

-- "E se eu faltar?": instruções para uma pessoa de confiança (nunca senhas)
CREATE TABLE legacy_vault (
  profile_id    uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  content       text NOT NULL,
  trusted_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  -- now: a pessoa de confiança já pode ler; inactive: só depois de N dias sem abrir o app
  release_mode  text NOT NULL DEFAULT 'inactive' CHECK (release_mode IN ('now', 'inactive')),
  inactive_days smallint NOT NULL DEFAULT 60 CHECK (inactive_days BETWEEN 15 AND 365),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (trusted_id IS NULL OR trusted_id <> profile_id)
);
ALTER TABLE profiles ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();

-- Renda variável e modo de uso (completo, simples para quem prefere letras grandes, criança)
ALTER TABLE profiles ADD COLUMN income_mode text NOT NULL DEFAULT 'fixed' CHECK (income_mode IN ('fixed', 'variable'));
ALTER TABLE profiles ADD COLUMN self_salary_cents bigint CHECK (self_salary_cents > 0);
ALTER TABLE profiles ADD COLUMN ui_mode text NOT NULL DEFAULT 'full' CHECK (ui_mode IN ('full', 'simple', 'kid'));

-- Acompanhamento consentido: quem acompanha vê só totais e alertas, nunca compras nem lojas
CREATE TABLE guardians (
  profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  guardian_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, guardian_id),
  CHECK (profile_id <> guardian_id)
);
CREATE INDEX guardians_guardian_idx ON guardians (guardian_id);

-- Lista de compras da família
CREATE TABLE shopping_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name         text NOT NULL,
  product_key  text NOT NULL,
  quantity     smallint NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 99),
  checked      boolean NOT NULL DEFAULT false,
  added_by     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shopping_items_household_idx ON shopping_items (household_id, checked);
