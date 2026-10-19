-- Para bancos que já têm o 0003. Bancos novos já nascem com isto no schema.sql.
-- Rode uma vez:  npx wrangler d1 execute estacao-meteo --remote --file=migrations/0004_entrega_da_configuracao.sql
ALTER TABLE stations ADD COLUMN cfg_sent INTEGER;
ALTER TABLE stations ADD COLUMN cfg_sent_at INTEGER;
