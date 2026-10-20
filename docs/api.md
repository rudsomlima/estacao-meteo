# API

A API é um Cloudflare Worker ([worker/src/index.ts](../worker/src/index.ts)) com banco D1. O mesmo Worker serve o site. Todas as respostas são JSON, menos o download do firmware.

## Credenciais

| Quem | Como se identifica | O que autoriza |
|---|---|---|
| **Estação, por HTTPS** | Header `X-Device-Key` com a chave | Enviar leituras e baixar o próprio firmware. O servidor guarda só o SHA-256 da chave. |
| **Estação, por HTTP** | Assinatura HMAC (veja abaixo). A chave **não** viaja | O mesmo, sem expor a chave na rede. |
| **Administrador** | Assinatura HMAC com o `ADMIN_TOKEN`. O token **não** viaja | Criar, editar e apagar estações, gerar chaves, publicar firmware, alertas e uso do banco. |

Os endpoints de leitura (`GET /api/stations...`) são **públicos**. Se você não quer o mapa público, ponha o site atrás do Cloudflare Access ou de outra autenticação.

### Pedido de administrador

O navegador assina cada pedido; o token fica só no navegador (`localStorage`) e nunca é enviado.

```
X-Ts:  milissegundos desde 1970 (o servidor aceita ±2 minutos)
X-Sig: HMAC-SHA256(ADMIN_TOKEN, "<ts>|<MÉTODO>|<caminho+query>|<sha256 hex do corpo>")   em hex minúsculo
```

O sha256 do corpo vazio (`GET`, `DELETE`) é o de uma string vazia. Quem interceptar um pedido não consegue reutilizá-lo depois de 2 minutos nem trocar o método, o caminho ou o corpo. Um exemplo em Node está em [worker/scripts/smoke.mjs](../worker/scripts/smoke.mjs) (função `admin`).

> Limite: o `ADMIN_TOKEN` digitado no site fica no `localStorage` do navegador. Use um navegador seu.

### Estação por HTTP assinado

Para quem não quer ou não pode usar HTTPS (o ESP32 gasta menos sem TLS). Protege contra **forjar** dados, não contra **espionar**: o conteúdo continua legível na rede.

```
X-Station: id da estação
X-Nonce:   último nonce que a estação recebeu ("" no primeiro envio)
X-Sig:     HMAC-SHA256(sha256hex(chave), "<id>|<nonce>|<corpo>")
```

- O servidor gira o nonce a cada envio aceito e devolve o novo em `nonce`. Repetir um pedido antigo falha.
- Se o nonce estiver velho mas a assinatura estiver certa, a resposta é `401 {"error":"nonce","nonce":"..."}` e a estação tenta de novo com o nonce atual (o firmware faz isso sozinho).
- A resposta também vem assinada: `X-Sig = HMAC-SHA256(sha256hex(chave), "<nonce usado>|<corpo da resposta>")`. A estação confere antes de aplicar uma configuração ou uma atualização de firmware.

## Enviar leituras

`POST /api/ingest`

