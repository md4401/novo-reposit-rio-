-- Sentido do dinheiro (entrou ou saiu da conta), para calcular o saldo das contas.
-- Receita = entrou, despesa = saiu; em transferências vem do extrato (positivo = entrou).
ALTER TABLE transactions ADD COLUMN inflow boolean;
UPDATE transactions SET inflow = (direction = 'income');

CREATE FUNCTION set_inflow() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.inflow IS NULL THEN NEW.inflow := (NEW.direction = 'income'); END IF;
  ELSIF NEW.direction IS DISTINCT FROM OLD.direction AND NEW.direction <> 'transfer' THEN
    NEW.inflow := (NEW.direction = 'income');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER transactions_inflow
  BEFORE INSERT OR UPDATE OF direction ON transactions
  FOR EACH ROW EXECUTE FUNCTION set_inflow();

ALTER TABLE transactions ALTER COLUMN inflow SET NOT NULL;
