// Estado do ciclo para os comandos USB "diag" e "body".
#include <ArduinoJson.h>

#include "power.h"
#include "state.h"
#include "usblink.h"

/** As leituras que estão no lote esperando envio (comando USB "body"). */
uint8_t batchView(const Sample **out) { *out = rtcBuf; return rtcCount; }

/** Estado do ciclo para o comando USB "diag". */
void diagFill(JsonObject o) {
  o["level"] = rtcLevel;
  o["charging"] = rtcCharging;
  o["batch"] = rtcCount;
  o["skipped"] = rtcSkipped;
  o["fails"] = rtcFails;
  o["boots"] = rtcBootCount;
  o["interval_s"] = nextInterval();
  o["next_due_in"] = (long)(rtcNextDue - time(nullptr));
}