```json
{
  "cfg": 3,
  "fw": "1.2.0",
  "batch": [
    { "age": 1200, "temp": 22.5, "hum": 61, "pres": 835.1, "wind": 3.2, "gust": 5.5, "dir": 210,
      "rain": 0.2, "vbat": 3.91, "rssi": -61 },
    { "age": 0,    "temp": 21.8, "hum": 64, "pres": 834.9, "wind": 3.5, "gust": 6.1, "dir": 205,
      "rain": 0.0, "vbat": 3.93, "rssi": -61 }
  ],
  "events": [ { "kind": "boot", "age": 30, "reason": 1, "count": 12, "wake": "power-on" } ]
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
| `vbat` | V | 0 a 5 (0 = sem bateria, placa na USB) |
| `rssi` | dBm | -120 a 0 |

O servidor carimba cada leitura com `agora - age`. Uma leitura solta (sem `batch`) também é aceita. O lote tem de 1 a 24 leituras. Todos os campos são obrigatórios; um valor fora da faixa rejeita o lote inteiro com `422`.

- `cfg` é a versão da configuração que a estação tem. O servidor guarda isso: o site mostra **pendente → aplicada**.
- `fw` é a versão do firmware instalado.
- `events` (até 16 por envio, opcional) são registros do firmware. Tipos aceitos: `boot`, `ota_ok`, `ota_fail`, `bench`, `info`. Os demais são ignorados.

**Resposta:**

```json
{ "ts": 1792282013, "stored": 2, "config": null, "ota": null }
```

- `config`: a configuração completa quando `cfg` é diferente da versão do servidor.
- `ota`: `{ "version", "size", "sha256" }` quando há firmware publicado **com versão diferente** da instalada. A estação baixa em `GET /api/ota/firmware.bin` (mesma credencial), confere o SHA-256 e só então grava.
- `nonce`: só no modo assinado.

## Estações e leituras

| Método e rota | Auth | Descrição |
|---|---|---|
| `GET /api/stations` | pública | Lista com a última leitura e o resumo de 24 h (`day`). Inclui `cfg_applied`, `last_seen` e `fw_version`. |
| `GET /api/stations/:id` | pública | Uma estação, com a configuração. |
| `GET /api/stations/:id/readings?hours=24` | pública | Leituras em ordem de tempo (1 a 720 horas). |
| `GET /api/stations/:id/daily?days=30&tz=-180` | pública | Um resumo por dia (mín, máx, média, chuva, rajada, pressão). `tz` é o fuso em minutos. Até 366 dias. |
| `GET /api/stations/:id/events?limit=50` | pública | Eventos do firmware (reinícios, atualizações, modo bancada). |
| `GET /api/stations/:id/firmware` | pública | Firmware publicado e instalado. |
| `POST /api/stations` | admin | Cria a estação e devolve a chave **uma única vez**. |
| `PUT /api/stations/:id` | admin | Atualiza nome, local e configuração. Sobe a `version`. |
| `POST /api/stations/:id/key` | admin | Gera uma chave nova. A antiga deixa de valer. |
| `POST /api/stations/:id/claim` | admin | Gera um **código de pareamento** (veja abaixo). |
| `DELETE /api/stations/:id` | admin | Apaga a estação, as leituras e o firmware. |

### Criar uma estação

O token não vai em header, então o `curl` puro não basta. Use o site (botão *Adicionar estação*) ou assine o pedido como acima. O corpo é:

```json
{ "id": "serra", "name": "Serra", "city": "Campos do Jordão", "lat": -22.74, "lon": -45.59,
  "alt": 1628, "battery_chem": "li", "battery_mah": 3000 }
