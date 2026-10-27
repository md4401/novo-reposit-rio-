-- Cesta da família: categoria de cada item da nota (para agrupar a cesta por tipo de produto)
ALTER TABLE receipt_items ADD COLUMN category_id text NOT NULL DEFAULT 'outros' REFERENCES categories(id);
CREATE INDEX receipt_items_tx_idx ON receipt_items (transaction_id);
