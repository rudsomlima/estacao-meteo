#include <Arduino.h>

#include "bench.h"
#include "config.h"
#include "events.h"
#include "log.h"
#include "net.h"
#include "ota.h"
#include "power.h"
#include "settings.h"
#include "state.h"
#include "uplink.h"
#include "usblink.h"

/** Quantas falhas seguidas de Wi-Fi já se passaram para abrir o portal de novo: 3, 9, 27, 81, 243. */
static bool portalDue(uint8_t fails) { return fails == 3 || fails == 9 || fails == 27 || fails == 81 || fails == 243; }

void sendIfDue(bool urgent) {
  const bool missing = wifiSsid.isEmpty() || serverUrl.isEmpty() || (deviceKey.isEmpty() && claimCode.isEmpty()) || (signedMode() && stationId.isEmpty());
  const bool forcePortal = coldBoot && (bootPortal || digitalRead(PIN_BOOT) == LOW);
  // sem leitura de sensor não há o que juntar: o sinal de vida (bateria e Wi-Fi) sai a cada `idle_every` ciclos
  const bool due = usbSendNow || urgent || coldBoot || rtcCount >= cfg.sendEvery || rtcCount >= MAX_BATCH || rtcSkipped >= max<uint8_t>(1, cfg.idleEvery);
  const bool wasCold = coldBoot;
  usbSendNow = false;
  coldBoot = false;  // só o primeiro ciclo envia por ser boot a frio
  if (!due || (missing && !wasCold)) return;

  // Com o cabo num computador, o site configura a placa pela USB: o portal Wi-Fi (180 s sem atender a USB) só atrapalharia.
  // Sem o cabo ele abre normalmente; com o cabo, apertar BOOT nos primeiros 6 s depois de ligar também o abre.
  if (missing && !forcePortal && usbPlugged()) {
    LOG("sem configuracao: configure pelo site (USB). O portal abre sem o cabo, ou apertando BOOT nos primeiros 6 s depois de ligar\n");
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
  ensureTimeSynced();  // antes do primeiro HTTPS: sem isto o certificado nunca valida (relógio em 1970)
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
    // configuração nova aplicada: confirma agora, na mesma conexão (um envio sem leituras), em vez de esperar o próximo lote
    if (r.cfgApplied && r.cmd != "restart") { LOG("configuracao nova aplicada: confirmando ao servidor\n"); postBatch(rtcBuf, 0); }
    if (r.cmd == "restart") { LOG("reinicio pedido pelo administrador\n"); netOff(); delay(200); ESP.restart(); }  // o reinício que chega no envio seguinte confirma o comando
  } else {
    rtcFails = min<uint8_t>(rtcFails + 1, 250);  // as leituras e os eventos ficam guardados e vão no próximo envio
  }
  if (bench) benchRun(cfg.benchMin);  // ainda conectada: aproveita para calibrar sem cabo
  netOff();
}
