#include "net.h"
#include <ArduinoJson.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>
#include <sys/time.h>
#include "auth.h"
#include "config.h"
#include "events.h"
#include "log.h"
#include "settings.h"

// Cole aqui o certificado raiz do seu servidor (PEM) para validar o HTTPS. Vazio = não valida.
static const char *ROOT_CA_PEM = nullptr;

// Conexão rápida e nonce do modo assinado: guardados na memória RTC entre os ciclos.
RTC_DATA_ATTR static uint8_t rtcBssid[6];
RTC_DATA_ATTR static int32_t rtcChannel = 0;
RTC_DATA_ATTR static uint32_t rtcIp = 0, rtcGw = 0, rtcMask = 0, rtcDns = 0;
RTC_DATA_ATTR static char rtcNonce[24] = "";

static bool waitConnected(uint32_t ms) {
  const uint32_t t = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t < ms) delay(20);
  return WiFi.status() == WL_CONNECTED;
}

bool wifiConnect(uint32_t timeoutMs) {
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  const bool fast = rtcChannel > 0 && rtcIp != 0;
  if (fast) {
    // pula a varredura de canais e o DHCP: poupa ~1,5 s de rádio ligado
    WiFi.config(IPAddress(rtcIp), IPAddress(rtcGw), IPAddress(rtcMask), IPAddress(rtcDns));
    WiFi.begin(wifiSsid.c_str(), wifiPass.c_str(), rtcChannel, rtcBssid);
  } else {
    WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());
  }
  bool ok = waitConnected(fast ? 4000 : timeoutMs);
  if (!ok && fast) {  // roteador mudou de canal ou de IP: refaz do zero
    rtcChannel = 0; rtcIp = 0;
    WiFi.disconnect();
    WiFi.config(IPAddress((uint32_t)0), IPAddress((uint32_t)0), IPAddress((uint32_t)0));
    WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());
    ok = waitConnected(timeoutMs);
  }
  if (ok) {
    memcpy(rtcBssid, WiFi.BSSID(), 6);
    rtcChannel = WiFi.channel();
    rtcIp = (uint32_t)WiFi.localIP(); rtcGw = (uint32_t)WiFi.gatewayIP();
    rtcMask = (uint32_t)WiFi.subnetMask(); rtcDns = (uint32_t)WiFi.dnsIP();
  }
  return ok;
}

bool runPortal() {
  WiFiManager wm;
  char benchBuf[6];
  snprintf(benchBuf, sizeof(benchBuf), "%u", cfg.benchMin);
  WiFiManagerParameter pCode("code", "Codigo de pareamento (gerado no site, ex.: K7F-29Q)", claimCode.c_str(), 8);
  WiFiManagerParameter pServer("server", "Endereco do site (https://...)", serverUrl.c_str(), 120);
  WiFiManagerParameter pId("sid", "Avancado: ID da estacao (so sem codigo)", stationId.c_str(), 32);
  WiFiManagerParameter pKey("key", "Avancado: chave do dispositivo (so sem codigo)", deviceKey.c_str(), 64);
  WiFiManagerParameter pBench("bench", "Modo bancada ao ligar, em minutos (0 desliga)", benchBuf, 4);
  wm.addParameter(&pCode);
  wm.addParameter(&pServer);
  wm.addParameter(&pId);
  wm.addParameter(&pKey);
  wm.addParameter(&pBench);
  wm.setConfigPortalTimeout(PORTAL_TIMEOUT_S);
  wm.setClass("invert");
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char ap[32];
  snprintf(ap, sizeof(ap), "EstacaoMeteo-%02X%02X", mac[4], mac[5]);
  const bool ok = wm.startConfigPortal(ap);
  if (ok) {
    wifiSsid = WiFi.SSID(); wifiPass = WiFi.psk();
    serverUrl = pServer.getValue(); deviceKey = pKey.getValue(); stationId = pId.getValue();
    serverUrl.trim(); stationId.trim(); deviceKey.trim();
    claimCode = pCode.getValue();
    claimCode.trim(); claimCode.toUpperCase(); claimCode.replace("-", ""); claimCode.replace(" ", "");
    if (!deviceKey.isEmpty()) claimCode = "";  // chave digitada à mão vale mais que o código
    while (serverUrl.endsWith("/")) serverUrl.remove(serverUrl.length() - 1);
    cfg.benchMin = constrain(atoi(pBench.getValue()), 0, 30);
    saveSettings();
    saveNetwork();
  }
  return ok;
}

bool claimKey() {
  if (claimCode.isEmpty()) return true;
  if (!serverUrl.startsWith("https://")) { LOG("pareamento exige https:// (a chave viaja na resposta)\n"); return false; }
  HTTPClient http;
  WiFiClientSecure tls;
  if (ROOT_CA_PEM) tls.setCACert(ROOT_CA_PEM); else tls.setInsecure();
  http.setTimeout(cfg.wifiTimeoutS * 1000);
  if (!http.begin(tls, serverUrl + "/api/claim")) return false;
  http.addHeader("Content-Type", "application/json");
  JsonDocument req;
  req["code"] = claimCode;
  String body;
  serializeJson(req, body);
  const int code = http.POST(body);
  const String text = code > 0 ? http.getString() : String("");
  http.end();
  LOG("pareamento: http %d\n", code);
  if (code == 200) {
    JsonDocument d;
    if (deserializeJson(d, text) || !d["key"].is<const char *>()) return false;
    deviceKey = d["key"].as<String>();
    stationId = d["id"].as<String>();
    claimCode = "";
    saveNetwork();
    return true;
  }
  if (code == 403) { claimCode = ""; saveNetwork(); LOG("codigo recusado: gere outro no site e refaca o portal\n"); }
  return false;  // 429 e falhas de rede: tenta no próximo ciclo
}

