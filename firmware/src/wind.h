#pragma once
#include "types.h"

/** Pulsos da chuva ainda não convertidos em leitura. Fica na memória RTC e sobrevive ao deep sleep. */
extern volatile uint32_t rtcRainTips;
extern float rtcLastDir;

/** Liga a interrupção do pluviômetro (para quando a CPU está acordada, por exemplo durante o Wi-Fi). */
void rainAttach();
void rainDetach();
/** Lê e zera as basculadas acumuladas. */
uint32_t takeRainTips();

/**
 * Mede o vento por `seconds` segundos em light sleep: a CPU só acorda a cada pulso do Hall e a cada tick de 1 s.
 * Devolve a velocidade média, a rajada (maior média de `cfg.gustWindowS` s dentro da janela) e a direção
 * por média vetorial. Também conta as basculadas de chuva que ocorrerem nesse tempo.
 */
WindResult windMeasure(uint16_t seconds);
