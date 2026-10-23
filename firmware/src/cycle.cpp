#include <Arduino.h>

#include "config.h"
#include "cycle.h"
#include "log.h"
#include "power.h"
#include "sensors.h"
#include "settings.h"
#include "state.h"
#include "uplink.h"
#include "wind.h"

// ---------------- lote de leituras ----------------
static void pushSample(const Sample &s) {
  if (rtcCount == MAX_BATCH) {
    // lote cheio (sem Wi-Fi há muito tempo): descarta a mais antiga, mas soma a chuva dela na seguinte
    rtcBuf[1].rain += rtcBuf[0].rain;
    memmove(&rtcBuf[0], &rtcBuf[1], sizeof(Sample) * (MAX_BATCH - 1));
    rtcCount--;
  }
  rtcBuf[rtcCount++] = s;
}

/** Mede o vento, lê o ambiente e guarda a leitura. Devolve true se a rajada passou do limite de urgência. */
static bool measureAndStore(float vbat, uint16_t windSeconds) {
  setCpuFrequencyMhz(80);  // a janela só espera pulsos
  // sem anemômetro nem biruta instalados, não mede: pino solto vira ruído, não "vento" de verdade. Com só um dos dois,
  // a medição roda do mesmo jeito (pulso e bússola saem da mesma janela) e cada campo vai para a leitura conforme o que existe.
  const WindResult w = (cfg.hasWind || cfg.hasVane) ? windMeasure(windSeconds) : WindResult{};
  const Env e = readEnv(cfg.samples);
  LOG("T=%.1f H=%.0f P=%.1f | vento %.1f m/s, rajada %.1f, dir %.0f%s (%u pulsos em %u s)\n", e.t, e.h, e.p, w.avg, w.gust,
      w.dir, w.dirOk ? "" : " (sem biruta)", (unsigned)w.pulses, w.seconds);
  if (!e.ok) { rtcSkipped = min<uint8_t>(rtcSkipped + 1, 250); LOG(cfg.envSensor ? "sensor de ambiente nao respondeu: leitura descartada\n" : "sem sensor de ambiente configurado: so o sinal de vida\n"); return false; }

  // sem leitura da biruta a direção vai vazia (o site mostra "—"), e não a última conhecida como se fosse nova
  const uint32_t rainTips = takeRainTips(); // sempre lê (zera o contador), mas só conta como chuva se o sensor existir
  Sample s{
    (uint32_t)time(nullptr), e.t, e.h, e.p,
    cfg.hasWind ? w.avg : NAN, cfg.hasWind ? w.gust : NAN, (cfg.hasVane && w.dirOk) ? w.dir : NAN,
    cfg.hasRain ? rainTips * cfg.mmPerTip : NAN, vbat,
  };
  pushSample(s);
  return cfg.urgentGustKmh > 0 && w.gust * 3.6f >= cfg.urgentGustKmh;
}

// ---------------- modo janela: deep sleep entre ciclos ----------------
/** millis() em que o ciclo atual começou. Zero no primeiro (conta desde o boot). Com o cabo no computador a placa não dorme e o
 *  millis() não zera entre os ciclos: sem esta referência o intervalo encurtava para 5 s depois do primeiro minuto. */
static uint32_t cycleBase = 0;

void windowCycle() {
  const uint32_t t0 = cycleBase;
  const float vbat = batteryVolts();
  updateLevel(vbat);
  LOG("bateria %.2f V (nivel %u%s)\n", vbat, rtcLevel, rtcCharging ? ", carregando" : "");
  if (vbat >= NO_BATTERY_V && rtcLevel == 2) { sleepFor(3600, false); cycleBase = millis(); return; }  // protege a célula

  const bool urgent = measureAndStore(vbat, cfg.windWindowS);
  sendIfDue(urgent);

  const uint32_t interval = nextInterval();
  const uint32_t used = (millis() - t0) / 1000;
  const uint32_t rest = interval > used + 5 ? interval - used : 5;
  rtcNextDue = time(nullptr) + rest;
  sleepFor(rest, true);  // sem computador plugado não volta daqui: o próximo ciclo começa no setup
  cycleBase = millis();   // com o cabo ela volta: o próximo ciclo conta daqui
}

// ---------------- modo contínuo: light sleep o tempo todo ----------------
void continuousCycle() {
  const float vbat = batteryVolts();
  updateLevel(vbat);
  LOG("bateria %.2f V (nivel %u%s)\n", vbat, rtcLevel, rtcCharging ? ", carregando" : "");
  if (vbat >= NO_BATTERY_V && rtcLevel == 2) { sleepFor(3600, false); return; }

  const uint32_t interval = min<uint32_t>(nextInterval(), MAX_WIND_SECONDS);
  const bool urgent = measureAndStore(vbat, (uint16_t)interval);  // o vento é medido pelo intervalo inteiro
  sendIfDue(urgent);
}
