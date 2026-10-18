#include "wind.h"
#include <driver/gpio.h>
#include <esp_sleep.h>
#include <esp_timer.h>
#include "config.h"
#include "console.h"
#include "log.h"
#include "sensors.h"
#include "settings.h"
#include "usblink.h"

RTC_DATA_ATTR volatile uint32_t rtcRainTips = 0;
RTC_DATA_ATTR float rtcLastDir = 0;

static uint16_t bucket[MAX_WIND_SECONDS];  // pulsos por segundo, para achar a rajada

static uint32_t windCount = 0;
static bool windLow = false, rainLow = false;
static int64_t lastWindUs = 0, lastRainUs = 0;
static volatile int64_t isrRainUs = 0;

void IRAM_ATTR isrRain() {
  const int64_t now = esp_timer_get_time();
  if (now - isrRainUs > 80000) { rtcRainTips = rtcRainTips + 1; isrRainUs = now; }
}

void rainAttach() { attachInterrupt(digitalPinToInterrupt(PIN_RAIN), isrRain, FALLING); }
void rainDetach() { detachInterrupt(digitalPinToInterrupt(PIN_RAIN)); }

uint32_t takeRainTips() {
  noInterrupts();
  const uint32_t t = rtcRainTips;
  rtcRainTips = 0;
  interrupts();
  return t;
}

/** Vê o nível dos pinos e conta a borda de descida (Hall ativo em nível baixo), com filtro anti-repique. */
static inline void pollPins(int64_t nowUs) {
  const bool w = digitalRead(PIN_WIND) == LOW;
  if (w && !windLow && nowUs - lastWindUs > 2000) { windCount++; lastWindUs = nowUs; }
  windLow = w;
  const bool r = digitalRead(PIN_RAIN) == LOW;
  if (r && !rainLow && nowUs - lastRainUs > 80000) { rtcRainTips = rtcRainTips + 1; lastRainUs = nowUs; }
  rainLow = r;
}

WindResult windMeasure(uint16_t seconds) {
  seconds = constrain(seconds, 2, MAX_WIND_SECONDS);
  const uint8_t gustW = constrain(cfg.gustWindowS, 1, (int)min<uint16_t>(seconds, 10));
  // em janelas curtas amostra a biruta 4 vezes por segundo; em janelas longas, 1 vez
  const int64_t dirPeriod = seconds <= 30 ? 250000 : 1000000;

  rainDetach();
  const bool magOk = qmcStart();
  windLow = digitalRead(PIN_WIND) == LOW;  // um pulso em andamento não conta
  rainLow = digitalRead(PIN_RAIN) == LOW;
  if (logOn) Console.flush();

  double sx = 0, sy = 0;
  uint32_t nd = 0;
  uint16_t sec = 0;
  const uint32_t startCount = windCount;
  uint32_t lastCount = windCount;
  const int64_t t0 = esp_timer_get_time();
  int64_t nextSec = t0 + 1000000, nextDir = t0 + dirPeriod;

  bool plugged = usbPlugged();
  while (sec < seconds) {
    const int64_t now = esp_timer_get_time();
    pollPins(now);
    if (now >= nextDir) {
      double ux, uy;
      if (magOk && magVector(ux, uy)) { sx += ux; sy += uy; nd++; }
      nextDir += dirPeriod;
      continue;
    }
    if (now >= nextSec) {
      bucket[sec++] = (uint16_t)min<uint32_t>(windCount - lastCount, 65535);
      lastCount = windCount;
      nextSec += 1000000;
      plugged = usbPlugged();  // o cabo pode ter sido plugado ou tirado durante uma medição longa
      continue;
    }
    // Com um computador plugado não há light sleep: ele derrubaria a porta USB no meio da medição.
    if (plugged) { usbOpen(); usbPoll(); delayMicroseconds(300); continue; }  // e continua atendendo o site
    // Light sleep: acorda quando um pino muda de nível (os dois lados do pulso) ou no próximo tick.
    gpio_wakeup_enable((gpio_num_t)PIN_WIND, windLow ? GPIO_INTR_HIGH_LEVEL : GPIO_INTR_LOW_LEVEL);
    gpio_wakeup_enable((gpio_num_t)PIN_RAIN, rainLow ? GPIO_INTR_HIGH_LEVEL : GPIO_INTR_LOW_LEVEL);
    esp_sleep_enable_gpio_wakeup();
    const int64_t until = min(nextSec, nextDir) - now;
    if (until < 500) continue;
    esp_sleep_enable_timer_wakeup((uint64_t)until);
    esp_light_sleep_start();
  }
  gpio_wakeup_disable((gpio_num_t)PIN_WIND);
  gpio_wakeup_disable((gpio_num_t)PIN_RAIN);
  qmcStop();
  rainAttach();

  WindResult w{};
  w.seconds = seconds;
  w.pulses = windCount - startCount;
  w.avg = cfg.kWind * ((float)w.pulses / seconds);
  float best = 0;
  for (uint16_t i = 0; i + gustW <= seconds; i++) {
    uint32_t sum = 0;
    for (uint8_t j = 0; j < gustW; j++) sum += bucket[i + j];
    best = max(best, (float)sum / gustW);
  }
  w.gust = max(w.avg, cfg.kWind * best);

  if (nd >= 2) {
    const float raw = atan2f((float)sy, (float)sx) * 180.0f / PI;
    w.dir = fmodf(DIR_SIGN * raw - cfg.dirOffset + 720.0f, 360.0f);
    rtcLastDir = w.dir;
    w.dirOk = true;
  } else {
    w.dir = rtcLastDir;  // sem leitura da biruta: repete a última direção conhecida
    w.dirOk = false;
  }
  return w;
}
