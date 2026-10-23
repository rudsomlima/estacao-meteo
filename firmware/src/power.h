#pragma once
#include <Arduino.h>

/** Abaixo disto não há célula ligada (pino flutuando ou só a USB). */
constexpr float NO_BATTERY_V = 2.0f;

/** Espera até o próximo ciclo: deep sleep em campo (não volta), acordada com computador plugado. */
void sleepFor(uint32_t seconds, bool rainWake);
/** Atualiza o nível de bateria (normal, economia, crítico) e o estado "carregando", com histerese. */
void updateLevel(float vbat);
/** Segundos até o próximo ciclo, conforme a bateria e o carregamento. */
uint32_t nextInterval();
