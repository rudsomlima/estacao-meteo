# API

A API é um Cloudflare Worker ([worker/src/index.ts](../worker/src/index.ts)) com banco D1. O mesmo Worker serve o site. Todas as respostas são JSON.

Dois tipos de credencial:

| Credencial | Onde vai | O que autoriza |
|---|---|---|
| **Chave do dispositivo** | Header `X-Device-Key` | Só enviar leituras da própria estação. Guardada no servidor apenas como SHA-256. |
| **Token de administrador** | Header `Authorization: Bearer ...` | Criar, editar, apagar estações e gerar chaves. É o segredo `ADMIN_TOKEN` do Worker. |

Os endpoints de leitura (`GET`) são **públicos**. Se você não quer o mapa público, ponha o site atrás do Cloudflare Access ou de outra autenticação.

## Enviar leituras

`POST /api/ingest` com `X-Device-Key`.

```json
{
  "cfg": 3,
  "batch": [
    { "age": 1200, "temp": 22.5, "hum": 61, "pres": 835.1, "wind": 3.2, "gust": 5.5, "dir": 210,
      "rain": 0.2, "vbat": 3.91, "rssi": -61 },
    { "age": 600,  "temp": 22.1, "hum": 63, "pres": 835.0, "wind": 2.8, "gust": 4.9, "dir": 215,
      "rain": 0.0, "vbat": 3.92, "rssi": -61 },
    { "age": 0,    "temp": 21.8, "hum": 64, "pres": 834.9, "wind": 3.5, "gust": 6.1, "dir": 205,
      "rain": 0.0, "vbat": 3.93, "rssi": -61 }
  ]
}
```

| Campo | Unidade | Faixa aceita |
|---|---|---|
| `age` | segundos desde a leitura (0 se omitido) | 0 a 604800 |
| `temp` | °C | -60 a 90 |
| `hum` | % | 0 a 100 |
| `pres` | hPa | 300 a 1100 |
| `wind`, `gust` | m/s | 0 a 120, 0 a 150 |
| `dir` | graus, de onde o vento vem | 0 a 360 |
| `rain` | mm desde a leitura anterior | 0 a 200 |
| `vbat` | V | 1 a 5 |
| `rssi` | dBm | -120 a 0 |

O servidor carimba cada leitura com `agora - age`. Uma leitura solta (sem `batch`) também é aceita. O lote tem de 1 a 24 leituras. Todos os campos são obrigatórios; um valor fora da faixa rejeita o lote inteiro com `422`.

**Resposta:**

```json
{ "ts": 1792282013, "stored": 3, "config": null }
```

`config` vem preenchido (com o objeto de configuração completo) quando `cfg` é diferente da versão do servidor.

## Estações

| Método e rota | Auth | Descrição |
|---|---|---|
| `GET /api/stations` | pública | Lista com a última leitura e o resumo de 24 h (`day`). |
| `GET /api/stations/:id` | pública | Uma estação, com a configuração. |
| `GET /api/stations/:id/readings?hours=24` | pública | Leituras em ordem de tempo (1 a 720 horas). |
| `POST /api/stations` | admin | Cria a estação e devolve a chave **uma única vez**. |
| `PUT /api/stations/:id` | admin | Atualiza nome, local e configuração. Sobe a `version`. |
| `POST /api/stations/:id/key` | admin | Gera uma chave nova. A antiga deixa de valer. |
| `DELETE /api/stations/:id` | admin | Apaga a estação e as leituras. |

### Criar uma estação

```bash
curl -X POST https://SEU-SITE.workers.dev/api/stations \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{ "id": "serra", "name": "Serra", "city": "Campos do Jordão", "lat": -22.74, "lon": -45.59,
        "alt": 1628, "battery_chem": "li", "battery_mah": 3000 }'
```

Resposta `201` com `{ "id": "serra", ..., "key": "..." }`. Guarde a chave.

O `id` tem 2 a 32 letras minúsculas, números ou hífen.

### Configuração

Campos com os limites que o servidor aplica (valores fora da faixa são ajustados):

| Campo | Faixa | Campo | Faixa |
|---|---|---|---|
| `interval_min` | 1 a 60 | `slow_below_v` | 1,8 a 4,2 |
| `wind_window_s` | 2 a 30 | `slow_factor` | 1 a 12 |
| `gust_window_s` | 1 a 10 | `critical_v` | 1,5 a 4,0 |
| `samples` | 1 a 32 | `send_every` | 1 a 12 |
| `wifi_timeout_s` | 4 a 30 | `continuous_wind` | 0 ou 1 |
| `mm_per_tip` | 0,01 a 5 | `urgent_gust_kmh` | 0 a 200 |
| `k_wind` | 0,05 a 3 | `battery_mah` | 100 a 100000 |
| `dir_offset` | 0 a 359,99 | `battery_chem` | `li`, `lfp`, `lipo`, `aa` |

## Erros

| Código | Quando |
|---|---|
| 400 | JSON inválido |
| 401 | chave do dispositivo ou token de administrador ausente ou errado |
| 404 | estação ou rota inexistente |
| 409 | `id` já existe |
| 422 | campo ausente, fora da faixa ou lote com tamanho inválido |

## Limites e segurança

- **Não há limite de requisições.** Em produção, crie uma regra de rate limit da Cloudflare para `/api/ingest`.
- Há **um único administrador** (o token). Não existem contas de usuário.
- Leituras com mais de 400 dias são apagadas aleatoriamente em ~1% das gravações.
- Comparação de chaves em tempo constante, e a chave nunca é gravada em claro.

## Testar

```bash
cd worker
npm run db:local && npm run seed:local   # 6 estações com 7 dias de dados (chaves: dev-key-<id>)
npm run dev                              # em outro terminal
npm run smoke                            # 12 verificações da API
```
