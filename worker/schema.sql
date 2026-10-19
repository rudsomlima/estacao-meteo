-- Uma linha por estação. A chave do dispositivo nunca é guardada: só o SHA-256 dela.
-- O mesmo hash serve de segredo para assinar os envios em HTTP (veja docs/api.md).
CREATE TABLE IF NOT EXISTS stations (
  id          TEXT PRIMARY KEY,           -- "serra", usado na URL /#/s/serra
  name        TEXT NOT NULL,
  city        TEXT NOT NULL DEFAULT '',
  lat         REAL NOT NULL,
  lon         REAL NOT NULL,
  alt         REAL NOT NULL DEFAULT 0,
  key_hash    TEXT NOT NULL UNIQUE,
  config      TEXT NOT NULL,              -- JSON com o que o ESP32 baixa (ver DEFAULT_CONFIG em shared.ts)
  created_at  INTEGER NOT NULL,
  nonce       TEXT NOT NULL DEFAULT '',   -- desafio do modo assinado (HTTP); muda a cada envio
  cfg_applied INTEGER NOT NULL DEFAULT 0, -- versão da configuração que a estação disse ter
  last_seen   INTEGER,                    -- último contato (segundos)
  fw_version  TEXT,                       -- versão do firmware que a estação disse ter
  vbat        REAL,                       -- bateria (V) e sinal Wi-Fi (dBm) do último contato, mesmo sem leitura de sensor
  rssi        REAL,
  owner_email TEXT                        -- dono da estação (login Google); vazio = só o administrador mexe
);

CREATE TABLE IF NOT EXISTS readings (
  station_id TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  ts   INTEGER NOT NULL,                 -- unix, segundos (carimbado pelo servidor)
  temp REAL, hum REAL, pres REAL,
  wind REAL, gust REAL, dir REAL,
  rain REAL,                             -- mm desde a leitura anterior
  vbat REAL, rssi REAL,
  PRIMARY KEY (station_id, ts)
) WITHOUT ROWID;

-- Eventos do firmware: reinícios, falhas de atualização, modo bancada.
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id TEXT NOT NULL,
  ts         INTEGER NOT NULL,
  kind       TEXT NOT NULL,
  data       TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS events_station_ts ON events (station_id, ts DESC);

-- Configurações do servidor (hoje: Telegram). O token nunca volta para o navegador.
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Estado dos alertas, para avisar só quando o nível muda.
CREATE TABLE IF NOT EXISTS alert_state (
  station_id TEXT NOT NULL,
  kind       TEXT NOT NULL,
  level      TEXT NOT NULL,
  ts         INTEGER NOT NULL,
  PRIMARY KEY (station_id, kind)
) WITHOUT ROWID;

-- Códigos de pareamento: o administrador gera, quem instala digita no portal da estação.
-- Guarda só o hash do código. Vale uma vez e expira.
CREATE TABLE IF NOT EXISTS claims (
  code_hash  TEXT PRIMARY KEY,
  station_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
) WITHOUT ROWID;

-- Firmware publicado para atualização pelo ar (OTA), em pedaços de base64.
CREATE TABLE IF NOT EXISTS firmware (
  station_id  TEXT PRIMARY KEY,
  version     TEXT NOT NULL,
  size        INTEGER NOT NULL,
  sha256      TEXT NOT NULL,
  chunks      INTEGER NOT NULL,
  uploaded_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS firmware_chunks (
  station_id TEXT NOT NULL,
  idx        INTEGER NOT NULL,
  data       TEXT NOT NULL,
  PRIMARY KEY (station_id, idx)
) WITHOUT ROWID;

-- Usuários que entraram com o Google. O papel "admin" vem de ADMIN_EMAILS (wrangler.toml) ou é dado por outro administrador.
CREATE TABLE IF NOT EXISTS users (
  email      TEXT PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT '',
  picture    TEXT NOT NULL DEFAULT '',
  role       TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'admin'
  created_at INTEGER NOT NULL,
  last_login INTEGER NOT NULL
);

-- Versões de firmware (uma cópia só, atribuída a várias estações) e a quem cada uma foi atribuída.
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

-- Quem fez o quê (alterações de configuração, firmware, usuários, token).
CREATE TABLE IF NOT EXISTS audit (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  ts     INTEGER NOT NULL,
  actor  TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS audit_ts ON audit (ts DESC);
