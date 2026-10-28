-- Despesas novas de cada pessoa entram como Família ou Pessoal (escolha dela, em Configurações →
-- Privacidade). Família só soma nos totais da casa: nunca mostra a compra, a loja nem quem comprou.
-- Padrão Família: o ninho é um app da casa, e quem prefere pode trocar para Pessoal.
ALTER TABLE profiles ADD COLUMN default_scope text NOT NULL DEFAULT 'family' CHECK (default_scope IN ('personal', 'family'));
