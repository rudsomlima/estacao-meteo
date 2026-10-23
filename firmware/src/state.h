#pragma once
// Estado do ciclo de medição. Fica na memória RTC: sobrevive ao deep sleep (não sobrevive a ESP.restart()).
#include <Arduino.h>
#include <sys/time.h>
#include "config.h"
#include "types.h"

extern Sample rtcBuf[MAX_BATCH];   // lote de leituras esperando envio
extern uint8_t rtcCount;
extern time_t rtcNextDue;
extern uint8_t rtcFails;           // envios seguidos sem Wi-Fi
extern uint8_t rtcSkipped;         // ciclos sem leitura (sensor ausente) desde o último envio: contam para o sinal de vida
extern uint32_t rtcBootCount;
extern uint8_t rtcLevel;           // 0 normal, 1 economia, 2 crítico
extern bool rtcCharging;

extern bool coldBoot;              // este boot veio de energia ligada (não do deep sleep)
extern bool bootPortal;            // BOOT apertado nos primeiros segundos depois de ligar: abre o portal Wi-Fi
