# Solução de problemas

## A estação não aparece no site

| Sintoma | O que verificar |
|---|---|
| Nunca enviou leitura | Chave do dispositivo errada ou digitada com espaço. Gere outra em *Configuração → Gerar chave nova* e refaça o portal (aperte BOOT nos primeiros 6 s depois de ligar). |
| O portal `EstacaoMeteo-XXXX` não aparece | A estação já tem Wi-Fi salvo. Ligue a placa e, nos primeiros 6 s, aperte **BOOT** por meio segundo para forçar o portal. Segurar o BOOT *ao ligar* não funciona: o ESP32-C3 entra em modo de gravação. Com a placa no computador, use o comando USB `portal`. |
| Conecta ao Wi-Fi mas não envia | Endereço do site errado (precisa de `https://` e sem barra no final) ou o Worker fora do ar. Veja o log serial: `POST 401` é chave errada, `POST 422` é campo fora da faixa, `POST -1` é falha de conexão ou de TLS. |
| Aparece como "atrasada" | Já passou de 2,5 intervalos sem leitura. Com envio em lote, o intervalo efetivo é `intervalo × enviar a cada`. Ajuste ou aguarde o próximo envio. |
| Aparece como "sem sinal" no mapa | Mesmo critério acima. Cheque Wi-Fi e bateria. |
| Configuração fica **pendente** | A estação ainda não enviou depois de você salvar. Ela informa a versão que tem a cada envio; com envio em lote pode levar `intervalo × enviar a cada` minutos. |
| Código de pareamento recusado | Vale 24 h e uma vez, e gerar outro cancela o anterior. Gere um novo e refaça o portal (aperte BOOT nos primeiros 6 s depois de ligar). Depois de 20 erros em 10 min, o servidor bloqueia novas tentativas por um tempo. |
| Pareamento não conclui | Só funciona com endereço `https://`. Veja o log serial: `pareamento: http 403` é código errado, `http -1` é falha de conexão. |
| `POST 401` em modo HTTP | Assinatura inválida: ID da estação ou chave errados no portal, ou o relógio do navegador/servidor muito fora (só vale para o token de administrador). Se a resposta for `nonce`, a estação tenta de novo sozinha. |

## Leituras estranhas