void netOff() {
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
}

int netRssi() { return WiFi.RSSI(); }

bool signedMode() { return serverUrl.startsWith("http://"); }

void authHeaders(HTTPClient &http, const String &body) {
  if (!signedMode()) {
    http.addHeader("X-Device-Key", deviceKey);
    return;
  }
  const String secret = sha256Hex(deviceKey);  // o servidor guarda só este hash, e é ele a chave do HMAC
  http.addHeader("X-Station", stationId);
  http.addHeader("X-Nonce", String(rtcNonce));
  http.addHeader("X-Sig", hmacSha256Hex(secret, stationId + "|" + String(rtcNonce) + "|" + body));
}

static const char *eventName(uint8_t k) {
  switch (k) {
    case EV_BOOT: return "boot";
    case EV_OTA_FAIL: return "ota_fail";
    case EV_OTA_OK: return "ota_ok";
    case EV_BENCH: return "bench";
  }
  return "info";
}

static String buildBody(const Sample *s, uint8_t n) {
  const uint32_t now = (uint32_t)time(nullptr);
  const int rssi = WiFi.RSSI();
  JsonDocument doc;
  doc["cfg"] = cfg.version;
  doc["fw"] = FW_VERSION;
  JsonArray arr = doc["batch"].to<JsonArray>();
  auto r2 = [](float v) { return roundf(v * 100.0f) / 100.0f; };
  for (uint8_t i = 0; i < n; i++) {
    JsonObject o = arr.add<JsonObject>();
    o["age"] = now > s[i].t ? now - s[i].t : 0;
    o["temp"] = r2(s[i].temp); o["hum"] = r2(s[i].hum); o["pres"] = r2(s[i].pres);
    o["wind"] = r2(s[i].wind); o["gust"] = r2(s[i].gust); o["dir"] = roundf(s[i].dir);
    o["rain"] = r2(s[i].rain); o["vbat"] = r2(s[i].vbat); o["rssi"] = rssi;
  }
  if (eventCount()) {
    JsonArray ev = doc["events"].to<JsonArray>();
    const Event *list = eventList();
    for (uint8_t i = 0; i < eventCount(); i++) {
      JsonObject o = ev.add<JsonObject>();
      o["kind"] = eventName(list[i].kind);
      o["age"] = now > list[i].t ? now - list[i].t : 0;
      switch (list[i].kind) {
        case EV_BOOT: o["reason"] = list[i].a; o["count"] = list[i].b; o["wake"] = list[i].s; break;
        case EV_OTA_FAIL: o["stage"] = list[i].s; o["http"] = list[i].a; break;
        case EV_OTA_OK: o["version"] = list[i].s; break;
        case EV_BENCH: o["minutes"] = list[i].a; o["ip"] = list[i].s; break;
      }
    }
  }
  String body;
  serializeJson(doc, body);
  return body;
}

PostResult postBatch(const Sample *s, uint8_t n) {
  PostResult res{false, false, {false, "", 0, ""}};
  if (signedMode() && stationId.isEmpty()) { LOG("modo assinado precisa do ID da estacao\n"); return res; }
  const String body = buildBody(s, n);
  const String secret = sha256Hex(deviceKey);
  const String url = serverUrl + "/api/ingest";
  const bool secure = url.startsWith("https://");
  const char *want[] = {"X-Sig"};

  for (int attempt = 0; attempt < 2; attempt++) {
    HTTPClient http;
    WiFiClient plain;
    WiFiClientSecure tls;
    http.setTimeout(cfg.wifiTimeoutS * 1000);
    bool begun;
    if (secure) {
      if (ROOT_CA_PEM) tls.setCACert(ROOT_CA_PEM); else tls.setInsecure();
      begun = http.begin(tls, url);
    } else {
      begun = http.begin(plain, url);
    }
    if (!begun) return res;
    http.collectHeaders(want, 1);
    http.addHeader("Content-Type", "application/json");
    const String usedNonce = signedMode() ? String(rtcNonce) : String("");
    authHeaders(http, body);
    const int code = http.POST(body);
    const String text = code > 0 ? http.getString() : String("");
    const String sig = http.header("X-Sig");
    http.end();
    LOG("POST %d (%u leituras)\n", code, n);

    if (code == 401 && signedMode() && attempt == 0) {
      // nonce velho (primeiro envio, ou a resposta anterior se perdeu): o servidor diz o atual
      JsonDocument d;
      if (!deserializeJson(d, text) && d["nonce"].is<const char *>()) {
        strlcpy(rtcNonce, d["nonce"].as<const char *>(), sizeof(rtcNonce));
        continue;
      }
    }
    if (code != 200) return res;

    // a resposta precisa vir assinada pelo servidor, senão não se confia na configuração nem na atualização
    if (!equalsConst(sig, hmacSha256Hex(secret, usedNonce + "|" + text))) {
      LOG("resposta sem assinatura valida: ignorada\n");
      return res;
    }
    JsonDocument reply;
    if (deserializeJson(reply, text)) return res;
    res.ok = true;
    if (signedMode() && reply["nonce"].is<const char *>()) strlcpy(rtcNonce, reply["nonce"].as<const char *>(), sizeof(rtcNonce));
    if (reply["config"].is<JsonObject>()) res.modeChanged = applyRemoteConfig(reply["config"].as<JsonObjectConst>());
    if (reply["ota"].is<JsonObject>()) {
      res.ota.offered = true;
      res.ota.version = reply["ota"]["version"].as<String>();
      res.ota.size = reply["ota"]["size"] | 0;
      res.ota.sha256 = reply["ota"]["sha256"].as<String>();
    }
    return res;
  }
  return res;
}
