#pragma once
#include "types.h"

/** Tensão da bateria em volts (média de 16 leituras do ADC, já com o divisor). */
float batteryVolts();

/** BME280 em modo forçado: média de `samples` leituras. */
Env readEnv(uint8_t samples);

/** QMC5883L (GY-273). Fica em standby fora das medições. */
bool qmcStart();
void qmcStop();
bool qmcRead(int16_t &x, int16_t &y);
/** Vetor unitário do campo horizontal já calibrado. false se não houve leitura nova ou o sinal é fraco. */
bool magVector(double &ux, double &uy);

/** Menu serial no boot a frio: 'c' calibra a biruta, 'n' mostra o ângulo do norte. */
void serialTools();
