# Estação Meteo (Weather Station)

A **low-power ESP32-C3 weather station** designed for battery and solar operation, with a web app that shows a **network of stations on a map**. It measures wind (speed, gust, direction), temperature, humidity, pressure, rain and battery voltage.

[Português](README.md)

![Station network map](docs/img/captura-mapa.png)

> **Status:** the firmware compiles, the API has automated tests, and the web app was checked in a browser, but **the electronics and power consumption have not been validated on a bench yet**. Energy numbers are datasheet-based estimates. Please report what you measure.

## Features

- **Multi-station map** with wind particles interpolated between stations, pins with a summary, details panel and a table of the network.
- **Station page** with an animated illustration of the equipment: every instrument moves with its own data and has a live label. Works on phones.
- **Charts** (6 h, 24 h, 7 days), wind rose and trends.
- **Energy and telemetry:** voltage, Wi-Fi signal, sleep cycle and a **live autonomy estimate**.
- **Remote configuration:** the station pulls its settings on every upload. Battery chemistry and capacity are set per station (Li-ion, LiFePO4, LiPo, 2×AA).
- **Efficient firmware:** deep sleep, wind counting in light sleep, batched uploads, fast Wi-Fi reconnect, urgent gust alerts and a captive Wi-Fi portal for first setup.
- **Professional-grade wind data:** a continuous mode that reports the mean, gust and vector-averaged direction for the whole period.

## Architecture

![Architecture](docs/img/arquitetura.svg)

The station wakes up, measures and stores the reading in a batch. Every N readings (or immediately on a strong gust) it connects to Wi-Fi and POSTs the batch over HTTPS, each reading with its age in seconds. A Cloudflare Worker stores it in D1, returns new configuration if any, and serves the web app.

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
| BME280 and GY-273 (QMC5883L) | SDA = GPIO6, SCL = GPIO7 |
| Anemometer Hall sensor | GPIO4 |
| Rain gauge Hall sensor | GPIO3 (wakes from deep sleep) |
| Battery | GPIO0, 2× 1 MΩ divider |

## Estimated consumption

| Profile | Average current | Runtime (3000 mAh) |
|---|---|---|
| Window mode, upload every 3 readings (default) | ≈ 0.20 mA | ~500 days in theory |
| Continuous mode, upload every 3 readings | ≈ 0.49 mA | ~205 days |

## Documentation

The detailed documentation is in Portuguese (Brazil), in [docs/](docs/): [hardware](docs/hardware.md), [firmware](docs/firmware.md), [deployment](docs/implantacao.md), [API](docs/api.md), [energy](docs/energia.md), [calibration](docs/calibracao.md), [troubleshooting](docs/solucao-de-problemas.md). Translations are welcome (see [CONTRIBUTING.md](CONTRIBUTING.md)).

## Known limits

- Not validated on real hardware yet.
- The A3144 Hall sensor is only guaranteed from 4.5 V; use a low-voltage, low-current Hall (such as the DRV5032) on battery stations.
- HTTPS certificate validation is off by default.
- No rate limiting and no user accounts: there is a single admin token.

## License

Code under the [MIT license](LICENSE). The wind parts are based on the **Windicator V2.0 Compact**, which has its own license: see [THIRD_PARTY.md](THIRD_PARTY.md). Map data © OpenStreetMap contributors.
