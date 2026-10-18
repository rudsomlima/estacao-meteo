#pragma once
#include <Arduino.h>

// A porta serial só é aberta em boot a frio; nos ciclos seguintes não se gasta tempo com ela.
extern bool logOn;
#define LOG(...) do { if (logOn) Serial.printf(__VA_ARGS__); } while (0)
