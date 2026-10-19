/*
  Estação meteorológica ESP32-C3 — firmware de baixo consumo.

  Dois modos de vento, escolhidos no site (Configurações > "Contar o vento o tempo todo"):

    janela      (padrão)  Deep sleep entre ciclos (~10 µA). A cada intervalo acorda, mede o vento por alguns
                          segundos em light sleep, lê o BME280 e guarda a leitura. A chuva acorda o chip por GPIO.
    contínuo              Nunca entra em deep sleep: fica em light sleep contando cada pulso do anemômetro, e a cada
                          intervalo fecha a média, a rajada e a direção do período inteiro (como os equipamentos
                          profissionais). Exige Hall de baixa corrente.

  Nos dois modos as leituras vão para um lote na memória RTC e são enviadas de N em N ("send_every"), ou na hora
  se houver rajada acima do limite. Cada leitura segue com a idade em segundos.

  Bateria: três estados com histerese de 0,05 V (normal, economia e crítico) e um estado "carregando".
  Eventos (reinício, falha de atualização, modo bancada) vão junto com as leituras para o diagnóstico no site.
  Atualização pelo ar: quando o servidor oferece uma versão diferente, baixa, confere o SHA-256 e reinicia.

  Primeiro uso: sem rede salva a estação abre o ponto de acesso "EstacaoMeteo-XXXX" (portal cativo).
  Para reabrir o portal depois, segure o botão BOOT ao ligar.
  Modo bancada: ao ligar (depois do primeiro envio), abre uma página local por `bench_min` minutos com as leituras ao vivo
  e a calibração da biruta, sem cabo.

  USB: o mesmo firmware serve para a bancada e para o campo. Sem computador do outro lado do cabo (bateria, painel solar,
  carregador) a porta USB nunca é aberta e o ciclo é o de baixo consumo. Com um computador plugado, ao ligar a placa
  atende o site por alguns segundos (configura Wi-Fi, endereço e chave) e as ferramentas 'c' (calibrar a biruta) e 'n'
  (ângulo do norte); depois não dorme enquanto o cabo estiver ali, para a porta continuar disponível para gravar.
*/
#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <esp_sleep.h>
#include <sys/time.h>

#include "bench.h"
#include "config.h"
#include "console.h"
#include "events.h"
#include "log.h"
#include "net.h"
#include "ota.h"
#include "sensors.h"
#include "settings.h"
#include "types.h"
#include "usblink.h"
#include "wind.h"

bool logOn = false;

// ---------------- memória RTC (sobrevive ao deep sleep) ----------------
RTC_DATA_ATTR static Sample rtcBuf[MAX_BATCH];
RTC_DATA_ATTR static uint8_t rtcCount = 0;
RTC_DATA_ATTR static time_t rtcNextDue = 0;
RTC_DATA_ATTR static uint8_t rtcFails = 0;
RTC_DATA_ATTR static uint8_t rtcSkipped = 0;    // ciclos sem leitura (sensor ausente) desde o último envio: contam para o envio de sinal de vida
RTC_DATA_ATTR static uint32_t rtcBootCount = 0;
RTC_DATA_ATTR static uint8_t rtcLevel = 0;      // 0 normal, 1 economia, 2 crítico
RTC_DATA_ATTR static bool rtcCharging = false;

static bool coldBoot = false;

/** Abaixo disto não há célula ligada (pino flutuando ou só a USB): uma LiPo nunca desce a 2 V em uso, e o pino solto oscila de 0,5 a 1,5 V. */
static constexpr float NO_BATTERY_V = 2.0f;

// ---------------- sono ----------------
/**
 * Com um computador plugado a placa não entra em deep sleep: a porta USB sumiria (e não daria para gravar sem apertar RESET).
 * Fica acordada atendendo o site e as ferramentas até acabar o tempo, ou até o cabo sair.
 */
