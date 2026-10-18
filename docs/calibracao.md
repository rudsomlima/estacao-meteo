# Calibração

Cada estação precisa de quatro ajustes. Faça nesta ordem.

## 1. Direção da biruta

> **Sem cabo:** com Wi-Fi já salvo e `bench_min` maior que 0, a estação abre o **modo bancada** ao ligar. Abra a página local (`http://estacao-xxxx.local` ou o IP do log), toque em *Calibrar a biruta*, gire-a duas vezes, aponte para o norte e toque em *Mostrar o ângulo do norte*. Os passos abaixo valem para o caminho pela porta serial.

O QMC5883L lê o campo do ímã da biruta. O firmware converte em ângulo com `atan2` e usa a média vetorial das amostras.

1. Monte a biruta com o ímã A (5×2 mm, face **S voltada ao eixo**) e ligue a estação ao USB do computador.
2. Abra o monitor serial (`pio device monitor`). Reinicie a placa.
3. Nos 10 s seguintes ao reinício (60 s se a placa ainda não está configurada), envie **`c`**. Gire a biruta 360° devagar, **duas vezes**, durante 20 s. O firmware guarda o centro e a escala do campo.
4. Aponte a biruta para o **norte geográfico** (mesma direção do indicador N). Reinicie e envie **`n`**. Ele mostra um número.
5. No site, em *Configuração → Ajuste do norte da biruta*, digite esse número e salve.
6. Gire a biruta para L, S e O e confira no site se bate. Se estiver **espelhado** (L aparece como O), troque `DIR_SIGN` para `-1` em [config.h](../firmware/src/config.h), regrave e repita.

Se aparecer *Sinal fraco demais*: aproxime o ímã do chip, use um ímã maior, ou mude a faixa para ±8 G (`0x11` no registro `0x09`, em [sensors.cpp](../firmware/src/sensors.cpp)). Rolamentos de aço podem blindar parte do campo.

## 2. Velocidade do vento

A velocidade é `k_wind × (voltas por segundo)`. O `k_wind` inicial (0,42) é uma estimativa. **Calibre.**

**Com um anemômetro de referência:**

1. Coloque os dois lado a lado, em área aberta, num dia com vento moderado.
2. Anote por 10 a 30 min a média dos dois.
3. Novo `k_wind` = antigo × (média da referência ÷ média da estação).

**Sem referência (aproximação):** um carro em velocidade constante, em dia sem vento e em reta, com o anemômetro estendido para fora (a uns 50 cm do carro, longe do fluxo da lataria). Compare a média com o velocímetro (que costuma ter erro de alguns %).

Se a estação mostrar velocidade com o vento calmo, tem pulso falso: o ímã da biruta pode estar acionando o Hall. Teste girando a biruta com o rotor parado. Não pode haver pulsos. Se houver, reduza o ímã A ou afaste o Hall.

Para mais resolução em vento fraco, coloque 2 a 4 ímãs no cubo do rotor e divida o `k_wind` pelo mesmo número.

## 3. Chuva por basculada

1. Despeje devagar um volume conhecido de água no funil (por exemplo, 100 mL) e conte as basculadas até esvaziar.
2. `mm por basculada = (volume em mL ÷ área do funil em cm²) × 10 ÷ basculadas`.

   Exemplo: funil de 100 cm² e 200 mL → 20 mm. Se deu 100 basculadas, cada uma vale 0,2 mm.
3. Digite em *Chuva por basculada do tanque*.

Repita com o dobro do volume para conferir. O funil e o tanque entopem com folhas e insetos, então limpe de tempos em tempos.

## 4. Temperatura e umidade

O BME280 sai de fábrica calibrado, mas o **abrigo** é o que mais importa: sol direto no sensor, ou calor da caixa de eletrônica, dá erro de vários °C. O firmware não tem ajuste de offset. Se precisar, compare com um termômetro de referência por um dia inteiro e corrija no seu lado (por exemplo, no site).

A pressão é a do nível da estação. Para a pressão ao nível do mar, use a fórmula barométrica com a altitude da estação (campo *Altitude* na configuração).
