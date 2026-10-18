#include "usblink.h"
#include <ArduinoJson.h>
#include "config.h"
#include "sensors.h"
#include "settings.h"

static void reply(JsonDocument &d) {
  serializeJson(d, Serial);
  Serial.println();
}

static void fail(const char *why) {
  JsonDocument d;
  d["ok"] = false;
  d["error"] = why;
  reply(d);
}

/** Trata uma linha recebida. Devolve true se ela era um comando (para o menu serial saber que o site está ali). */
bool usbHandleLine(const String &line) {
  JsonDocument in;
  if (deserializeJson(in, line)) { fail("json"); return true; }
  const String cmd = in["cmd"] | "";

  if (cmd == "hello") {
    JsonDocument d;
    d["ok"] = true;
    d["app"] = "estacao-meteo";
    d["fw"] = FW_VERSION;
    d["chip"] = ESP.getChipModel();
    d["mac"] = String((uint32_t)(ESP.getEfuseMac() >> 24), HEX);
    d["id"] = stationId;
    d["server"] = serverUrl;
    d["ssid"] = wifiSsid;
    d["hasKey"] = !deviceKey.isEmpty();
    d["provisioned"] = !wifiSsid.isEmpty() && !serverUrl.isEmpty() && (!deviceKey.isEmpty() || !claimCode.isEmpty());
    d["vbat"] = batteryVolts();
    reply(d);
  } else if (cmd == "provision") {
    const String ssid = in["ssid"] | "", pass = in["pass"] | "", server = in["server"] | "", id = in["id"] | "", key = in["key"] | "";
    if (ssid.isEmpty() || ssid.length() > 32) { fail("ssid"); return true; }
    if (pass.length() > 63) { fail("senha"); return true; }
    if (!(server.startsWith("https://") || server.startsWith("http://")) || server.length() > 120) { fail("servidor"); return true; }
    if (key.length() < 8 || key.length() > 80) { fail("chave"); return true; }
    if (server.startsWith("http://") && id.isEmpty()) { fail("id"); return true; }
    wifiSsid = ssid; wifiPass = pass; serverUrl = server; stationId = id; deviceKey = key;
    // sem barra final, como o portal faz
    while (serverUrl.endsWith("/")) serverUrl.remove(serverUrl.length() - 1);
    saveNetwork();
    JsonDocument d;
    d["ok"] = true;
    d["restarting"] = true;
    reply(d);
    Serial.flush();
    delay(300);
    ESP.restart();
  } else if (cmd == "restart") {
    JsonDocument d;
    d["ok"] = true;
    reply(d);
    Serial.flush();
    delay(200);
    ESP.restart();
  } else {
    fail("comando");
  }
  return true;
}
