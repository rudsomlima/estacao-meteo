/*
  Estação meteorológica ESP32-C3 — firmware de baixo consumo.

  Dois modos de vento, escolhidos no site (Configurações > "Contar o vento o tempo todo"):

    janela      (padrão)  Deep sleep entre ciclos (~10 µA). A cada intervalo acorda, mede o vento por alguns
                          segundos em light sleep, lê o sensor de ambiente e guarda a leitura. A chuva acorda o chip por GPIO.
    contínuo              Nunca entra em deep sleep: fica em light sleep contando cada pulso do anemômetro, e a cada
                          intervalo fecha a média, a rajada e a direção do período inteiro (como os equipamentos
                          profissionais). Exige Hall de baixa corrente.

  Nos dois modos as leituras vão para um lote na memória RTC e são enviadas de N em N ("send_every"), ou na hora
  se houver rajada acima do limite. Cada leitura segue com a idade em segundos.

  Bateria: três estados com histerese de 0,05 V (normal, economia e crítico) e um estado "carregando".
  Eventos (reinício, falha de atualização, modo bancada) vão junto com as leituras para o diagnóstico no site.
  Atualização pelo ar: quando o servidor oferece uma versão diferente, baixa, confere o SHA-256 e reinicia.

  Primeiro uso: sem rede salva a estação abre o ponto de acesso "EstacaoMeteo-XXXX" (portal cativo).
  Para reabrir o portal depois, aperte o botão BOOT nos primeiros 6 s depois de ligar (NÃO o segure ao ligar: com GPIO9 em
  nível baixo no reset o ESP32-C3 entra em modo de gravação e o firmware nem roda). Pelo cabo, o site manda {"cmd":"portal"}.
  Modo bancada: ao ligar (depois do primeiro envio), abre uma página local por `bench_min` minutos com as leituras ao vivo
  e a calibração da biruta, sem cabo.

  USB: o mesmo firmware serve para a bancada e para o campo. Sem computador do outro lado do cabo (bateria, painel solar,
  carregador) a porta USB nunca é aberta e o ciclo é o de baixo consumo. Com um computador plugado, ao ligar a placa
  atende o site por alguns segundos (configura Wi-Fi, endereço e chave) e as ferramentas 'c' (calibrar a biruta) e 'n'
  (ângulo do norte); depois não dorme enquanto o cabo estiver ali, para a porta continuar disponível para gravar.
*/
#include <Arduino.h>
#include <Wire.h>
#include <esp_sleep.h>

#include "config.h"
#include "console.h"
#include "cycle.h"
#include "events.h"
#include "log.h"
#include "power.h"
#include "sensors.h"
#include "settings.h"
#include "state.h"
#include "usblink.h"
#include "wind.h"

bool logOn = false;

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
    // BOOT é o GPIO9: segurá-lo ao ligar coloca o ESP32-C3 em modo de gravação. Por isso o portal se abre apertando o botão
    // DEPOIS que a placa liga, numa janela de 6 s (meio segundo apertado basta).
    const uint32_t tb = millis();
    while (millis() - tb < 6000 && !bootPortal) {
      if (digitalRead(PIN_BOOT) == LOW) {
        delay(400);
        if (digitalRead(PIN_BOOT) == LOW) bootPortal = true;
      }
      delay(20);
    }
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
