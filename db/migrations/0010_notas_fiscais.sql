-- Notas fiscais guardadas: toda foto de nota (câmera, Nia ou "Compartilhar") fica num arquivo da
-- pessoa, com o que foi lido dela. Só a dona vê. Ligar a uma compra é opcional.
ALTER TABLE receipts ADD COLUMN merchant text;
ALTER TABLE receipts ADD COLUMN total_cents bigint CHECK (total_cents IS NULL OR total_cents >= 0);
ALTER TABLE receipts ADD COLUMN issued_on date;
-- Itens lidos: [{ "name", "amountCents", "categoryId" }]
ALTER TABLE receipts ADD COLUMN items jsonb NOT NULL DEFAULT '[]';

-- Apagar a compra não apaga mais a nota: ela continua no arquivo, só sem a compra ligada
ALTER TABLE receipts DROP CONSTRAINT receipts_transaction_id_fkey;
ALTER TABLE receipts ADD CONSTRAINT receipts_transaction_id_fkey
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL;
