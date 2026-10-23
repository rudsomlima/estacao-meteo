#include <Wire.h>
#include <esp_sleep.h>

#include "config.h"
#include "console.h"
#include "log.h"
#include "net.h"
#include "power.h"
#include "settings.h"
#include "state.h"
#include "usblink.h"

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
  usbSendNow = false;
  while (millis() - t0 < seconds * 1000UL) {
    if (usbSendNow) break;  // o site acabou de mandar uma configuração
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
void sleepFor(uint32_t seconds, bool rainWake) {
  if (usbPlugged()) {
    const uint32_t t0 = millis();
    usbWait(seconds);
    const uint32_t spent = (millis() - t0) / 1000;
    if (spent >= seconds || usbSendNow) return;
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
void updateLevel(float vbat) {
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

uint32_t nextInterval() {
  const uint32_t base = (uint32_t)cfg.intervalMin * 60;
  if (rtcCharging) return min<uint32_t>(base, (uint32_t)cfg.chargeIntervalMin * 60);  // sobra energia: mede mais
  if (rtcLevel >= 1) return base * max<uint8_t>(1, cfg.slowFactor);
  return base;
}
