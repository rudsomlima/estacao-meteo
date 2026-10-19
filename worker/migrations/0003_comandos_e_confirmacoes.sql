-- Para bancos que já têm o 0002. Bancos novos já nascem com isto no schema.sql.
-- Rode uma vez:  npx wrangler d1 execute estacao-meteo --remote --file=migrations/0003_comandos_e_confirmacoes.sql
ALTER TABLE stations ADD COLUMN cfg_applied_at INTEGER;
ALTER TABLE stations ADD COLUMN cmd TEXT;
ALTER TABLE stations ADD COLUMN cmd_at INTEGER;
ALTER TABLE stations ADD COLUMN cmd_sent INTEGER;
ALTER TABLE stations ADD COLUMN cmd_done INTEGER;