| Sintoma | Causa provável |
|---|---|
| Temperatura 5 °C acima do real | Sensor perto da caixa ou no sol. Mova para o abrigo. |
| Umidade sempre 0% ou sem BME280 | O módulo é BMP280 (sem umidade) ou o endereço não é 0x76/0x77. |
| Umidade aparece como "—" | O sensor escolhido é o MS5611, que não mede umidade. Escolha "BME280" ou "BME280 + MS5611" em *Sensores e pinos*. |
| MS5611 não responde ("sensor de ambiente não respondeu") | Confira em *Sensores e pinos* se a opção é MS5611 (ou BME280 + MS5611); PS do GY-63 em 3V3 e CSB em GND (0x77); SDA e SCL nos pinos configurados; VCC em 3,3 V. Com os dois módulos, confira que estão em 0x76 e 0x77. |
| Mudei os pinos e a estação parou de medir | A fiação precisa estar igual ao que o site mostra. Volte aos pinos padrão (botão em *Sensores e pinos*) ou corrija os fios. O servidor e a placa recusam pino repetido, de boot, da USB ou da flash. |
| Direção sempre igual | O QMC5883L não respondeu: o firmware repete a última direção. Confira SDA/SCL e se o módulo é QMC (0x0D) e não HMC. |
| Direção espelhada | `DIR_SIGN` precisa ser `-1`. |
| Direção errada em 90° | Falta o ajuste do norte. Veja [calibracao.md](calibracao.md). |
| Vento com o ar parado | Pulso falso do Hall. Veja [calibracao.md](calibracao.md#2-velocidade-do-vento). |
| Vento sempre 0 | Hall invertido (ímã com a polaridade errada) ou sem pull-up. |
| Chuva sem chover | Repique do Hall ou vibração da báscula. O firmware filtra 80 ms. Se continuar, aumente o filtro em [wind.cpp](../firmware/src/wind.cpp). |
| Chuva a menos | Funil entupido ou `mm_per_tip` errado. |
| Bateria com % errada | O tipo ou o divisor estão errados. Confira em *Configuração → Bateria* e meça a tensão com um multímetro. |
| Pressão muito diferente da previsão | A estação mede a pressão no **nível dela**, não no do mar. |

## Diagnóstico e alertas

| Sintoma | O que verificar |
|---|---|
| Vários eventos `boot` fora do horário | Queda de tensão (bateria ou regulador), travamento ou watchdog. Veja *Configurações → Diagnóstico* e a tensão ao redor desses horários. |
| Atualização pelo ar não acontece | A estação só atualiza depois de um envio bem-sucedido, com a versão publicada **diferente** da instalada, e com bateria acima da crítica. Veja os eventos `ota_fail` e se `FW_VERSION` mudou antes de compilar. |
| Telegram não avisa | Token do bot ou ID da conversa errados (use *Detectar*; mande antes uma mensagem ao bot), alertas desligados, ou a estação fora da lista monitorada. Use *Testar*. |
| Telegram avisa de novo e de novo | Não deveria: ele avisa na mudança de nível. Se acontecer com bateria, confira se a tensão oscila no limite; a histerese é de 5 pontos percentuais. |
| Modo bancada não abre | Precisa de Wi-Fi já salvo, `bench_min` maior que 0 e o botão BOOT solto nos primeiros segundos. Só abre em boot a frio (ligar a bateria ou o botão RESET). |

## Consumo alto

1. Meça. Veja [energia.md](energia.md#como-medir-de-verdade).
2. Placa de desenvolvimento com LED e regulador comum: **centenas de µA em sono**.
3. A3144 ligado direto no modo contínuo: **4,4 mA**.
4. Pull-up de 10 kΩ no Hall com DRV5032, ou divisor de bateria de 10 kΩ.
5. Cabo USB ligado a um computador: a placa não dorme enquanto ele estiver ali. Tire o cabo (ou use só um carregador).

## Firmware

| Sintoma | O que fazer |
|---|---|
| Reinicia em loop | Queda de tensão no Wi-Fi: adicione 470 µF e confira o regulador (pico de ~350 mA). |
| Não entra no monitor serial | Com o cabo num computador a placa fica acordada e a porta aparece. Se a porta sumiu, a placa estava dormindo sem cabo: plugue-o e aperte RESET. "Acesso negado" é outro programa com a porta (outra aba do site, monitor serial, IDE). |
| `pio run -t upload` diz "port doesn't exist" | O PlatformIO escolheu uma COM de Bluetooth. O `platformio.ini` já escolhe a placa pelo VID; se ainda errar, use `--upload-port COMx`. |
| `pio run` falha ao baixar pacotes | Primeira compilação baixa ~500 MB de toolchain. Tente de novo com boa conexão. |
| A gravação pelo site falha ao conectar | Troque o cabo (precisa ser de dados), feche o monitor serial, a IDE e outras abas do site, e aperte RESET na placa (a gravação recomeça sozinha). Com ponte CH340/CP210x: segure BOOT, aperte RESET, solte o RESET e depois o BOOT. Só Chrome, Edge e Opera têm Web Serial. |
| Gravou pelo site e a placa não liga | Aperte RESET uma vez. As versões antigas do site não reiniciavam a placa ao terminar. |
| Mudei o modo de vento no site e nada mudou | A estação só aplica a configuração quando envia. Com envio em lote isso pode levar `intervalo × enviar a cada` minutos. Para testar, ponha *Enviar a cada* em 1. |

## Site e API

| Sintoma | O que fazer |
|---|---|
| Etiqueta "demonstração" | A API não respondeu. Em desenvolvimento, rode o Worker (`npm run dev` na pasta `worker`). |
| Mapa sem fundo | O provedor de tiles bloqueou ou exige chave. Veja [implantacao.md](implantacao.md#mapa). |
| `Token de administrador incorreto` | O segredo `ADMIN_TOKEN` do Worker é outro, ou o relógio do computador está com mais de 2 minutos de diferença (o pedido é assinado com a hora). Redefina com `wrangler secret put ADMIN_TOKEN`. |
| `wrangler dev` trava ou fica sem resposta (Windows) | Há processos antigos presos. Feche todos os `workerd`/`node` do wrangler, apague `worker/.wrangler` e suba de novo. Pastas do OneDrive podem prender arquivos do banco local. |

Não achou? Abra uma issue com o log serial (se for do firmware) e o que você já tentou.
