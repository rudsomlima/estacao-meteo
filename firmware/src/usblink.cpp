#include "usblink.h"
#include <ArduinoJson.h>
#include <WiFi.h>
#include "config.h"
#include "console.h"
#include "log.h"
#include "sensors.h"
#include "settings.h"

volatile bool usbSendNow = false;

bool usbPlugged() {
  // o detector de SOF (pacote que o computador manda a cada 1 ms) leva alguns ms para se firmar depois de ligar
  if (millis() < 60) delay(60 - millis());
  return Console.isPlugged();
}

void usbOpen() {
  static bool opened = false;
  if (!opened) {
    Console.setRxBufferSize(2048);  // a configuração inteira vem numa linha de ~600 bytes
    Console.begin();
    Console.setTxTimeoutMs(50);  // sem ninguém lendo a porta, o log não pode travar o ciclo
    opened = true;
  }
  logOn = true;
}

bool usbPoll() {
  if (!Console.available() || Console.peek() != '{') return false;  // outros caracteres ficam para quem os espera
  String line;
  const uint32_t s = millis();
  while (millis() - s < 1500) {
    if (!Console.available()) { delay(2); continue; }
    const char ch = Console.read();
    if (ch == '\n' || ch == '\r') break;
    if (line.length() < 1800) line += ch;
  }
  usbHandleLine(line);
  return true;
}

static void reply(JsonDocument &d) {
  serializeJson(d, Console);
  Console.println();
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
    d["usb"] = true;
    reply(d);
  } else if (cmd == "provision") {
    const String ssid = in["ssid"] | "", pass = in["pass"] | "", server = in["server"] | "", id = in["id"] | "", key = in["key"] | "";
    if (ssid.isEmpty() || ssid.length() > 32) { fail("ssid"); return true; }
    if (pass.length() > 63) { fail("senha"); return true; }
    if (!(server.startsWith("https://") || server.startsWith("http://")) || server.length() > 120) { fail("servidor"); return true; }
    if (key.length() < 8 || key.length() > 80) { fail("chave"); return true; }
    if (server.startsWith("http://") && id.isEmpty()) { fail("id"); return true; }
    wifiSsid = ssid; wifiPass = pass; serverUrl = server; stationId = id; deviceKey = key;
    claimCode = "";  // a chave que veio da USB vale mais que um código de pareamento antigo
    // sem barra final, como o portal faz
    while (serverUrl.endsWith("/")) serverUrl.remove(serverUrl.length() - 1);
    saveNetwork();
    JsonDocument d;
    d["ok"] = true;
    d["restarting"] = true;
    reply(d);
    Console.flush();
    delay(300);
    ESP.restart();
  } else if (cmd == "scan") {
    // redes Wi-Fi por perto, para o site oferecer uma lista em vez de pedir o nome da rede
    WiFi.mode(WIFI_STA);
    WiFi.disconnect();
    const int n = WiFi.scanNetworks(false, false);
    JsonDocument d;
    d["ok"] = true;
    JsonArray arr = d["networks"].to<JsonArray>();
    for (int i = 0; i < n && arr.size() < 12; i++) {  // o resultado já vem ordenado por sinal
      const String name = WiFi.SSID(i);
      if (name.isEmpty()) continue;
      bool dup = false;
      for (JsonObject o : arr) if (name == o["s"].as<String>()) dup = true;
      if (dup) continue;
      JsonObject o = arr.add<JsonObject>();
      o["s"] = name;
      o["r"] = WiFi.RSSI(i);
      o["open"] = WiFi.encryptionType(i) == WIFI_AUTH_OPEN;
    }
    WiFi.scanDelete();
    WiFi.mode(WIFI_OFF);
    reply(d);
  } else if (cmd == "config") {
    // a mesma configuração que o servidor entrega na resposta do envio, aplicada na hora pelo cabo
    if (!in["config"].is<JsonObject>()) { fail("config"); return true; }
    const bool restart = applyRemoteConfig(in["config"].as<JsonObjectConst>());  // true: mudou o modo do vento ou um pino
    JsonDocument d;
    d["ok"] = true;
    d["version"] = cfg.version;
    d["restarting"] = restart;
    reply(d);
    if (restart) {
      Console.flush();
      delay(300);
      ESP.restart();
    }
    usbSendNow = true;  // sem reiniciar: sai da espera, mede e envia já
  } else if (cmd == "restart") {
    JsonDocument d;
    d["ok"] = true;
    reply(d);
    Console.flush();
    delay(200);
    ESP.restart();
  } else {
    fail("comando");
  }
  return true;
}
