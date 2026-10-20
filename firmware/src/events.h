#pragma once
#include <Arduino.h>

/** Eventos que a estação conta ao site junto com as leituras: reinícios, falhas de atualização, modo bancada, HTTPS não validado. */
enum EventKind : uint8_t { EV_BOOT = 1, EV_OTA_FAIL = 2, EV_OTA_OK = 3, EV_BENCH = 4, EV_TLS = 5 };

struct Event {
  uint32_t t;      // relógio do sistema, para calcular a idade no envio
  uint8_t kind;
  int32_t a, b;
  char s[24];
};

constexpr uint8_t MAX_EVENTS = 8;

void pushEvent(EventKind kind, int32_t a = 0, int32_t b = 0, const char *s = "");
uint8_t eventCount();
const Event *eventList();
void clearEvents();
