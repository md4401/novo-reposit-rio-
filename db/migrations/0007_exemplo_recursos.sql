-- Dados de exemplo também nas contas a pagar, no patrimônio e nas dívidas
-- (somem junto com o resto em "Remover dados de exemplo").
ALTER TABLE payables ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE assets ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE debts ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
