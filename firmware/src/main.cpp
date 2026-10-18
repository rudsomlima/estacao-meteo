/*
  Estação meteorológica ESP32-C3 — firmware de baixo consumo.

  Dois modos de vento, escolhidos no site (Configuração > "Contar vento o tempo todo"):

    janela      (padrão)  Deep sleep entre ciclos (~10 µA). A cada intervalo acorda, mede o vento por alguns
                          segundos em light sleep, lê o BME280 e guarda a leitura. A chuva acorda o chip por GPIO.
    contínuo              Nunca entra em deep sleep: fica em light sleep contando cada pulso do anemômetro, e a cada
                          intervalo fecha a média, a rajada e a direção do período inteiro (como os equipamentos
                          profissionais). Exige Hall de baixa corrente.

  Nos dois modos as leituras vão para um lote na memória RTC e são enviadas de N em N ("send_every"), ou na hora
  se houver rajada acima do limite. Cada leitura segue com a idade em segundos.

  Primeiro uso: sem rede salva a estação abre o ponto de acesso "EstacaoMeteo-XXXX" (portal cativo).
  Para reabrir o portal depois, segure o botão BOOT ao ligar.
  Calibração da biruta: ao ligar, o monitor serial espera 6 s por 'c' (calibrar) ou 'n' (mostrar ângulo do norte).
*/
#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <esp_sleep.h>
#include <sys/time.h>

#include "config.h"
#include "log.h"
#include "net.h"
#include "sensors.h"
#include "settings.h"
#include "types.h"
#include "wind.h"

bool logOn = false;

// ---------------- memória RTC (sobrevive ao deep sleep) ----------------
RTC_DATA_ATTR static Sample rtcBuf[MAX_BATCH];
RTC_DATA_ATTR static uint8_t rtcCount = 0;
RTC_DATA_ATTR static time_t rtcNextDue = 0;
RTC_DATA_ATTR static uint8_t rtcFails = 0;

static bool coldBoot = false;

// ---------------- sono ----------------
[[noreturn]] static void sleepFor(uint32_t seconds, bool rainWake) {
  netOff();
  Wire.end();
  esp_sleep_enable_timer_wakeup((uint64_t)seconds * 1000000ULL);
  // se o ímã ainda está perto do sensor (pino em LOW) o chip acordaria na hora: fica só com o timer
  if (rainWake && digitalRead(PIN_RAIN) == HIGH)
    esp_deep_sleep_enable_gpio_wakeup(1ULL << PIN_RAIN, ESP_GPIO_WAKEUP_GPIO_LOW);
  LOG("dormindo %us\n", (unsigned)seconds);
  if (logOn) Serial.flush();
  esp_deep_sleep_start();
  while (true) {}
}

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

static uint32_t nextInterval(float vbat) {
  uint32_t s = (uint32_t)cfg.intervalMin * 60;
  if (vbat < cfg.slowBelowV) s *= max<uint8_t>(1, cfg.slowFactor);
  return s;
}

/** Mede o vento, lê o ambiente e guarda a leitura. Devolve true se a rajada passou do limite de urgência. */
static bool measureAndStore(float vbat, uint16_t windSeconds) {
  setCpuFrequencyMhz(80);  // a janela só espera pulsos
  const WindResult w = windMeasure(windSeconds);
  const Env e = readEnv(cfg.samples);
  LOG("T=%.1f H=%.0f P=%.1f | vento %.1f m/s, rajada %.1f, dir %.0f%s (%u pulsos em %u s)\n", e.t, e.h, e.p, w.avg, w.gust,
      w.dir, w.dirOk ? "" : " (sem biruta)", (unsigned)w.pulses, w.seconds);
  if (!e.ok) { LOG("BME280 nao respondeu: leitura descartada\n"); return false; }

  Sample s{(uint32_t)time(nullptr), e.t, e.h, e.p, w.avg, w.gust, w.dir, takeRainTips() * cfg.mmPerTip, vbat};
  pushSample(s);
  return cfg.urgentGustKmh > 0 && w.gust * 3.6f >= cfg.urgentGustKmh;
}

