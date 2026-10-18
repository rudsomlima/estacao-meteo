#include "ota.h"
#include <Update.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <mbedtls/sha256.h>
#include "config.h"
#include "events.h"
#include "log.h"
#include "settings.h"

RTC_DATA_ATTR static uint8_t rtcOtaFails = 0;
RTC_DATA_ATTR static char rtcOtaFailVersion[24] = "";

static void fail(const char *stage, int http) {
  pushEvent(EV_OTA_FAIL, http, 0, stage);
  rtcOtaFails++;
  LOG("OTA falhou em %s (http %d)\n", stage, http);
}

void otaMaybeUpdate(const OtaOffer &offer, float vbat) {
  if (!offer.offered || offer.version.isEmpty() || offer.version == FW_VERSION) return;
  if (vbat > 1.0f && vbat < cfg.criticalV + 0.1f) { LOG("OTA adiada: bateria baixa\n"); return; }
  if (offer.size < 100000 || offer.size > 1600000 || offer.sha256.length() != 64) return;

  // nova versão publicada: zera o contador de falhas
  if (offer.version != rtcOtaFailVersion) { rtcOtaFails = 0; strlcpy(rtcOtaFailVersion, offer.version.c_str(), sizeof(rtcOtaFailVersion)); }
  if (rtcOtaFails >= 3) { LOG("OTA desistiu da versao %s apos 3 falhas\n", offer.version.c_str()); return; }

  setCpuFrequencyMhz(160);
  const String url = serverUrl + "/api/ota/firmware.bin";
  HTTPClient http;
  WiFiClient plain;
  WiFiClientSecure tls;
  bool begun;
  if (url.startsWith("https://")) { tls.setInsecure(); begun = http.begin(tls, url); }
  else begun = http.begin(plain, url);
  if (!begun) { fail("begin", 0); return; }
  http.setConnectTimeout(5000);
  http.setTimeout(30000);  // por leitura; o download inteiro leva mais
  authHeaders(http, "");
  const int code = http.GET();
  const int len = http.getSize();
  if (code != 200 || len != (int)offer.size) { fail("get", code); http.end(); return; }
  if (!Update.begin(len)) { fail("begin_update", 0); http.end(); return; }

  mbedtls_sha256_context ctx;
  mbedtls_sha256_init(&ctx);
  mbedtls_sha256_starts_ret(&ctx, 0);

  WiFiClient *stream = http.getStreamPtr();
  uint8_t buf[1024];
  int left = len;
  uint32_t lastData = millis();
  while (left > 0 && http.connected()) {
    const size_t avail = stream->available();
    if (!avail) {
      if (millis() - lastData > 20000) break;
      delay(5);
      continue;
    }
    const int n = stream->readBytes(buf, min(avail, sizeof(buf)));
    if (n <= 0) break;
    lastData = millis();
    if (Update.write(buf, n) != (size_t)n) { Update.abort(); mbedtls_sha256_free(&ctx); fail("write", 0); http.end(); return; }
    mbedtls_sha256_update_ret(&ctx, buf, n);
    left -= n;
  }
  http.end();

  uint8_t digest[32];
  mbedtls_sha256_finish_ret(&ctx, digest);
  mbedtls_sha256_free(&ctx);
  char hex[65];
  for (int i = 0; i < 32; i++) sprintf(hex + i * 2, "%02x", digest[i]);

  if (left != 0) { Update.abort(); fail("incompleto", 0); return; }
  if (!offer.sha256.equalsIgnoreCase(hex)) { Update.abort(); fail("sha256", 0); return; }
  if (!Update.end(true)) { fail("end", 0); return; }

  pushEvent(EV_OTA_OK, 0, 0, offer.version.c_str());
  rtcOtaFails = 0;
  LOG("OTA ok: %s. Reiniciando\n", offer.version.c_str());
  delay(200);
  ESP.restart();
}
