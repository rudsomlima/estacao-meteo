# Arquitetura

![Arquitetura](img/arquitetura.svg)

## Visão geral

| Parte | Tecnologia | Papel |
|---|---|---|
| **Estação** | ESP32-C3, PlatformIO (Arduino) | Mede, guarda um lote, envia por HTTPS, baixa a configuração, dorme. |
| **API + site** | Cloudflare Worker + D1 (SQLite) | Recebe leituras, guarda, entrega dados, serve o site, guarda a configuração, firmware, usuários e registro de atividades. |
| **Tempo real** | Durable Object `Hub` (WebSocket em `/api/live`) | Avisa os navegadores abertos quando uma estação envia, sem eles ficarem consultando. |
| **Alertas** | Cron de 5 min + Telegram | Estação sem dados, bateria, rajada e chuva. Avisa uma vez por mudança de estado. |
| **Site** | React, Vite, Tailwind v4, motion, Lenis, MapLibre | Mapa da rede, página da estação, gráficos, energia, configuração, ajustes e painel do administrador. |
| **Login** | Google Identity Services | Entra com o Google; o Worker confere o ID token e emite um cookie de sessão. Papéis: visitante, usuário e administrador. |
| **Cabo USB** | Web Serial (Chrome, Edge, Opera) | O administrador grava o firmware, entrega Wi-Fi, endereço e chave e aplica a configuração direto na placa. |

Tudo o que o site mostra vem das leituras: não há valores inventados em produção. O **modo demonstração** (sem API) existe só para desenvolvimento e é sinalizado na barra superior.

## Fluxo de uma leitura

```mermaid
sequenceDiagram
    participant S as Estação (ESP32-C3)
    participant W as Worker
    participant D as D1
    participant B as Navegador

    Note over S: acorda, mede e guarda no lote
    S->>W: POST /api/ingest (X-Device-Key, cfg, batch[age,...])
    W->>D: busca a estação pelo SHA-256 da chave
    W->>D: grava cada leitura com ts = agora - age
    W-->>S: { stored, config: nova ou null }
    Note over S: se veio config, salva na flash e dorme
    B->>W: GET /api/stations
    W->>D: última leitura + resumo de 24 h
    W-->>B: estações
    B->>W: GET /api/stations/serra/readings?hours=168
    W-->>B: leituras
```

## Fluxo de configuração

```mermaid
sequenceDiagram
    participant U as Administrador
    participant B as Navegador
    participant W as Worker
    participant S as Estação

    U->>B: muda o intervalo e clica em Salvar
    B->>W: PUT /api/stations/serra (assinado com ADMIN_TOKEN)
    W->>W: valida limites e sobe a versão
    Note over S: no próximo envio
    S->>W: POST /api/ingest (cfg = versão que tem)
    W-->>S: config nova (versão diferente)
    S->>S: salva na flash e aplica
    S->>W: próximo envio (cfg = versão nova)
    W->>W: marca a configuração como aplicada
```

## Decisões

- **Servidor carimba o tempo.** A estação não tem relógio real. Cada leitura vai com a idade em segundos (`age`), e o servidor calcula `agora - age`. Isso permite enviar em lote sem NTP, que gastaria Wi-Fi extra.
- **Lote para economizar.** O Wi-Fi é o maior gasto de energia. Medir a cada 10 min e enviar a cada 30 reduz o consumo médio de ≈ 0,52 para ≈ 0,20 mA (estimativa).
- **Configuração baixada, não empurrada.** A estação dorme, então ela pergunta a cada envio se há versão nova. Não precisa de conexão aberta. Quando a placa está no cabo, o site a entrega direto pela USB.
- **Papéis em vez de uma senha só.** Quem não entrou só vê; o dono altera as estações dele; o administrador cadastra estações e placas. O `ADMIN_TOKEN` ficou para scripts e é assinado, nunca enviado.
- **Sensor e pinos são configuração.** Trocar o sensor de ambiente (BME280, MS5611, os dois, nenhum) ou um GPIO não exige regravar o firmware; as regras do ESP32-C3 são conferidas no site, no servidor e na placa.
- **Chave por estação, guardada como hash.** Vazou uma? Gera outra sem mexer nas demais. O banco nunca tem chaves em claro.
- **Um Worker só.** O mesmo Worker serve o site (`web/dist`) e a API, sem CORS e com um único deploy.
- **Banco simples.** O essencial são `stations` e `readings`; o resto (`events`, `users`, `releases`, `settings`, `claims`, `audit`...) guarda diagnóstico, contas, firmware e configurações. O vento fica em m/s e a pressão em hPa, e o site converte para as unidades escolhidas.
- **Campo de vento do mapa.** As partículas usam ponderação inversa da distância entre as estações online. É uma **estimativa visual**, e não um modelo meteorológico.

## Mapa do código

```
estacao-meteo/
├── firmware/            ESP32-C3 (PlatformIO)
│   └── src/             main, wind, sensors, net, auth, ota, usblink, bench, events, settings, config
├── worker/              Cloudflare Worker + D1
│   ├── src/             index (API), admin, auth, alerts, hub (WebSocket), config, crypto
│   ├── schema.sql       tabelas (e migrations/ para bancos antigos)
│   └── scripts/         seed.mjs (dados de exemplo) e smoke.mjs (testes)
├── web/                 Site (React)
│   └── src/
│       ├── components/  MapView, MapPage, StationFigure, StationSettings, ConfigPanel, AdminPage, FlashSetup...
│       ├── hooks/       useNetwork, useRoute, useLenis
│       └── lib/         api, derive (cálculos), energy (modelo de consumo), battery, usb, flash, pins, prefs
├── adaptacao_sensores_v2/   CAD do anemômetro e da biruta
└── docs/                documentação, figuras e as ferramentas que as geram
```