static void usbWait(uint32_t seconds) {
  netOff();
  setCpuFrequencyMhz(80);
  usbOpen();
  LOG("USB conectada: aguardando %us acordada (a porta continua disponivel para gravar)\n", (unsigned)seconds);
  const uint32_t t0 = millis();
  uint32_t goneSince = 0;
  while (millis() - t0 < seconds * 1000UL) {
    if (usbPlugged()) goneSince = 0;
    else if (!goneSince) goneSince = millis();
    else if (millis() - goneSince > 1500) break;  // cabo removido
    if (usbPoll()) continue;
    if (Console.available()) Console.read();  // descarta o que não é comando
    delay(20);
  }
}

/**
 * Espera até o próximo ciclo. Em campo é deep sleep e não volta (acorda no setup). Com computador plugado espera acordada
 * e volta quando o tempo acaba; se o cabo sair no meio, dorme o que faltar.
 */
static void sleepFor(uint32_t seconds, bool rainWake) {
  if (usbPlugged()) {
    const uint32_t t0 = millis();
    usbWait(seconds);
    const uint32_t spent = (millis() - t0) / 1000;
    if (spent >= seconds) return;
    seconds -= spent;
  }
  netOff();
  Wire.end();
  esp_sleep_enable_timer_wakeup((uint64_t)seconds * 1000000ULL);
  // se o ímã ainda está perto do sensor (pino em LOW) o chip acordaria na hora: fica só com o timer
  if (rainWake && digitalRead(PIN_RAIN) == HIGH)
    esp_deep_sleep_enable_gpio_wakeup(1ULL << PIN_RAIN, ESP_GPIO_WAKEUP_GPIO_LOW);
  LOG("dormindo %us\n", (unsigned)seconds);
  if (logOn) Console.flush();
  esp_deep_sleep_start();
  while (true) {}
}

// ---------------- bateria com histerese ----------------
/**
 * Entra em economia abaixo de `slowBelowV` e só volta a normal acima de `slowBelowV + 0,05`; o mesmo para o crítico.
 * Sem a folga, uma tensão parada na fronteira faria a estação trocar de estado a cada ciclo.
 * "Carregando" (painel solar dando carga) vale acima de `chargeAboveV`, com a mesma folga para sair.
 */
static void updateLevel(float vbat) {
  const float h = 0.05f;
  // sem bateria ligada (placa na USB ou o pino flutuando) a leitura oscila em torno de 1 V: não é bateria fraca, e tratar assim pararia os envios
  if (vbat < NO_BATTERY_V) { rtcLevel = 0; rtcCharging = false; return; }
  if (rtcLevel == 2) { if (vbat > cfg.criticalV + h) rtcLevel = 1; }
  else if (vbat < cfg.criticalV) rtcLevel = 2;
  if (rtcLevel == 1) { if (vbat > cfg.slowBelowV + h) rtcLevel = 0; }
  else if (rtcLevel == 0 && vbat < cfg.slowBelowV) rtcLevel = 1;

  if (cfg.chargeAboveV > 0) {
    if (rtcCharging) { if (vbat < cfg.chargeAboveV - h) rtcCharging = false; }
    else if (vbat >= cfg.chargeAboveV) rtcCharging = true;
  } else {
    rtcCharging = false;
  }
}