/** Envia o lote quando completa N leituras, quando há urgência, no primeiro boot ou quando o lote enche. */
static void sendIfDue(bool urgent) {
  const bool missing = wifiSsid.isEmpty() || serverUrl.isEmpty() || deviceKey.isEmpty();
  const bool forcePortal = coldBoot && digitalRead(PIN_BOOT) == LOW;
  const bool due = urgent || coldBoot || rtcCount >= cfg.sendEvery || rtcCount >= MAX_BATCH;
  const bool wasCold = coldBoot;
  coldBoot = false;  // só o primeiro ciclo envia por ser boot a frio
  if (!due || (missing && !wasCold)) return;

  setCpuFrequencyMhz(160);
  const bool connected = (missing || forcePortal) ? runPortal() : wifiConnect(cfg.wifiTimeoutS * 1000UL);
  if (!connected) {
    rtcFails++;
    LOG("sem Wi-Fi (%u falhas seguidas), %u leituras aguardam\n", rtcFails, rtcCount);
    netOff();
    return;
  }
  const PostResult r = postBatch(rtcBuf, rtcCount);
  netOff();
  if (r.ok) {
    rtcCount = 0;
    rtcFails = 0;
    if (r.modeChanged) { LOG("modo de vento mudou: reiniciando\n"); ESP.restart(); }
  } else {
    rtcFails++;  // as leituras ficam no lote e vão no próximo envio
  }
}

// ---------------- modo janela: deep sleep entre ciclos ----------------
[[noreturn]] static void windowCycle() {
  const float vbat = batteryVolts();
  LOG("bateria %.2f V\n", vbat);
  if (vbat > 1.0f && vbat < cfg.criticalV) sleepFor(3600, false);  // protege a célula

  const bool urgent = measureAndStore(vbat, cfg.windWindowS);
  sendIfDue(urgent);

  const uint32_t interval = nextInterval(vbat);
  const uint32_t used = millis() / 1000;
  const uint32_t rest = interval > used + 5 ? interval - used : 5;
  rtcNextDue = time(nullptr) + rest;
  sleepFor(rest, true);
}

// ---------------- modo contínuo: light sleep o tempo todo ----------------
static void continuousCycle() {
  const float vbat = batteryVolts();
  LOG("bateria %.2f V\n", vbat);
  if (vbat > 1.0f && vbat < cfg.criticalV) sleepFor(3600, false);

  const uint32_t interval = min<uint32_t>(nextInterval(vbat), MAX_WIND_SECONDS);
  const bool urgent = measureAndStore(vbat, (uint16_t)interval);  // o vento é medido pelo intervalo inteiro
  sendIfDue(urgent);
}

void setup() {
  pinMode(PIN_RAIN, INPUT);
  pinMode(PIN_WIND, INPUT);
  pinMode(PIN_BOOT, INPUT_PULLUP);
  const esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
  loadAll();

  if (cause == ESP_SLEEP_WAKEUP_GPIO) {  // basculada do pluviômetro acordou o deep sleep
    rtcRainTips = rtcRainTips + 1;
    const uint32_t t = millis();
    while (digitalRead(PIN_RAIN) == LOW && millis() - t < 300) delay(2);  // espera o ímã se afastar
    const long remain = (long)(rtcNextDue - time(nullptr));
    if (remain > 3) sleepFor(remain, true);  // ainda não é hora de medir: volta a dormir
  }

  coldBoot = cause == ESP_SLEEP_WAKEUP_UNDEFINED;
  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(100000);
  if (coldBoot) {
    Serial.begin(115200);
    delay(400);
    logOn = true;
    rtcRainTips = 0;
    rtcCount = 0;
    serialTools();
  }
  rainAttach();

  if (!cfg.continuousWind) windowCycle();  // nunca volta: termina em deep sleep
  LOG("modo continuo: light sleep, intervalo %u min, envio a cada %u leituras\n", cfg.intervalMin, cfg.sendEvery);
}

void loop() {
  if (cfg.continuousWind) continuousCycle();
  else delay(1000);
}
