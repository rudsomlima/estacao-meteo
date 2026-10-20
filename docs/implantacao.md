# Colocar no ar

O projeto roda inteiro na **Cloudflare**: um Worker serve a API e o site, e o D1 guarda os dados. Há plano gratuito, e este projeto usa pouco, mas confira os limites vigentes no painel da Cloudflare.

## Requisitos

- Node.js 22 ou mais novo
- Conta na Cloudflare
- Python 3 (só para gravar o firmware com PlatformIO)

## Passo a passo

```bash
git clone https://github.com/SEU-USUARIO/estacao-meteo.git
cd estacao-meteo
```

1. **Dependências**

   ```bash
   cd web && npm ci && cd ../worker && npm ci
   ```

2. **Login e banco**

   ```bash
   cd worker
   npx wrangler login
   npx wrangler d1 create estacao-meteo
   ```

   Copie o `database_id` impresso para [worker/wrangler.toml](../worker/wrangler.toml).

3. **Tabelas**

   ```bash
   npm run db:remote
   ```

4. **Senha de administrador** (use um valor longo e aleatório)

   ```bash
   npx wrangler secret put ADMIN_TOKEN
   ```

   O site **assina** cada pedido de administrador com esse valor e nunca o envia; você o digita no navegador (fica só nele). O Telegram é configurado depois, em *Ajustes → Alertas no Telegram* (cada usuário configura o seu bot; o administrador também o do servidor). O cron de 5 minutos (`wrangler.toml`) é criado no deploy.

5. **Publicar** (compila o site e envia o Worker)

   ```bash
   npm run deploy
   ```

   O endereço aparece no final, por exemplo `https://estacao-meteo.SEU-USUARIO.workers.dev`.

6. **Criar a primeira estação** no site: botão **Adicionar estação**. Informe nome, local (clique no mapa), tipo e capacidade da bateria e o token de administrador. A **chave do dispositivo** é mostrada uma vez.

7. **Gravar o ESP32** e fazer o primeiro acesso: veja [firmware.md](firmware.md). Para mandar a placa a outra pessoa instalar, use o **código de pareamento** (seção *Instalar sem computador*).

## Mapa

Por padrão o site usa os tiles públicos do **OpenStreetMap**, escurecidos por filtro. Servem para poucos acessos. Para uso intenso, a política do OSM pede que você use um provedor próprio ou pago.

Para trocar, copie `web/.env.example` para `web/.env`:

```ini
VITE_MAP_TILES=https://api.maptiler.com/maps/dataviz-dark/256/{z}/{x}/{y}.png?key=SUA_CHAVE
VITE_MAP_TILES_DARK=1
VITE_MAP_ATTRIBUTION=© MapTiler © OpenStreetMap contributors
```

e rode `npm run deploy` de novo. Lembre que a chave de tiles fica visível no navegador, então restrinja-a ao seu domínio no painel do provedor.

## Domínio próprio

No painel da Cloudflare: *Workers e Pages → seu Worker → Configurações → Domínios e rotas*. Depois atualize o endereço do site no portal Wi-Fi das estações (ou na configuração, se você implementar essa troca).

## Acesso privado

Os endpoints `GET` são públicos. Se a rede de estações é privada, proteja o site inteiro com o **Cloudflare Access**. O ESP32 envia com `X-Device-Key` e não passa por login, então deixe `/api/ingest` fora da regra do Access.

## Backup

```bash
cd worker
npx wrangler d1 export estacao-meteo --remote --output backup.sql
```

Agende isso com GitHub Actions ou cron na sua máquina. O D1 guarda cópias temporais, mas um export seu é mais seguro.

## Atualizar

```bash
git pull
cd worker && npm ci && npm run deploy
```

Mudanças no esquema do banco ficam em `worker/schema.sql`. Para uma instalação existente, aplique as alterações à mão com `wrangler d1 execute`.

## Desenvolvimento local

```bash
# terminal 1: API local com 6 estações de exemplo
cd worker && npm run db:local && npm run seed:local && npm run dev
# terminal 2: interface com recarga rápida (encaminha /api para a porta 8787)
cd web && npm run dev
```

Sem a API, o site entra em **modo demonstração** com 8 estações simuladas. O token de administrador local é `admin-troque` (em `worker/.dev.vars`). **Troque-o** se algum dia expor essa instância.

## Custos e limites

**Login com Google:** o Client ID fica em `GOOGLE_CLIENT_ID` e os administradores em `ADMIN_EMAILS` (ambos em `[vars]` do `wrangler.toml`). No Google Cloud Console, em *Credenciais*, abra o cliente OAuth e acrescente a URL do site (por exemplo `https://estacao-meteo.SEU-USUARIO.workers.dev`) e, para testar localmente, `http://localhost:5173`, em **Origens JavaScript autorizadas**. Sem isso o botão mostra "origin_mismatch". Para atualizar um banco já existente, rode a migração `migrations/0002_usuarios_e_firmware.sql`.

**Tempo real:** o site recebe avisos por WebSocket (`/api/live`), que usa um Durable Object com SQLite, disponível no plano gratuito. O `wrangler deploy` cria o objeto sozinho (a migração está no `wrangler.toml`). Sem tempo real, escolha *Consulta periódica* em *Administração → Site e placas → Atualização dos dados*; cada aba aberta consultando a cada 5 s gasta cerca de 17 mil requisições por dia por consulta, contra 100 mil do plano gratuito.

Confira a tabela de preços e os limites do Workers e do D1 no site da Cloudflare, porque eles mudam. Para uma rede pequena (algumas estações enviando a cada 30 min) o consumo fica muito abaixo de qualquer limite razoável, mas verifique antes de escalar.
