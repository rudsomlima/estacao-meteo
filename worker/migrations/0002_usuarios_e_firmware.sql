-- Para bancos criados ANTES do login com Google (schema.sql antigo). Bancos novos já nascem com isto no schema.sql.
-- Rode uma vez:  npx wrangler d1 execute estacao-meteo --remote --file=migrations/0002_usuarios_e_firmware.sql
ALTER TABLE stations ADD COLUMN owner_email TEXT;

CREATE TABLE IF NOT EXISTS users (
  email      TEXT PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT '',
  picture    TEXT NOT NULL DEFAULT '',
  role       TEXT NOT NULL DEFAULT 'user',
  created_at INTEGER NOT NULL,
  last_login INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS releases (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  version    TEXT NOT NULL,
  size       INTEGER NOT NULL,
  sha256     TEXT NOT NULL,
  chunks     INTEGER NOT NULL,
  notes      TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS release_chunks (
  release_id INTEGER NOT NULL,
  idx        INTEGER NOT NULL,
  data       TEXT NOT NULL,
  PRIMARY KEY (release_id, idx)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS fw_assign (
  station_id  TEXT PRIMARY KEY,
  release_id  INTEGER NOT NULL,
  assigned_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  ts     INTEGER NOT NULL,
  actor  TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS audit_ts ON audit (ts DESC);
