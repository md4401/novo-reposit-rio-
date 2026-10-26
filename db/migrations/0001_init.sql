-- ninho. — schema inicial (Neon Postgres).
-- Regras inegociáveis do caderno de produto:
--   • dinheiro em centavos inteiros (bigint) e moeda explícita;
--   • a transação importada é preservada; categorias ficam em transaction_allocations;
--   • soma das divisões = valor da transação (trigger adiado, checado no COMMIT);
--   • identificador externo + chave única evitam importação duplicada;
--   • tudo tem dono (profile_id); a visão da família só lê agregados.

CREATE TABLE households (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  -- Código para outro integrante entrar na família
  invite_code text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name          text NOT NULL,
  email         text,
  password_hash text,
  role          text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  -- Integrante fictício dos dados de exemplo (não faz login)
  is_demo       boolean NOT NULL DEFAULT false,
  avatar_color  text NOT NULL DEFAULT '#1e6650',
  timezone      text NOT NULL DEFAULT 'America/Sao_Paulo',
  -- Horário do resumo diário de pendências
  digest_hour   smallint NOT NULL DEFAULT 20 CHECK (digest_hour BETWEEN 0 AND 23),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (is_demo OR (email IS NOT NULL AND password_hash IS NOT NULL))
);
CREATE INDEX profiles_household_idx ON profiles (household_id);
CREATE UNIQUE INDEX profiles_email_idx ON profiles (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Hash SHA-256 do token (o token em si fica só no aparelho)
  token_hash   text NOT NULL UNIQUE,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL
);
CREATE INDEX sessions_profile_idx ON sessions (profile_id);

-- Limite de tentativas de login/cadastro
CREATE TABLE auth_attempts (
  key        text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_attempts_idx ON auth_attempts (key, created_at);

-- Catálogo de categorias (preenchido pelo script de migração a partir de shared/categories.ts)
CREATE TABLE categories (
  id    text PRIMARY KEY,
  name  text NOT NULL,
  icon  text NOT NULL,
  color text NOT NULL,
  kind  text NOT NULL CHECK (kind IN ('expense', 'income', 'transfer')),
  sort  smallint NOT NULL DEFAULT 0
);

CREATE TABLE financial_accounts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name           text NOT NULL,
  kind           text NOT NULL CHECK (kind IN ('checking', 'credit_card', 'savings', 'cash', 'other')),
  institution    text,
  last4          text,
  active         boolean NOT NULL DEFAULT true,
  -- Última atualização bem-sucedida (importação de extrato ou lançamento)
  last_synced_at timestamptz,
  -- Criada pelos dados de exemplo (some ao remover a demonstração)
  is_demo        boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX financial_accounts_profile_idx ON financial_accounts (profile_id);

CREATE TABLE transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  account_id    uuid REFERENCES financial_accounts(id) ON DELETE SET NULL,
  occurred_on   date NOT NULL,
  -- Texto como veio do banco ou como a pessoa digitou
  description   text NOT NULL,
  -- Estabelecimento normalizado (regras, recorrências e duplicidades)
  merchant      text NOT NULL,
  amount_cents  bigint NOT NULL CHECK (amount_cents > 0),
  currency      text NOT NULL DEFAULT 'BRL',
  -- transfer = pagamento de fatura, transferência entre contas próprias: não é gasto
  direction     text NOT NULL CHECK (direction IN ('expense', 'income', 'transfer')),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'auto', 'confirmed')),
  classified_by text CHECK (classified_by IN ('user', 'rule', 'history', 'keyword', 'ai')),
  source        text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'csv', 'ofx', 'voice', 'receipt', 'demo')),
  -- FITID do OFX ou hash da linha do CSV: impede importar a mesma linha duas vezes
  external_id   text,
  method        text,
  -- Transação importada nunca é apagada: fica ignorada
  ignored       boolean NOT NULL DEFAULT false,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX transactions_profile_date_idx ON transactions (profile_id, occurred_on DESC);
CREATE INDEX transactions_merchant_idx ON transactions (profile_id, merchant);
CREATE UNIQUE INDEX transactions_external_idx
  ON transactions (profile_id, (coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid)), external_id)
  WHERE external_id IS NOT NULL;

