# Estação Meteo (Weather Station)

A **low-power ESP32-C3 weather station** designed for battery and solar operation, with a web app that shows a **network of stations on a map**. It measures wind (speed, gust, direction), temperature, humidity, pressure, rain and battery voltage.

[Português](README.md)

![Station network map](docs/img/captura-mapa.png)

> **Status:** the firmware compiles, the API has automated tests, and the web app was checked in a browser, but **the sensors, field electronics and power consumption have not been validated on a bench yet** (the firmware was flashed and tested on a real ESP32-C3 board: flashing from the site, USB provisioning and uploads). Energy numbers are datasheet-based estimates. Please report what you measure.

## Features

- **Multi-station map** with wind particles interpolated between stations, pins with a summary and stackable layers (wind, temperature, pressure, 24 h rain, battery, Wi-Fi signal, last seen), details panel and a table of the network.
- **Station page** with an animated illustration of the equipment: every instrument moves with its own data and has a live label. Works on phones.
- **Charts** (6 h, 24 h, 7 days), wind rose and trends.
- **Energy and telemetry:** voltage, Wi-Fi signal, sleep cycle and a **live autonomy estimate**.
- **Remote configuration:** the station pulls its settings on every upload. Battery chemistry and capacity are set per station (Li-ion, LiFePO4, LiPo, 2×AA).
- **Environment sensor and pins from the site:** BME280, MS5611 (GY-63), both, or none, and the GPIOs for SDA, SCL, wind, rain and battery, validated against the ESP32-C3 rules on the site, the server and the firmware.
- **Config status:** the site shows whether the station has applied the saved version (pending → applied).
- **Diagnostics:** unexpected reboots, firmware updates and bench-mode sessions show up on the site.
- **Telegram alerts:** station offline, low battery, strong gust and rain, with editable messages. One alert per state change, not per reading.
- **Analysis:** compare up to 3 stations and browse a monthly summary with a temperature calendar.
- **Site settings:** units (km/h, m/s, kn, mph; °C/°F; mm/in; hPa/inHg/mmHg), default map layers and basemap, favorite stations and Telegram. CSV export, backup and data refresh live in the admin panel.
- **Google sign-in and roles:** visitors read, users edit the stations they own, admins register stations and boards.
- **Admin panel:** network overview, bulk configuration, firmware rollout tracking per station, USB boards, users, sessions and an activity log.
- **Board setup from the browser:** for a new board, the wizard flashes the firmware, configures Wi-Fi and station credentials, and confirms the first reading. Advanced flashing updates or recovers firmware only; flashing just the app at `0x10000` preserves saved board data. Reconfiguring an existing station rotates its key and invalidates the previous key. See the [firmware guide](docs/firmware.md#gravar-o-firmware-pelo-navegador).
- **Over-the-air firmware updates** published from the site, verified with SHA-256 (no automatic rollback).
- **Bench mode:** at power-on the station opens a local page for a configurable number of minutes to view sensors and calibrate the vane without a serial cable.
- **Signed requests:** the admin token (for scripts) never travels (HMAC with a 2-minute window), and stations can upload over HTTP with signatures instead of HTTPS (forgery protection, not eavesdropping protection).
- **Efficient firmware:** deep sleep, wind counting in light sleep, batched uploads, fast Wi-Fi reconnect, urgent gust alerts and a captive Wi-Fi portal for first setup.
- **Professional-grade wind data:** a continuous mode that reports the mean, gust and vector-averaged direction for the whole period.

## Architecture

![Architecture](docs/img/arquitetura.svg)

The station wakes up, measures and stores the reading in a batch. Every N readings (or immediately on a strong gust) it connects to Wi-Fi and POSTs the batch over HTTPS, each reading with its age in seconds. A Cloudflare Worker stores it in D1, returns new configuration if any, notifies open browsers over a WebSocket, sends Telegram alerts and serves the web app. Admins can also talk to the board directly over USB.

## Quick start

```bash
# web app in demo mode (no hardware, no backend)
cd web && npm ci && npm run dev

# local API with 6 sample stations
cd worker && npm ci
npm run db:local && npm run seed:local && npm run dev
```

## Wiring

![Wiring diagram](docs/img/ligacao.svg)

| Sensor | ESP32-C3 |
|---|---|
| BME280, MS5611 (GY-63) and GY-273 (QMC5883L) | SDA = GPIO6, SCL = GPIO7 (sensor and pins are chosen on the site) |
| Anemometer Hall sensor | GPIO4 |
| Rain gauge Hall sensor | GPIO3 (wakes from deep sleep) |
| Battery | GPIO0, 2× 1 MΩ divider |

![ESP32-C3 SuperMini pinout](docs/img/pinagem.svg)

## Estimated consumption

| Profile | Average current | Runtime (3000 mAh) |
|---|---|---|
| Window mode, upload every 3 readings (default) | ≈ 0.20 mA | ~500 days in theory |
| Continuous mode, upload every 3 readings | ≈ 0.49 mA | ~205 days |

## Documentation

The detailed documentation is in Portuguese (Brazil), in [docs/](docs/): [first station, step by step with screenshots](docs/guia-primeira-estacao.md), [architecture](docs/arquitetura.md), [hardware](docs/hardware.md), [firmware](docs/firmware.md), [deployment](docs/implantacao.md), [API](docs/api.md), [energy](docs/energia.md), [calibration](docs/calibracao.md), [troubleshooting](docs/solucao-de-problemas.md). Translations are welcome (see [CONTRIBUTING.md](CONTRIBUTING.md)).

## Known limits

- Only flashing, USB provisioning and uploads were tested on a real board; sensors, power consumption and field behavior are not validated yet.
- The A3144 Hall sensor is only guaranteed from 4.5 V; use a low-voltage, low-current Hall (such as the DRV5032) on battery stations.
- HTTPS certificate validation is off by default.
- No rate limiting on the API (add a Cloudflare rate-limit rule for `/api/ingest`); read endpoints are public.

## License

Code under the [MIT license](LICENSE). The wind parts are based on the **Windicator V2.0 Compact**, which has its own license: see [THIRD_PARTY.md](THIRD_PARTY.md). Map data © OpenStreetMap contributors.