```

Resposta `201` com `{ "id": "serra", ..., "key": "..." }`. Guarde a chave. O `id` tem 2 a 32 letras minúsculas, números ou hífen.

### Configuração

Campos com os limites que o servidor aplica (valores fora da faixa são ajustados):

| Campo | Faixa | Campo | Faixa |
|---|---|---|---|
| `interval_min` | 1 a 60 | `slow_below_v` | 1,8 a 4,2 |
| `wind_window_s` | 2 a 30 | `slow_factor` | 1 a 12 |
| `gust_window_s` | 1 a 10 | `critical_v` | 1,5 a 4,0 |
| `samples` | 1 a 32 | `charge_above_v` | 0 a 5 (0 desliga) |
| `wifi_timeout_s` | 4 a 30 | `charge_interval_min` | 1 a 60 |
| `mm_per_tip` | 0,01 a 5 | `send_every` | 1 a 12 |
| `k_wind` | 0,05 a 3 | `continuous_wind` | 0 ou 1 |
| `dir_offset` | 0 a 359,99 | `urgent_gust_kmh` | 0 a 200 |
| `battery_mah` | 100 a 100000 | `bench_min` | 0 a 30 (minutos do modo bancada; 0 desliga) |
| `battery_chem` | `li`, `lfp`, `lipo`, `aa` | `wifi_tx_save` | 0 ou 1 (reduz a potência do Wi-Fi quando o sinal é bom) |

## Login com Google, papéis e donos

O site entra com o Google (Google Identity Services). O navegador manda o ID token para `POST /api/auth/google` (`{"credential": "..."}`); o Worker confere a assinatura RS256 com as chaves públicas do Google, o `aud` (o Client ID, em `GOOGLE_CLIENT_ID` no `wrangler.toml`), a validade e o e-mail verificado, e devolve um cookie de sessão assinado (`sess`, HttpOnly, SameSite=Lax, 30 dias).

| Rota | O que faz |
|---|---|
| `GET /api/auth/config` | `{"clientId": ...}` para o botão de login. |
| `GET /api/auth/me` | `{"user": {email, name, picture, role}}`, ou `{"user": null}`. |
| `POST /api/auth/google` | Entra. Recusa token vencido, de outro cliente, sem e-mail verificado, com assinatura errada ou vindo de outra origem. |
| `POST /api/auth/logout` | Apaga o cookie. |

**Papéis.** `admin` (e-mails de `ADMIN_EMAILS` no `wrangler.toml`, ou promovidos por outro administrador) e `user`. O token de administrador antigo (HMAC) continua valendo para scripts e conta como administrador.

**Quem pode o quê.** O papel vem do login: o site identifica sozinho se a conta é administradora ou usuária e libera o acesso correspondente.

| | Visitante | Usuário | Administrador |
|---|---|---|---|
| Ver mapa, leituras e gráficos | sim | sim | sim |
| Alterar os ajustes (nome, local, configuração) das estações **dele** | não | sim | todas |
| Cadastrar dispositivos (estações) | não | não | sim |
| Remover estação, trocar chave, código de pareamento | não | não | sim |
| Placas USB, gravar firmware (pelo site e pelo ar) | não | não | sim |
| Telegram, banco, usuários, token, auditoria | não | não | sim |

O administrador cadastra a estação e pode já indicar o **dono** (`owner_email`), a conta que vai ajustá-la. Estação sem dono é só dos administradores. A lista pública de estações traz `can_edit` para quem está logado, e `owner_email` só para administradores.

## Administração (`/api/admin/*`, só administradores)

| Rota | O que faz |
|---|---|
| `GET /overview` | Todas as estações com dono, firmware, versão de configuração (pedida × aplicada), bateria e sinal. |
| `POST /config` | `{"ids": "all" ou [..], "config": {...}}`: aplica só os campos enviados em várias estações (cada uma soma 1 à versão). |
| `GET`/`PUT /defaults` | Configuração padrão das estações novas. |
| `GET`/`POST /releases`, `DELETE /releases/:id` | Versões de firmware (`POST` com o binário no corpo e `?version=&notes=`). Uma cópia serve para várias estações. |
| `POST /releases/:id/assign`, `POST /releases/unassign` | Atribui a versão a estações (`{"ids": ...}`) ou retira. |
| `GET /rollout` | Resultado em cada estação: `ok` (já informa a versão nova), `falhou` (evento `ota_fail` depois de atribuir, com a etapa) ou `aguardando`. |
| `GET /users`, `POST /users`, `PUT`/`DELETE /users/:email` | Usuários; `POST {"email"}` adiciona um administrador antes de ele entrar; papel e remoção (as estações ficam sem dono). |
| `POST /stations/:id/restart`, `DELETE /stations/:id/command` | Pede que a estação reinicie (ela recebe no próximo envio, no campo `cmd` da resposta) ou cancela o pedido. A confirmação é o reinício dela: o envio seguinte traz um evento `boot` depois da entrega. O painel mostra pedido, entregue e confirmado. |
| `DELETE /stations/:id/events` | Apaga os eventos da estação (zera o diagnóstico de reinícios). |
| `PUT /stations/:id/owner` | Transfere a estação (`{"email": ...}`; vazio = sem dono). |
| `POST /token/rotate`, `DELETE /token` | Troca o token de administrador (mostrado uma vez) ou volta ao segredo `ADMIN_TOKEN` do Worker. |
| `POST /sessions/revoke` | Encerra todas as sessões. |
| `GET /audit` | Registro de quem fez o quê. |

Para bancos criados antes do login, rode uma vez `migrations/0002_usuarios_e_firmware.sql`.

## Telegram por usuário

Cada usuário configura o **seu** bot e chat para as estações **dele**: `GET`/`PUT /api/me/telegram`, `POST /api/me/telegram/test` e `/detect-chat` (mesmo formato do Telegram do servidor, em `/api/settings/telegram`, que continua só do administrador). A lista de estações monitoradas é limitada às do usuário. Ao avisar, o servidor usa o Telegram do dono da estação, se estiver ligado e completo; senão, o do administrador.

## Confirmação de que a alteração chegou à estação

- **Configuração:** a estação informa a versão que tem a cada envio (`cfg`). `cfg_applied` é a versão confirmada e `cfg_applied_at` a hora da confirmação; enquanto `config.version` for maior, está pendente.
- **Firmware:** `GET /api/admin/rollout` mostra por estação se atualizou, falhou (e em que etapa) ou aguarda.
- **Reinício:** `command` (`name`, `at`, `sent`, `done`) na estação, para quem pode alterá-la.

## Tempo real (WebSocket)

`GET /api/live` abre um WebSocket (sem autenticação, só leitura). Sempre que uma estação envia, ou é criada, alterada ou removida, o servidor manda a todos os conectados um aviso curto:

```json
{"t":"update","id":"usina","ts":1792355899000}
```

O `ts` é a hora do servidor em ms (o site a usa para corrigir o relógio das idades sem gastar requisição). O aviso não traz dados: o site então busca o que mudou pelas rotas normais (`/api/stations`, `/readings`, `/events`). O cliente pode mandar o texto `ping` e recebe `pong` (respondido pela plataforma, sem acordar o objeto). Quem implementa o Durable Object é [`worker/src/hub.ts`](../worker/src/hub.ts), com a API de hibernação: conexões paradas não gastam tempo de execução. O limite é de 200 conexões simultâneas.

No plano gratuito da Cloudflare, cada 20 mensagens do WebSocket contam como 1 requisição (limite de 100 mil por dia). Em *Administração → Site e placas → Atualização dos dados* o site escolhe entre tempo real e consulta periódica e define a consulta de segurança (padrão 60 s) que cobre uma conexão que caia sem aviso.

## Pareamento por código

Para instalar uma estação sem copiar a chave: o administrador gera um código e quem instala o digita no portal da placa.

| Método e rota | Auth | Descrição |
|---|---|---|
| `POST /api/stations/:id/claim` | admin | Devolve `{ "code": "K7F-29Q", "expires_at": ... }`. Vale 24 h e uma vez; gerar outro cancela o anterior. |
| `POST /api/claim` | pública | Corpo `{ "code": "K7F-29Q" }`. Devolve `{ "id", "name", "key" }` e **gera uma chave nova** para a estação (a anterior deixa de valer). |

O servidor guarda só o SHA-256 do código. O alfabeto não tem 0, O, 1, I nem L, e o código aceita minúsculas, espaço ou hífen. Como a rota é pública, **depois de 20 códigos errados em 10 minutos ela responde `429`** para todo mundo (contador global, para ninguém adivinhar códigos). Use sempre HTTPS: a chave viaja na resposta.


| Método e rota | Auth | Descrição |
|---|---|---|
| `POST /api/stations/:id/firmware?version=1.2.0` | admin | Corpo: o `.bin` (até 1,6 MB). Guarda em pedaços no D1. |
| `DELETE /api/stations/:id/firmware` | admin | Despublica. |
| `GET /api/ota/firmware.bin` | estação | Baixa o firmware publicado para ela. Cabeçalhos `X-Sha256` e `X-Version`. |

A estação só atualiza depois de enviar leituras com sucesso, só se a versão publicada for **diferente** da instalada, e confere tamanho e SHA-256. **Não há reversão automática** se o firmware novo travar logo ao iniciar: teste antes numa estação de bancada.

## Alertas no Telegram

| Método e rota | Auth | Descrição |
|---|---|---|
| `GET /api/settings/telegram` | admin | Configuração. O token do bot **nunca** é devolvido (`tokenSet: true/false`). |
| `PUT /api/settings/telegram` | admin | Atualiza `token`, `chatId`, `enabled`, `stations`, `rules` e `templates`. |
| `POST /api/telegram/test` | admin | `{ "kind": "gust" }` envia uma mensagem de teste daquele tipo. |
| `POST /api/telegram/detect-chat` | admin | `{ "token": "..." }` acha o ID da conversa a partir da última mensagem mandada ao bot. |

Regras: `offline`, `online`, `lowBattery`, `batteryOk`, `gust`, `rainStart`, `rainStop`. O aviso sai **uma vez, quando o nível muda** (ok → offline, ok → bateria baixa...), e só volta a sair depois que o nível voltar. O novo nível é gravado antes do envio; se o Telegram falhar, o nível volta e o próximo ciclo tenta de novo. A bateria tem histerese de 5 pontos percentuais e a rajada só rearma abaixo de 80% do limite.

O cron (`*/5 * * * *`, em [wrangler.toml](../worker/wrangler.toml)) confere estações sem dados. Os avisos de rajada, bateria e chuva saem logo após cada envio.

## Outros

| Método e rota | Auth | Descrição |
|---|---|---|
| `GET /api/usage` | admin | Leituras, eventos, bytes aproximados e período por estação (para acompanhar o limite do plano). |

## Erros

| Código | Quando |
|---|---|
| 400 | JSON inválido |
| 403 | código de pareamento inválido ou expirado |
| 429 | muitas tentativas de pareamento |
| 401 | credencial ausente ou errada, assinatura inválida, pedido de administrador fora da janela de 2 minutos, ou nonce velho (`{"error":"nonce"}`) |
| 404 | estação ou rota inexistente |
| 409 | `id` já existe |
| 422 | campo ausente, fora da faixa ou lote com tamanho inválido |

## Limites e segurança

- **Não há limite de requisições.** Em produção, crie uma regra de rate limit da Cloudflare para `/api/ingest`.
- Há **um único administrador** (o token). Não existem contas de usuário.
- Leituras com mais de 400 dias e eventos com mais de 120 dias são apagados aleatoriamente em ~1% das gravações.
- Comparação de segredos em tempo constante; a chave nunca é gravada em claro, e o token do bot do Telegram nunca volta ao navegador.
- O D1 guarda o token do bot em texto. Quem tem acesso ao banco tem o bot.

## Testar

```bash
cd worker
cp .dev.vars.example .dev.vars           # ADMIN_TOKEN e TELEGRAM_API (o teste liga um Telegram falso)
npm run db:reset-local && npm run seed:local   # 6 estações com 7 dias de dados (chaves: dev-key-<id>)
npm run dev                              # em outro terminal (já usa --test-scheduled)
npm run smoke                            # 53 verificações; precisa de banco limpo a cada rodada
```
