#pragma once
#include <Arduino.h>

/** Uma leitura completa de um ciclo. `t` é o relógio do sistema (segundos), usado para calcular a idade no envio. */
struct Sample {
  uint32_t t;
  float temp, hum, pres;
  float wind, gust, dir;   // m/s, m/s, graus
  float rain;              // mm acumulados desde a leitura anterior
  float vbat;
};

struct Env {
  bool ok;
  float t, h, p;           // h = NAN quando o sensor não mede umidade
};

struct WindResult {
  float avg, gust, dir;    // m/s, m/s, graus (de onde vem)
  bool dirOk;
  uint32_t pulses;
  uint16_t seconds;
};