static uint32_t nextInterval() {
  const uint32_t base = (uint32_t)cfg.intervalMin * 60;
  if (rtcCharging) return min<uint32_t>(base, (uint32_t)cfg.chargeIntervalMin * 60);  // sobra energia: mede mais
  if (rtcLevel >= 1) return base * max<uint8_t>(1, cfg.slowFactor);
  return base;
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

/** Mede o vento, lê o ambiente e guarda a leitura. Devolve true se a rajada passou do limite de urgência. */
static bool measureAndStore(float vbat, uint16_t windSeconds) {
  setCpuFrequencyMhz(80);  // a janela só espera pulsos
  const WindResult w = windMeasure(windSeconds);
  const Env e = readEnv(cfg.samples);
  LOG("T=%.1f H=%.0f P=%.1f | vento %.1f m/s, rajada %.1f, dir %.0f%s (%u pulsos em %u s)\n", e.t, e.h, e.p, w.avg, w.gust,
      w.dir, w.dirOk ? "" : " (sem biruta)", (unsigned)w.pulses, w.seconds);
  if (!e.ok) { rtcSkipped = min<uint8_t>(rtcSkipped + 1, 250); LOG("BME280 nao respondeu: leitura descartada\n"); return false; }

  Sample s{(uint32_t)time(nullptr), e.t, e.h, e.p, w.avg, w.gust, w.dir, takeRainTips() * cfg.mmPerTip, vbat};
  pushSample(s);
  return cfg.urgentGustKmh > 0 && w.gust * 3.6f >= cfg.urgentGustKmh;
}

/** Quantas falhas seguidas de Wi-Fi já se passaram para abrir o portal de novo: 3, 9, 27, 81, 243. */
static bool portalDue(uint8_t fails) { return fails == 3 || fails == 9 || fails == 27 || fails == 81 || fails == 243; }

/** Envia o lote quando completa N leituras, quando há urgência, no primeiro boot ou quando o lote enche. */
static void sendIfDue(bool urgent) {
  const bool missing = wifiSsid.isEmpty() || serverUrl.isEmpty() || (deviceKey.isEmpty() && claimCode.isEmpty()) || (signedMode() && stationId.isEmpty());
  const bool forcePortal = coldBoot && digitalRead(PIN_BOOT) == LOW;
  // sem o BME280 não há leituras para juntar: a estação manda o sinal de vida (bateria e Wi-Fi) a cada intervalo, sem esperar o lote
  const bool due = urgent || coldBoot || rtcCount >= cfg.sendEvery || rtcCount >= MAX_BATCH || rtcSkipped > 0;
  const bool wasCold = coldBoot;
  coldBoot = false;  // só o primeiro ciclo envia por ser boot a frio
  if (!due || (missing && !wasCold)) return;

  // Com o cabo num computador, o site configura a placa pela USB: o portal Wi-Fi (180 s sem atender a USB) só atrapalharia.
  // Sem o cabo ele abre normalmente; com o cabo, segurar BOOT ao ligar também o abre.
  if (missing && !forcePortal && usbPlugged()) {
    LOG("sem configuracao: configure pelo site (USB). O portal abre sem o cabo, ou segurando BOOT ao ligar\n");
    return;
  }
  setCpuFrequencyMhz(160);
  // Wi-Fi que não conecta há vários envios (a estação foi levada para outro lugar, a senha mudou): abre o portal para o celular
  // escolher outra rede. Só sem cabo no computador, e cada vez mais raro (após 3, 9, 27, 81 falhas) para não gastar a bateria.
  const bool portalAfterFails = !missing && !forcePortal && portalDue(rtcFails) && !usbPlugged();
  if (portalAfterFails) LOG("%u falhas seguidas de Wi-Fi: abrindo o portal EstacaoMeteo para escolher outra rede\n", (unsigned)rtcFails);
  const bool viaPortal = missing || forcePortal || portalAfterFails;
  // modo bancada: só depois do primeiro envio, para a estação aparecer no site logo ao ser ligada
  const bool bench = wasCold && cfg.benchMin > 0 && (viaPortal || digitalRead(PIN_BOOT) == HIGH);
  const bool connected = viaPortal ? runPortal() : wifiConnect(cfg.wifiTimeoutS * 1000UL);
  if (!connected) {
    rtcFails = min<uint8_t>(rtcFails + 1, 250);
    LOG("sem Wi-Fi (%u falhas seguidas), %u leituras aguardam\n", rtcFails, rtcCount);
    netOff();
    return;
  }
  if (!claimKey()) {  // ainda sem chave: o código não foi trocado
    rtcFails = min<uint8_t>(rtcFails + 1, 250);
    netOff();
    return;
  }

  const float vbat = rtcCount ? rtcBuf[rtcCount - 1].vbat : 0;
  const PostResult r = postBatch(rtcBuf, rtcCount);
  if (r.ok) {
    rtcCount = 0;
    rtcSkipped = 0;
    rtcFails = 0;
    clearEvents();
    if (r.modeChanged) { netOff(); LOG("modo de vento mudou: reiniciando\n"); ESP.restart(); }
    otaMaybeUpdate(r.ota, vbat);  // reinicia sozinha se atualizar
    if (r.cmd == "restart") { LOG("reinicio pedido pelo administrador\n"); netOff(); delay(200); ESP.restart(); }  // o reinício que chega no envio seguinte confirma o comando
  } else {
    rtcFails = min<uint8_t>(rtcFails + 1, 250);  // as leituras e os eventos ficam guardados e vão no próximo envio
  }
  if (bench) benchRun(cfg.benchMin);  // ainda conectada: aproveita para calibrar sem cabo
  netOff();
}

// ---------------- modo janela: deep sleep entre ciclos ----------------
static void windowCycle() {
  const float vbat = batteryVolts();
  updateLevel(vbat);
  LOG("bateria %.2f V (nivel %u%s)\n", vbat, rtcLevel, rtcCharging ? ", carregando" : "");
  if (vbat >= NO_BATTERY_V && rtcLevel == 2) { sleepFor(3600, false); return; }  // protege a célula

  const bool urgent = measureAndStore(vbat, cfg.windWindowS);
  sendIfDue(urgent);

  const uint32_t interval = nextInterval();
  const uint32_t used = millis() / 1000;
  const uint32_t rest = interval > used + 5 ? interval - used : 5;
  rtcNextDue = time(nullptr) + rest;
  sleepFor(rest, true);  // sem computador plugado não volta daqui: o próximo ciclo começa no setup
}

// ---------------- modo contínuo: light sleep o tempo todo ----------------
static void continuousCycle() {
  const float vbat = batteryVolts();
  updateLevel(vbat);
  LOG("bateria %.2f V (nivel %u%s)\n", vbat, rtcLevel, rtcCharging ? ", carregando" : "");
  if (vbat >= NO_BATTERY_V && rtcLevel == 2) { sleepFor(3600, false); return; }

  const uint32_t interval = min<uint32_t>(nextInterval(), MAX_WIND_SECONDS);
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
  rtcBootCount++;
  const esp_reset_reason_t reason = esp_reset_reason();
  if (reason != ESP_RST_DEEPSLEEP) {  // acordar do sono é rotina; os outros motivos (queda de tensão, watchdog...) interessam
    pushEvent(EV_BOOT, (int32_t)reason, (int32_t)rtcBootCount, coldBoot ? "power-on" : "timer");
  }

  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(100000);
  if (coldBoot) {
    rtcRainTips = 0;
    rtcCount = 0;
    if (usbPlugged()) {  // sem computador do outro lado do cabo não se espera nada
      usbOpen();
      // placa sem configuração: espera mais, para o site ter tempo de reconhecê-la e configurá-la antes do portal
      const bool unconfigured = wifiSsid.isEmpty() || serverUrl.isEmpty() || (deviceKey.isEmpty() && claimCode.isEmpty());
      serialTools(unconfigured ? 60000 : 10000);
    }
  }
  rainAttach();
  if (cfg.continuousWind) LOG("modo continuo: light sleep, intervalo %u min, envio a cada %u leituras\n", cfg.intervalMin, cfg.sendEvery);
}

void loop() {
  if (cfg.continuousWind) continuousCycle();
  else windowCycle();  // em campo termina em deep sleep; com computador plugado volta aqui no próximo ciclo
}
