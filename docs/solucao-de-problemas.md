# Solução de problemas

## A estação não aparece no site

| Sintoma | O que verificar |
|---|---|
| Nunca enviou leitura | Chave do dispositivo errada ou digitada com espaço. Gere outra em *Configuração → Gerar chave nova* e refaça o portal (segure BOOT ao ligar). |
| O portal `EstacaoMeteo-XXXX` não aparece | A estação já tem Wi-Fi salvo. Segure **BOOT** ao ligar para forçar o portal. |
| Conecta ao Wi-Fi mas não envia | Endereço do site errado (precisa de `https://` e sem barra no final) ou o Worker fora do ar. Veja o log serial: `POST 401` é chave errada, `POST 422` é campo fora da faixa, `POST -1` é falha de conexão ou de TLS. |
| Aparece como "atrasada" | Já passou de 2,5 intervalos sem leitura. Com envio em lote, o intervalo efetivo é `intervalo × enviar a cada`. Ajuste ou aguarde o próximo envio. |
| Aparece como "sem sinal" no mapa | Mesmo critério acima. Cheque Wi-Fi e bateria. |

## Leituras estranhas

| Sintoma | Causa provável |
|---|---|
| Temperatura 5 °C acima do real | Sensor perto da caixa ou no sol. Mova para o abrigo. |
| Umidade sempre 0% ou sem BME280 | O módulo é BMP280 (sem umidade) ou o endereço não é 0x76/0x77. |
| Direção sempre igual | O QMC5883L não respondeu: o firmware repete a última direção. Confira SDA/SCL e se o módulo é QMC (0x0D) e não HMC. |
| Direção espelhada | `DIR_SIGN` precisa ser `-1`. |
| Direção errada em 90° | Falta o ajuste do norte. Veja [calibracao.md](calibracao.md). |
| Vento com o ar parado | Pulso falso do Hall. Veja [calibracao.md](calibracao.md#2-velocidade-do-vento). |
| Vento sempre 0 | Hall invertido (ímã com a polaridade errada) ou sem pull-up. |
| Chuva sem chover | Repique do Hall ou vibração da báscula. O firmware filtra 80 ms. Se continuar, aumente o filtro em [wind.cpp](../firmware/src/wind.cpp). |
| Chuva a menos | Funil entupido ou `mm_per_tip` errado. |
| Bateria com % errada | O tipo ou o divisor estão errados. Confira em *Configuração → Bateria* e meça a tensão com um multímetro. |
| Pressão muito diferente da previsão | A estação mede a pressão no **nível dela**, não no do mar. |

## Consumo alto

1. Meça. Veja [energia.md](energia.md#como-medir-de-verdade).
2. Placa de desenvolvimento com LED e regulador comum: **centenas de µA em sono**.
3. A3144 ligado direto no modo contínuo: **4,4 mA**.
4. Pull-up de 10 kΩ no Hall com DRV5032, ou divisor de bateria de 10 kΩ.
5. Ambiente `esp32c3` (USB CDC ligado) em campo: use `esp32c3-lowpower`.

## Firmware

| Sintoma | O que fazer |
|---|---|
| Reinicia em loop | Queda de tensão no Wi-Fi: adicione 470 µF e confira o regulador (pico de ~350 mA). |
| Não entra no monitor serial | Use `esp32c3` (USB CDC ligado) e mantenha o cabo conectado ao acordar. No ambiente `lowpower` a serial USB não existe. |
| `pio run` falha ao baixar pacotes | Primeira compilação baixa ~500 MB de toolchain. Tente de novo com boa conexão. |
| Mudei o modo de vento no site e nada mudou | A estação só aplica a configuração quando envia. Com envio em lote isso pode levar `intervalo × enviar a cada` minutos. Para testar, ponha *Enviar a cada* em 1. |

## Site e API

| Sintoma | O que fazer |
|---|---|
| Etiqueta "demonstração" | A API não respondeu. Em desenvolvimento, rode o Worker (`npm run dev` na pasta `worker`). |
| Mapa sem fundo | O provedor de tiles bloqueou ou exige chave. Veja [implantacao.md](implantacao.md#mapa). |
| `Token de administrador incorreto` | O segredo `ADMIN_TOKEN` do Worker é outro. Redefina com `wrangler secret put ADMIN_TOKEN`. |
| `wrangler dev` trava ou fica sem resposta (Windows) | Há processos antigos presos. Feche todos os `workerd`/`node` do wrangler, apague `worker/.wrangler` e suba de novo. Pastas do OneDrive podem prender arquivos do banco local. |

Não achou? Abra uma issue com o log serial (se for do firmware) e o que você já tentou.
