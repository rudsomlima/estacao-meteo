-- Contadores de uso do painel "Servidor" (acessos, envios, gravações) e visitantes únicos por dia.
-- Rode uma vez:  npx wrangler d1 execute estacao-meteo --remote --file=migrations/0006_metricas.sql
CREATE TABLE IF NOT EXISTS metrics (
  day TEXT NOT NULL,                    -- AAAA-MM-DD (horário de Brasília)
  k   TEXT NOT NULL,                    -- req, ingest, visit, view, ws, login, err, denied, rows, d1w
  n   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, k)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS visitors (
  day TEXT NOT NULL,
  h   TEXT NOT NULL,                    -- hash do IP + dia (muda todo dia, não identifica ninguém)
  PRIMARY KEY (day, h)
) WITHOUT ROWID;
