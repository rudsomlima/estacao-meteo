-- Uma linha por estação. A chave do dispositivo nunca é guardada: só o SHA-256 dela.
CREATE TABLE IF NOT EXISTS stations (
  id         TEXT PRIMARY KEY,           -- "serra", usado na URL /#/s/serra
  name       TEXT NOT NULL,
  city       TEXT NOT NULL DEFAULT '',
  lat        REAL NOT NULL,
  lon        REAL NOT NULL,
  alt        REAL NOT NULL DEFAULT 0,
  key_hash   TEXT NOT NULL UNIQUE,
  config     TEXT NOT NULL,              -- JSON com o que o ESP32 baixa (ver DEFAULT_CONFIG no index.ts)
  created_at INTEGER NOT NULL
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
