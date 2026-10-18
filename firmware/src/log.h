#pragma once
#include <Arduino.h>
#include "console.h"

// O log só sai quando a USB está aberta (computador plugado); sem cabo não se gasta tempo com ele.
extern bool logOn;
#define LOG(...) do { if (logOn) Console.printf(__VA_ARGS__); } while (0)
