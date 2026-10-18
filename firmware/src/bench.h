#pragma once
#include <Arduino.h>

/**
 * Modo bancada: com o Wi-Fi já conectado, abre uma página local (http://estacao-xxxx.local ou o IP da estação)
 * que mostra as leituras ao vivo e calibra a biruta sem cabo serial. Dura `minutes` minutos (ou até o botão
 * "Terminar" da página) e a estação segue a rotina normal depois. A duração vem da configuração (`bench_min`).
 */
void benchRun(uint8_t minutes);
