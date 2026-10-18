#include "net.h"
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>
#include <sys/time.h>
#include "config.h"
#include "log.h"
#include "settings.h"

// Cole aqui o certificado raiz do seu servidor (PEM) para validar o HTTPS. Vazio = não valida.
static const char *ROOT_CA_PEM = nullptr;

// Conexão rápida: guardados na memória RTC entre os ciclos.
RTC_DATA_ATTR static uint8_t rtcBssid[6];
RTC_DATA_ATTR static int32_t rtcChannel = 0;
RTC_DATA_ATTR static uint32_t rtcIp = 0, rtcGw = 0, rtcMask = 0, rtcDns = 0;

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
  WiFiManagerParameter pServer("server", "Endereco do site (https://...)", serverUrl.c_str(), 120);
  WiFiManagerParameter pKey("key", "Chave do dispositivo", deviceKey.c_str(), 64);
  wm.addParameter(&pServer);
  wm.addParameter(&pKey);
  wm.setConfigPortalTimeout(PORTAL_TIMEOUT_S);
  wm.setClass("invert");
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char ap[32];
  snprintf(ap, sizeof(ap), "EstacaoMeteo-%02X%02X", mac[4], mac[5]);
  const bool ok = wm.startConfigPortal(ap);
  if (ok) {
    wifiSsid = WiFi.SSID(); wifiPass = WiFi.psk();
    serverUrl = pServer.getValue(); deviceKey = pKey.getValue();
    while (serverUrl.endsWith("/")) serverUrl.remove(serverUrl.length() - 1);
    saveNetwork();
  }
  return ok;
}

void netOff() {
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
}

int netRssi() { return WiFi.RSSI(); }

PostResult postBatch(const Sample *s, uint8_t n) {
  PostResult res{false, false};
  const uint32_t now = (uint32_t)time(nullptr);
  const int rssi = WiFi.RSSI();

  JsonDocument doc;
  doc["cfg"] = cfg.version;
  JsonArray arr = doc["batch"].to<JsonArray>();
  auto r2 = [](float v) { return roundf(v * 100.0f) / 100.0f; };
  for (uint8_t i = 0; i < n; i++) {
    JsonObject o = arr.add<JsonObject>();
    o["age"] = now > s[i].t ? now - s[i].t : 0;
    o["temp"] = r2(s[i].temp); o["hum"] = r2(s[i].hum); o["pres"] = r2(s[i].pres);
    o["wind"] = r2(s[i].wind); o["gust"] = r2(s[i].gust); o["dir"] = roundf(s[i].dir);
    o["rain"] = r2(s[i].rain); o["vbat"] = r2(s[i].vbat); o["rssi"] = rssi;
  }
  String body;
  serializeJson(doc, body);

  const String url = serverUrl + "/api/ingest";
  HTTPClient http;
  WiFiClient plain;
  WiFiClientSecure tls;
  http.setTimeout(cfg.wifiTimeoutS * 1000);
  bool begun;
  if (url.startsWith("https://")) {
    if (ROOT_CA_PEM) tls.setCACert(ROOT_CA_PEM); else tls.setInsecure();
    begun = http.begin(tls, url);
  } else {
    begun = http.begin(plain, url);
  }
  if (!begun) return res;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", deviceKey);
  const int code = http.POST(body);
  LOG("POST %d (%u leituras)\n", code, n);
  if (code == 200) {
    res.ok = true;
    JsonDocument reply;
    if (!deserializeJson(reply, http.getString()) && reply["config"].is<JsonObject>())
      res.modeChanged = applyRemoteConfig(reply["config"].as<JsonObjectConst>());
  }
  http.end();
  return res;
}
