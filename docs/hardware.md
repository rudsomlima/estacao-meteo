# Hardware

Tudo o que é preciso para montar uma estação: lista de materiais, ligações, alimentação e cuidados de instalação.

> **Aviso:** o firmware compila, a API e o site foram testados e a estação já foi **ligada numa placa real** (gravação, configuração pela USB e envio de leituras), mas **o consumo e a eletrônica de campo ainda não foram medidos em bancada**. Confira cada ligação com um multímetro antes de ligar a bateria e relate o que encontrar (veja [CONTRIBUTING](../CONTRIBUTING.md)).

![Diagrama de ligação](img/ligacao.svg)

> O diagrama mostra o BME280. Para o MS5611 (GY-63), veja [Módulos I²C](#módulos-i²c-endereços-e-ligação): a ligação é a mesma, mudam só o módulo e o endereço.

## Lista de materiais

| Qtde | Item | Observações |
|---|---|---|
| 1 | **ESP32-C3** (módulo nu ou placa SuperMini) | Placas de desenvolvimento têm LED e regulador que gastam centenas de µA em sono. Para campo, remova o LED de energia ou use o módulo nu. |
| 1 | **BME280** (temperatura, umidade, pressão) | Módulo de 3,3 V. Confira se é BME280 mesmo, e não BMP280, que não mede umidade. Endereço 0x76 (SDO em GND) ou 0x77. |
| 0 ou 1 | **GY-63 com MS5611** (pressão e temperatura) | Opcional: no lugar do BME280 (se não precisar de umidade) ou junto com ele, para uma pressão mais precisa. Veja [Escolha do sensor de ambiente](#escolha-do-sensor-de-ambiente). |
| 1 | **GY-273 com QMC5883L** (direção) | Endereço I²C **0x0D**. Alguns GY-273 vêm com HMC5883L (0x1E), que **não** funciona com este firmware. |
| 1 | **Sensor Hall do anemômetro** | Ver [escolha do Hall](#escolha-do-sensor-hall). |
| 1 | **Sensor Hall do pluviômetro** | Mesmo tipo do anemômetro. |
| 2 a 3 | Ímãs de neodímio | Medidas em [adaptacao_sensores_v2/README.md](../adaptacao_sensores_v2/README.md) (5×2 mm na biruta, 4×1 mm no rotor). Para a chuva, um ímã na báscula ou na boia. |
| 2 | Resistor de 1 MΩ | Divisor da bateria. |
| 2 | Resistor de 1 MΩ (ou 10 kΩ) | Pull-up dos Halls. Veja a tabela abaixo. |
| 1 | Capacitor de 100 nF | Filtro do ADC da bateria. |
| 1 | Capacitor de 470 µF | Perto do ESP32, para os picos do Wi-Fi. |
| 1 | **Bateria** | Li-ion 18650, LiFePO4, LiPo 1S ou 2× AA. Veja [Alimentação](#alimentação). |
| 1 | Painel solar de 5 a 6 V, 1 a 2 W | Opcional, mas recomendado. |
| 1 | Carregador de bateria com proteção | Compatível com a química escolhida. |
| 1 | Regulador de 3,3 V | Pico ≥ 500 mA e corrente quiescente baixa. |
| — | Rolamentos 627ZZ ×2, parafusos M4 ×3, epóxi, fita Kapton | Para a parte mecânica do anemômetro e da biruta. |
| — | Abrigo de radiação (tipo Stevenson) | Para o BME280. Pode ser impresso ou comprado. |
| — | Caixa estanque, prensa-cabos, sílica gel | Para a eletrônica. |

### Escolha do sensor Hall

| Sensor | Tensão | Corrente | Pull-up | Quando usar |
|---|---|---|---|---|
| **DRV5032** (omnipolar, SOT-23 ou placa) | 1,65 a 5,5 V | alguns µA | 1 MΩ | **Modo contínuo** e qualquer estação a bateria. |
| **A3144** | 4,5 a 24 V | até 4,4 mA | 10 kΩ | Só para testes ou com alimentação de 5 V. Garantido apenas a partir de 4,5 V, e gasta 4,4 mA o tempo todo, então não serve a uma estação a bateria. |

Se o sensor não disparar, inverta o ímã. O A3144 liga só com polo sul na face marcada. Confira também a variante do DRV5032, porque as de amostragem lenta podem perder pulsos com o rotor girando rápido.

## Pinagem do ESP32-C3

![Pinagem do ESP32-C3 SuperMini](img/pinagem.svg)

Padrão do projeto (o site muda qualquer um deles na página da estação, em *Configurações da estação → Placa e sensores*):

| Sinal | Pino do ESP32-C3 | Vai para |
|---|---|---|
| 3V3 | 3V3 | VCC do BME280, do MS5611, do GY-273 e dos Halls |
| GND | GND | GND de tudo |
| SDA | **GPIO6** | SDA do BME280, do MS5611 e do GY-273 |
| SCL | **GPIO7** | SCL do BME280, do MS5611 e do GY-273 |
| Vento | **GPIO4** | OUT do Hall do anemômetro, com pull-up para 3V3 |
| Chuva | **GPIO3** | OUT do Hall do pluviômetro, com pull-up para 3V3. Acorda do deep sleep. |
| Bateria | **GPIO0** (ADC) | Meio do divisor 1 MΩ + 1 MΩ, com 100 nF para o GND |
| Portal | GPIO9 (BOOT) | Botão da placa. Depois de ligar, aperte por meio segundo nos primeiros 6 s para abrir o portal Wi-Fi. Não segure BOOT durante o reset: isso coloca o ESP32-C3 no modo de gravação. |

Por que esses pinos: só GPIO0 a GPIO5 acordam o ESP32-C3 do deep sleep, GPIO0 a GPIO4 são ADC1 (a leitura da bateria precisa de um deles), e GPIO2, GPIO8 e GPIO9 são pinos de boot. Os módulos I²C já trazem pull-up de 10 kΩ.

### Trocar os pinos

Se a sua placa ou a sua caixa pedem outra fiação, escolha os pinos no site e **ligue os fios do mesmo jeito**. Regras (iguais no site, no servidor e no firmware):

| Função | Pinos aceitos | Motivo |
|---|---|---|
| Chuva | GPIO0 a 5 | Precisa acordar o chip do deep sleep. |
| Bateria | GPIO0 a 4 | Precisa ser entrada analógica do ADC1 (o ADC2 não é usado). |
| SDA, SCL, vento | GPIO0 a 7, 10, 20, 21 | Qualquer um livre. |
| Nenhuma | GPIO8, 9, 11 a 19 | 8 e 9 são de boot, 11 a 17 da memória flash, 18 e 19 da USB. |

Duas funções não podem usar o mesmo pino. Ao receber uma mudança de pino a placa reinicia sozinha, e só depois a medição passa a usar os pinos novos. Exemplo para liberar o GPIO6 e o GPIO7 (por exemplo, para outro uso na placa): SDA no GPIO5 e SCL no GPIO10. Nesse caso o pluviômetro continua no GPIO3 e o anemômetro no GPIO4.

## Escolha do sensor de ambiente

Na página da estação, em *Configurações da estação → Placa e sensores → Sensor de ambiente*:

| Opção | Mede | Quando usar |
|---|---|---|
| **BME280** (padrão) | temperatura, umidade, pressão | Uso geral. Um módulo só. |
| **MS5611 (GY-63)** | temperatura, pressão (resolução de cerca de 0,012 hPa) | Quando a umidade não interessa, ou para variação de pressão e altitude com mais precisão. O site mostra "—" na umidade. |
| **BME280 + MS5611** | umidade e temperatura do BME280, pressão do MS5611 | O melhor dos dois. Cada módulo num endereço diferente. |
| **Nenhum** | nada | Placa de bancada ou sem sensor: só manda o sinal de vida (bateria e Wi-Fi). |

## Módulos I²C: endereços e ligação

![Ligação dos módulos de ambiente](img/ligacao-i2c.svg)

Os três módulos usam os mesmos quatro fios (3V3, GND, SDA, SCL) e se distinguem pelo **endereço I²C**:

| Módulo | Chip | Endereço | Como escolher |
|---|---|---|---|
| BME280 | Bosch BME280 | **0x76** ou 0x77 | SDO no GND = 0x76; SDO no 3V3 = 0x77. CSB no 3V3 (modo I²C). |
| GY-63 | MS5611 | **0x77** ou 0x76 | CSB no GND = 0x77; CSB no 3V3 = 0x76. PS no 3V3 (modo I²C). SDO solto. |
| GY-273 | QMC5883L | **0x0D** (fixo) | Não muda. DRDY solto. |

### Passo a passo do GY-63 (MS5611)

1. Desligue a alimentação. Ligue **VCC** ao 3V3 do ESP32 (o módulo aceita 3 a 5 V, mas use 3,3 V para casar com o nível lógico do ESP32).
2. **GND** ao GND.
3. **SCL** ao pino SCL do ESP32 (GPIO7 no padrão) e **SDA** ao pino SDA (GPIO6).
4. Confira os jumpers do módulo: **PS** em nível alto (3V3) para o modo I²C (a maioria dos GY-63 já vem assim) e **CSB** em GND para o endereço 0x77. Deixe **SDO** sem ligar.
5. No site, em *Configurações da estação → Placa e sensores*, escolha **MS5611 (GY-63)** (ou **BME280 + MS5611**, se os dois estiverem ligados) e salve.
6. Na próxima conexão, a placa recebe a configuração. Na página da estação a pressão e a temperatura aparecem no envio seguinte. Se não aparecer, veja a [solução de problemas](solucao-de-problemas.md#leituras-estranhas).

### Os dois juntos (BME280 + MS5611)

- O BME280 em **0x76** (SDO no GND) e o MS5611 em **0x77** (CSB no GND). Nunca os dois no mesmo endereço.
- Dois ou três módulos com pull-up de 10 kΩ cada em paralelo dão um pull-up equivalente de uns 3 kΩ, que está dentro do que o I²C a 100 kHz aceita. Se usar cabos longos (mais de 30 cm) ou mais módulos, remova os resistores de pull-up de alguns módulos, ou diminua o comprimento do cabo.
- Mantenha os fios do barramento curtos e longe de cabos de potência. Um cabo de 4 fios trançado em pares (SDA com GND, SCL com GND) reduz ruído.

### Cuidados com o MS5611

- É **sensível à luz**: o furo do sensor expõe o gel. Deixe-o dentro do abrigo de radiação, sem luz direta, como o BME280.
- Não é à prova d'água: proteja da chuva e da condensação (ventilação sem respingo).
- A leitura é a do **nível da estação**, como a do BME280, e não é convertida para o nível do mar.
- Não mede umidade. Com "MS5611" sozinho, o ponto de orvalho e a sensação térmica não aparecem no site.

## Ligações da estação inteira

![Diagrama de ligação](img/ligacao.svg)

### Divisor da bateria

```
BAT+ ──[ 1 MΩ ]──┬──[ 1 MΩ ]── GND
                 ├── GPIO0
                 └──[ 100 nF ]── GND
```

A relação é 2,0 (`VBAT_DIV`). Com 1 MΩ o divisor consome 2 µA, o que importa em deep sleep. A tensão do divisor tem que ficar abaixo de ~3,1 V no ADC: para 4,2 V de bateria cheia dá 2,1 V, sem problema. Para tensões maiores, troque os resistores e o `VBAT_DIV`.

## Alimentação

![Perfis de consumo](img/energia.svg)

| Química | Faixa | Observações |
|---|---|---|
| **Li-ion 18650** | 3,0 a 4,2 V | A mais comum. Use célula com proteção. Evite carregar abaixo de 0 °C. |
| **LiFePO4** | 2,8 a 3,6 V | Melhor para locais frios e quentes. Precisa de carregador próprio para LiFePO4. |
| **LiPo 1S** | 3,3 a 4,2 V | Leve, mas sensível ao calor. |
| **2× AA alcalina** | 2,0 a 3,2 V | Sem painel solar. O regulador precisa funcionar bem abaixo de 3,3 V, ou alimente o ESP32 direto. |

- **Tipo e capacidade** são escolhidos por estação no site. Isso define a curva de % da bateria e a autonomia estimada.
- **O carregador tem que ser da química da bateria.** Carregador de Li-ion em célula LiFePO4 é perigoso.
- **Regulador:** escolha um de corrente quiescente baixa. O Wi-Fi chega a ~350 mA de pico, então confira a corrente máxima da peça. Reguladores minúsculos de poucos µA costumam ser limitados a 150 ou 250 mA, e nesse caso o capacitor de 470 µF é obrigatório. Alternativa: conversor buck de baixíssima corrente quiescente.
- **Consumo:** veja [energia.md](energia.md) para os perfis, as estimativas e como medir.

## Pluviômetro

A estação conta **uma basculada por pulso**. O volume por basculada vem do funil: `mm por basculada = volume (mL) ÷ área do funil (cm²) × 10`. Meça despejando um volume conhecido e contando as basculadas, e informe o resultado em *Chuva por basculada* na configuração do site. Detalhes em [calibracao.md](calibracao.md).

## Montagem mecânica

A parte do vento usa o **Windicator V2.0 Compact** adaptado, com um ímã na biruta (lido pelo QMC5883L) e um ímã no rotor (lido pelo Hall). Todo o projeto de CAD, a montagem e a calibração estão em [adaptacao_sensores_v2/README.md](../adaptacao_sensores_v2/README.md). Veja também [THIRD_PARTY.md](../THIRD_PARTY.md) sobre a licença das peças.

## Instalação

- **Altura:** o padrão da OMM é 10 m, em terreno aberto. Em instalações domésticas, quanto mais alto e mais livre de obstáculos, melhor. Em telhados, afaste dos beirais e das chaminés.
- **Temperatura e umidade:** o BME280 vai **fora da caixa**, dentro do abrigo de radiação, longe de paredes e do calor da eletrônica. Sol direto no sensor dá leitura errada.
- **Pressão:** a leitura é a do **nível da estação**. Não é convertida para o nível do mar.
- **Norte:** alinhe o indicador N da biruta ao norte geográfico. A calibração fina é por software.
- **Água:** use prensa-cabos, deixe os cabos fazerem uma curva para baixo antes de entrar na caixa, e coloque sílica gel. Teste a vedação antes de subir o mastro.
- **Raios:** em locais expostos, aterre o mastro e considere protetores de surto.

## Próximos testes de bancada

Estas medições faltam e são o melhor jeito de contribuir:

1. Corrente de deep sleep com a sua placa (alvo ≤ 20 µA).
2. Corrente média no modo janela e no modo contínuo.
3. Ângulo medido pelo QMC5883L em 360° com a biruta montada (ver calibração).
4. Pulsos falsos do Hall do anemômetro causados pelo ímã da biruta.
5. Alcance do Wi-Fi na posição real da estação.
