# Estação Meteo

[![CI](https://github.com/SEU-USUARIO/estacao-meteo/actions/workflows/ci.yml/badge.svg)](https://github.com/SEU-USUARIO/estacao-meteo/actions/workflows/ci.yml)
[![Licença: MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue.svg)](LICENSE)

Estação meteorológica **de baixo consumo com ESP32-C3**, feita para rodar a bateria e painel solar, com um site que mostra uma **rede de estações num mapa**. Mede vento (velocidade, rajada e direção), temperatura, umidade, pressão, chuva e a tensão da bateria.

[English summary](README.en.md)

![Mapa da rede de estações](docs/img/captura-mapa.png)

> **Estado do projeto:** o firmware compila, a API tem testes automatizados e o site foi conferido no navegador, mas **a eletrônica e o consumo ainda não foram validados em bancada**. Os números de energia são estimativas. Veja [o que falta testar](docs/hardware.md#próximos-testes-de-bancada) e ajude relatando o que você medir.

## O que tem

- **Mapa com várias estações.** Partículas de vento interpoladas entre as estações, pinos com resumo (vento, temperatura, chuva ou bateria), painel de detalhes e tabela da rede.
- **Página da estação** com uma figura animada do equipamento: cada medidor se move com o dado dele (copos, veleta, chuva, painel solar, envio do datalogger) e tem a legenda com o valor ao vivo. Funciona no celular.
- **Gráficos** de 6 h, 24 h e 7 dias, rosa dos ventos e tendências.
- **Energia e telemetria:** tensão, sinal do Wi-Fi, ciclo de sono e **autonomia estimada** que se atualiza enquanto você mexe na configuração.
- **Configuração remota:** a estação baixa a configuração a cada envio. Bateria definida por estação (Li-ion, LiFePO4, LiPo ou 2× AA, com capacidade).
- **Estado da configuração:** o site mostra se a estação já aplicou a versão salva (pendente → aplicada).
- **Diagnóstico:** reinícios fora do sono de rotina, atualizações de firmware e modo bancada aparecem no site.
- **Alertas no Telegram:** estação sem dados, bateria baixa, rajada forte e chuva, com mensagens editáveis. Avisa uma vez quando o estado muda, não a cada leitura.
- **Análises:** compare até 3 estações e veja o resumo mensal com calendário por temperatura.
- **Ajustes do site:** unidades (km/h, m/s, nós, mph; °C/°F; mm/pol; hPa/inHg/mmHg), estações favoritas, mapa em tela cheia, exportar CSV e salvar/restaurar ajustes.
- **Gravação do firmware pelo navegador:** o site grava a placa pelo cabo USB (Web Serial), sem PlatformIO nem driver.
- **Instalação remota por código:** o site gera um código de pareamento; quem instala só escolhe o Wi-Fi no celular e digita o código, sem copiar chave nem usar computador.
- **Reconhecimento por USB:** ao plugar o ESP32, o site (Chrome/Edge) o reconhece, diz qual estação é e grava Wi-Fi, endereço e chave sem digitar no portal.
- **Atualização de firmware pelo ar (OTA)** publicada pelo site, com conferência de SHA-256.
- **Modo bancada:** ao ligar, a estação abre por alguns minutos (configurável) uma página local para ver os sensores e calibrar a biruta sem cabo serial.
- **Pedidos assinados:** o token do administrador nunca viaja (HMAC com janela de 2 minutos), e a estação pode enviar por HTTP assinado em vez de HTTPS.
- **Firmware econômico:** deep sleep, contagem de vento em light sleep, envio em lote, reconexão Wi-Fi rápida, rajada urgente e portal Wi-Fi para o primeiro uso.
- **Dado no padrão dos equipamentos profissionais:** modo contínuo com média, rajada e direção vetorial do período inteiro.

|  |  |
|---|---|
| ![Estação](docs/img/captura-estacao.png) | ![Celular](docs/img/captura-celular.png) |

## Como funciona

![Arquitetura](docs/img/arquitetura.svg)

1. A estação acorda, mede e guarda a leitura num lote.
2. A cada N leituras (ou na hora, se houver rajada forte) liga o Wi-Fi e envia o lote por HTTPS. Cada leitura segue com a idade em segundos.
3. O Worker da Cloudflare guarda no D1, devolve a configuração nova se houver, e serve o site.
4. O navegador mostra o mapa, as páginas das estações e a configuração.

Detalhes em [docs/arquitetura.md](docs/arquitetura.md).

## Começar

### Ver o site sem hardware

```bash
cd web
npm ci
npm run dev
```

Sem API o site entra em **modo demonstração** (a etiqueta no topo avisa) com 8 estações simuladas.

### Rodar com a API local

```bash
cd worker && npm ci
npm run db:local && npm run seed:local    # 6 estações de exemplo com 7 dias de dados
npm run dev                               # API em http://127.0.0.1:8787
```

Em outro terminal, `cd web && npm run dev` (o Vite encaminha `/api` para o Worker).

### Colocar no ar e montar a estação

| Passo | Guia |
|---|---|
| Publicar na Cloudflare (gratuito para uso pequeno) | [docs/implantacao.md](docs/implantacao.md) |
| Lista de materiais e ligações | [docs/hardware.md](docs/hardware.md) |
| Gravar o ESP32 e primeiro acesso | [docs/firmware.md](docs/firmware.md) |
| Calibrar vento, direção e chuva | [docs/calibracao.md](docs/calibracao.md) |
| Entender o consumo e escolher o modo | [docs/energia.md](docs/energia.md) |
| Algo deu errado | [docs/solucao-de-problemas.md](docs/solucao-de-problemas.md) |
| Falar com a API | [docs/api.md](docs/api.md) |

## Ligação

![Diagrama de ligação](docs/img/ligacao.svg)

| Sensor | ESP32-C3 |
|---|---|
| BME280, MS5611 (GY-63) e GY-273 (QMC5883L) | SDA = GPIO6, SCL = GPIO7 (os pinos e o sensor se escolhem no site) |
| Hall do anemômetro | GPIO4 |
| Hall do pluviômetro | GPIO3 (acorda do deep sleep) |
| Bateria | GPIO0, divisor de 2× 1 MΩ |

Pinagem completa, endereços I²C e o passo a passo do MS5611 estão em [docs/hardware.md](docs/hardware.md#pinagem-do-esp32-c3).

## Consumo estimado

| Perfil | Corrente média | Autonomia (3000 mAh) |
|---|---|---|
| Janela, envio a cada 3 leituras (padrão) | ≈ 0,20 mA | ~500 dias na teoria |
| Contínuo, envio a cada 3 leituras | ≈ 0,49 mA | ~205 dias |

Estimativas de folha de dados. Meça na sua placa ([docs/energia.md](docs/energia.md)).

## Estrutura

```
firmware/                ESP32-C3 (PlatformIO)
worker/                  API em Cloudflare Worker + D1 (também serve o site)
web/                     Site: React, Vite, Tailwind v4, motion, Lenis, MapLibre
adaptacao_sensores_v2/   CAD e documentação do anemômetro e da biruta (Windicator adaptado)
docs/                    Documentação e diagramas
```

## Limites conhecidos

- Nada foi validado em hardware real (veja o aviso no topo).
- O A3144 só é garantido a partir de 4,5 V. Em estações a bateria use um Hall de baixa tensão e baixa corrente, como o DRV5032.
- O HTTPS não valida o certificado por padrão (veja [docs/firmware.md](docs/firmware.md#segurança)).
- O campo de vento do mapa é uma interpolação visual entre estações, e não um modelo meteorológico.
- A API não tem limite de requisições nem contas de usuário: há um token de administrador.
- Se um sensor do BME280 falhar, o ciclo não grava a leitura.

## Contribuir

Medições de bancada, correções de documentação e relatos de montagem ajudam muito. Veja [CONTRIBUTING.md](CONTRIBUTING.md).

## Licença e créditos

Código sob licença [MIT](LICENSE). As peças de vento são baseadas no **Windicator V2.0 Compact**, que tem licença própria: veja [THIRD_PARTY.md](THIRD_PARTY.md). Mapas © colaboradores do OpenStreetMap.
