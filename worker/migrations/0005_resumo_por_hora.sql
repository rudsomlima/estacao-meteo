-- Para bancos que já têm o 0004. Bancos novos já nascem com isto no schema.sql.
-- Rode uma vez:  npx wrangler d1 execute estacao-meteo --remote --file=migrations/0005_resumo_por_hora.sql
-- O resumo por hora das leituras antigas é completado aos poucos pelo cron (a cada 5 min).
ALTER TABLE stations ADD COLUMN latest TEXT;
CREATE TABLE IF NOT EXISTS readings_hourly (
  station_id TEXT NOT NULL,
  hour       INTEGER NOT NULL,
  n INTEGER NOT NULL,
  temp_avg REAL, temp_min REAL, temp_max REAL,
  hum_avg REAL, hum_n INTEGER NOT NULL DEFAULT 0,
  pres_avg REAL, pres_min REAL, pres_max REAL,
  wind_avg REAL, gust_max REAL, dir REAL,
  rain REAL NOT NULL DEFAULT 0, vbat_avg REAL, rssi_avg REAL,
  PRIMARY KEY (station_id, hour)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS readings_hourly_hour ON readings_hourly (hour);
UPDATE stations SET latest = (
  SELECT json_object('ts', ts, 'temp', temp, 'hum', hum, 'pres', pres, 'wind', wind, 'gust', gust, 'dir', dir, 'rain', rain, 'vbat', vbat, 'rssi', rssi)
  FROM readings r WHERE r.station_id = stations.id ORDER BY ts DESC LIMIT 1
);