-- Divisão da compra em categorias; cada parte pode ser pessoal ou familiar
CREATE TABLE transaction_allocations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  profile_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category_id    text NOT NULL REFERENCES categories(id),
  amount_cents   bigint NOT NULL CHECK (amount_cents > 0),
  scope          text NOT NULL CHECK (scope IN ('personal', 'family')),
  position       smallint NOT NULL DEFAULT 0
);
CREATE INDEX transaction_allocations_tx_idx ON transaction_allocations (transaction_id);
CREATE INDEX transaction_allocations_scope_idx ON transaction_allocations (scope, profile_id);

-- Invariante: se a transação tem divisões, a soma fecha centavo por centavo
-- e todas pertencem ao mesmo dono. Checado no fim da transação do banco.
CREATE FUNCTION check_allocations() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  tx_id    uuid;
  expected bigint;
  owner_id uuid;
  total    bigint;
  parts    int;
  foreign_parts int;
BEGIN
  IF TG_TABLE_NAME = 'transactions' THEN
    tx_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    tx_id := OLD.transaction_id;
  ELSE
    tx_id := NEW.transaction_id;
  END IF;

  SELECT amount_cents, profile_id INTO expected, owner_id FROM transactions WHERE id = tx_id;
  IF NOT FOUND THEN
    RETURN NULL; -- transação apagada junto com as divisões
  END IF;

  SELECT count(*), coalesce(sum(amount_cents), 0), count(*) FILTER (WHERE profile_id <> owner_id)
    INTO parts, total, foreign_parts
    FROM transaction_allocations WHERE transaction_id = tx_id;

  IF foreign_parts > 0 THEN
    RAISE EXCEPTION 'Divisão com dono diferente da transação' USING ERRCODE = '23514';
  END IF;
  IF parts > 0 AND total <> expected THEN
    RAISE EXCEPTION 'A soma das categorias (%) precisa ser igual ao valor da compra (%)', total, expected
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER allocations_sum_check
  AFTER INSERT OR UPDATE OR DELETE ON transaction_allocations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_allocations();

CREATE CONSTRAINT TRIGGER transactions_amount_check
  AFTER UPDATE OF amount_cents ON transactions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_allocations();

-- Regras de classificação: sempre de uma pessoa só (nunca classificam compras de outro)
CREATE TABLE categorization_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  merchant    text NOT NULL,
  category_id text NOT NULL REFERENCES categories(id),
  scope       text NOT NULL CHECK (scope IN ('personal', 'family')),
  origin      text NOT NULL CHECK (origin IN ('learned', 'explicit')),
  active      boolean NOT NULL DEFAULT true,
  hits        integer NOT NULL DEFAULT 0,
  version     integer NOT NULL DEFAULT 1,
  is_demo     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, merchant)
);

CREATE TABLE financial_goals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  owner_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name         text NOT NULL,
  icon         text NOT NULL DEFAULT '🎯',
  target_cents bigint NOT NULL CHECK (target_cents > 0),
  scope        text NOT NULL CHECK (scope IN ('personal', 'family')),
  deadline     date,
  is_demo      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX financial_goals_household_idx ON financial_goals (household_id);

-- Nas metas da família, todos veem o total; cada contribuição só para quem contribuiu
CREATE TABLE goal_contributions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id      uuid NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
  profile_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL CHECK (amount_cents <> 0),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX goal_contributions_goal_idx ON goal_contributions (goal_id);

-- Alertas que a pessoa marcou como "está tudo certo"
CREATE TABLE alert_dismissals (
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  alert_key  text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, alert_key)
);

-- Histórico de importações (alimenta a tela Saúde dos dados)
CREATE TABLE import_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  account_id      uuid REFERENCES financial_accounts(id) ON DELETE CASCADE,
  format          text NOT NULL CHECK (format IN ('csv', 'ofx', 'demo')),
  file_name       text,
  status          text NOT NULL CHECK (status IN ('success', 'failed')),
  rows_total      integer NOT NULL DEFAULT 0,
  rows_imported   integer NOT NULL DEFAULT 0,
  rows_duplicated integer NOT NULL DEFAULT 0,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX import_runs_profile_idx ON import_runs (profile_id, created_at DESC);

-- Conversa privada com a Nia
CREATE TABLE ai_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('user', 'assistant')),
  content    text NOT NULL,
  payload    jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_messages_profile_idx ON ai_messages (profile_id, created_at);

CREATE TABLE audit_events (
  id         bigserial PRIMARY KEY,
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  action     text NOT NULL,
  entity     text,
  entity_id  text,
  data       jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_profile_idx ON audit_events (profile_id, created_at DESC);
