-- Open Finance pela Pluggy. Cada conexão (o "item" da Pluggy) é de uma pessoa só: as contas, as
-- transações e os investimentos dela entram como os de um extrato importado e seguem privados.
CREATE TABLE bank_connections (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pluggy_item_id   text NOT NULL UNIQUE,
  connector_name   text NOT NULL,
  connector_image  text,
  -- Estado do item na Pluggy (UPDATED, UPDATING, LOGIN_ERROR, OUTDATED, WAITING_USER_INPUT)
  status           text NOT NULL DEFAULT 'UPDATING',
  execution_status text,
  error_message    text,
  -- Última vez que o ninho buscou os dados (não a última atualização do banco na Pluggy)
  last_synced_at   timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bank_connections_profile_idx ON bank_connections (profile_id);

-- Conta ou cartão que veio do Open Finance (desconectar mantém a conta e o histórico)
ALTER TABLE financial_accounts ADD COLUMN connection_id uuid REFERENCES bank_connections(id) ON DELETE SET NULL;
ALTER TABLE financial_accounts ADD COLUMN pluggy_account_id text UNIQUE;

-- Investimentos lidos da conexão (somem ao desconectar: são só a foto do saldo)
ALTER TABLE assets ADD COLUMN connection_id uuid REFERENCES bank_connections(id) ON DELETE CASCADE;
ALTER TABLE assets ADD COLUMN pluggy_investment_id text UNIQUE;

ALTER TABLE transactions DROP CONSTRAINT transactions_source_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_source_check
  CHECK (source IN ('manual', 'csv', 'ofx', 'voice', 'receipt', 'demo', 'notification', 'allowance', 'openfinance'));
