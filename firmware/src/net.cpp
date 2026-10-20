#include "net.h"
#include <ArduinoJson.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>
#include <Preferences.h>
#include <sys/time.h>
#include "auth.h"
#include "config.h"
#include "events.h"
#include "log.h"
#include "sensors.h"
#include "settings.h"

#include "roots.h"  // autoridades raiz para validar o HTTPS (gerado por tools/make_roots.py)

// Conexão rápida e nonce do modo assinado: guardados na memória RTC entre os ciclos.
RTC_DATA_ATTR static uint8_t rtcBssid[6];
RTC_DATA_ATTR static int32_t rtcChannel = 0;
RTC_DATA_ATTR static uint32_t rtcIp = 0, rtcGw = 0, rtcMask = 0, rtcDns = 0;
RTC_DATA_ATTR static char rtcNonce[24] = "";
RTC_DATA_ATTR static int8_t rtcRssi = 0;        // sinal da última conexão (0 = desconhecido)
RTC_DATA_ATTR static uint8_t rtcTxHold = 0;     // conexões seguintes na potência máxima, depois de uma falha com potência reduzida

static bool waitConnected(uint32_t ms) {
  const uint32_t t = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t < ms) delay(20);
  return WiFi.status() == WL_CONNECTED;
}

/**
 * Potência de transmissão. Com `wifiTxSave` ligado escolhe pelo sinal da última conexão: quanto mais forte, menos potência.
 * Sem histórico, com sinal fraco ou logo depois de uma falha, usa a máxima. O RSSI é o que a estação ouve do roteador, e o
 * caminho de volta tende a ser parecido; por isso as faixas têm folga.
 */
static wifi_power_t pickTxPower() {
  if (!cfg.wifiTxSave || rtcRssi == 0 || rtcTxHold > 0) return WIFI_POWER_19_5dBm;
  if (rtcRssi >= -50) return WIFI_POWER_8_5dBm;
  if (rtcRssi >= -60) return WIFI_POWER_11dBm;
  if (rtcRssi >= -70) return WIFI_POWER_15dBm;
  return WIFI_POWER_19_5dBm;
}

bool wifiConnect(uint32_t timeoutMs) {
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  const wifi_power_t tx = pickTxPower();
  WiFi.setTxPower(tx);
  if (rtcTxHold > 0) rtcTxHold--;
  LOG("wifi: potencia %d (x0,25 dBm)\n", (int)WiFi.getTxPower());
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
  if (!ok && tx != WIFI_POWER_19_5dBm) {  // a potência reduzida não bastou: volta à máxima e só tenta reduzir depois de alguns envios
    rtcTxHold = 6;
    WiFi.disconnect();
    WiFi.setTxPower(WIFI_POWER_19_5dBm);
    WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());
    ok = waitConnected(timeoutMs);
    LOG("wifi: potencia reduzida falhou, tentando na maxima: %s\n", ok ? "ok" : "falhou");
  }
  if (ok) {
    rtcRssi = (int8_t)WiFi.RSSI();
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
  // no topo do formulário: qual estação é esta e qual firmware ela roda
  char infoBuf[200];
  snprintf(infoBuf, sizeof(infoBuf), "<p style='margin:0 0 12px'><b>Esta&ccedil;&atilde;o %s</b> &middot; firmware %s<br><small>Escolha a rede e informe o c&oacute;digo de pareamento (gerado no site) ou, no avan&ccedil;ado, o ID e a chave.</small></p>",
           stationId.isEmpty() ? "nova" : stationId.c_str(), FW_VERSION);
  WiFiManagerParameter pInfo(infoBuf);
  wm.addParameter(&pInfo);
  wm.addParameter(&pCode);
  wm.addParameter(&pServer);
  wm.addParameter(&pId);
  wm.addParameter(&pKey);
  wm.addParameter(&pBench);
  wm.setConfigPortalTimeout(PORTAL_TIMEOUT_S);
  wm.setClass("invert");
  wm.setTitle("Esta&ccedil;&atilde;o Meteo");
  std::vector<const char *> menu = {"wifi", "info", "exit"};  // só o que interessa a quem está configurando
  wm.setMenu(menu);
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

// ---------------- HTTPS: valida o certificado, e a conexão é reaproveitada dentro da mesma acordada ----------------
// Os clientes ficam vivos entre os pedidos de um envio (lote, confirmação da configuração): o aperto de mão TLS, que é o
// trecho mais longo com o rádio ligado, acontece uma vez só. netOff() os fecha.
const char *rootCAs() { return ROOT_CAS; }

static WiFiClientSecure tlsClient;
static WiFiClient plainClient;
static bool tlsReady = false;
static bool tlsStrict = true;      // valida o certificado; cai para sem validação só se a validação falhar (veja tlsFallback)
static bool tlsWarned = false;     // o evento "tls" vai uma vez por boot

static void tlsSetup(bool strict) {
  if (tlsReady && strict == tlsStrict) return;
  tlsClient.stop();
  if (strict) tlsClient.setCACert(ROOT_CAS); else tlsClient.setInsecure();
  tlsStrict = strict;
  tlsReady = true;
}

/**
 * A validação falhou (a Cloudflare trocou de autoridade, ou a rede intercepta o HTTPS). Os envios seguem sem validar porque
 * vão assinados (a chave não viaja e a resposta é conferida pela assinatura), e o site fica sabendo pelo evento "tls".
 */
static bool tlsFallback(int code) {
  if (!tlsStrict || code >= 0) return false;
  char why[64] = "";
  tlsClient.lastError(why, sizeof(why));
  LOG("HTTPS: certificado nao validado (%s): seguindo sem validar, com os pedidos assinados\n", why);
  if (!tlsWarned) { pushEvent(EV_TLS, code, 0, "sem_validacao"); tlsWarned = true; }
  tlsSetup(false);
  return true;
}

bool claimKey() {
  if (claimCode.isEmpty()) return true;
  if (!serverUrl.startsWith("https://")) { LOG("pareamento exige https:// (a chave viaja na resposta)\n"); return false; }
  // a chave volta na resposta: aqui o certificado TEM de ser válido (sem plano B)
  WiFiClientSecure tls;
  tls.setCACert(ROOT_CAS);
  HTTPClient http;
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
  tlsClient.stop();
  plainClient.stop();
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
}

int netRssi() { return WiFi.RSSI(); }

/**
 * Pedidos assinados (HMAC com nonce): a chave nunca viaja. É o modo sempre que a estação sabe o próprio ID (pela USB ou
 * pelo pareamento); sem ID só em http:// não dá, e em https:// sem ID a chave vai no cabeçalho, como nas placas antigas.
 */
bool signedMode() { return !stationId.isEmpty() || serverUrl.startsWith("http://"); }

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
    case EV_TLS: return "tls";
  }
  return "info";
}

/**
 * O servidor aceita o formato em colunas? Ele avisa na resposta ("fmt": 2) e a placa guarda isso. Até saber, e se o servidor
 * recusar (voltou a uma versão antiga), usa o formato antigo: assim um firmware novo nunca para de enviar por causa do servidor.
 */
static int8_t colsState = -1;  // -1 ainda não leu da flash
static bool columnsOk() {
  if (colsState < 0) {
    Preferences p;
    p.begin("meteo", true);
    colsState = p.getBool("fmt2", false) ? 1 : 0;
    p.end();
  }
  return colsState == 1;
}
static void setColumns(bool ok) {
  if (columnsOk() == ok) return;
  colsState = ok ? 1 : 0;
  Preferences p;
  p.begin("meteo", false);
  p.putBool("fmt2", ok);
  p.end();
  LOG("servidor %s o envio em colunas\n", ok ? "aceita" : "nao aceita");
}

/**
 * Corpo do envio. Em colunas (formato 2): cada medida é uma lista, uma posição por leitura; bateria e sinal vão uma vez (o sinal
 * é o mesmo para o lote inteiro); medida que não existe vai como null (umidade sem o sensor, direção sem a biruta). Com 3
 * leituras fica com cerca de 40% do formato antigo, que é uma lista de objetos com os nomes repetidos.
 */
static String buildBody(const Sample *s, uint8_t n, bool columns) {
  const uint32_t now = (uint32_t)time(nullptr);
  JsonDocument doc;
  if (columns) doc["v"] = 2;
  doc["cfg"] = cfg.version;
  doc["fw"] = FW_VERSION;
  // bateria e sinal vão sempre, mesmo sem leitura de sensor: o site mostra a placa viva
  doc["vbat"] = roundf(batteryVolts() * 100.0f) / 100.0f;
  doc["rssi"] = WiFi.RSSI();
  auto col = [&](const char *k, int digits, float Sample::*f) {
    JsonArray a = doc[k].to<JsonArray>();
    const float m = digits == 0 ? 1 : digits == 1 ? 10 : 100;
    for (uint8_t i = 0; i < n; i++) {
      const float v = s[i].*f;
      if (isnan(v)) a.add(nullptr);
      else a.add(roundf(v * m) / m);
    }
  };
  if (columns) {
    JsonArray age = doc["t"].to<JsonArray>();
    for (uint8_t i = 0; i < n; i++) age.add(now > s[i].t ? now - s[i].t : 0);
    col("temp", 1, &Sample::temp);
    col("hum", 0, &Sample::hum);
    col("pres", 1, &Sample::pres);
    col("wind", 1, &Sample::wind);
    col("gust", 1, &Sample::gust);
    col("dir", 0, &Sample::dir);
    col("rain", 2, &Sample::rain);
    col("vb", 2, &Sample::vbat);
  } else {
    // formato antigo, para servidores que ainda não aceitam colunas (eles exigem a direção: sem biruta vai 0)
    JsonArray arr = doc["batch"].to<JsonArray>();
    const int rssi = WiFi.RSSI();
    auto r2 = [](float v) { return roundf(v * 100.0f) / 100.0f; };
    for (uint8_t i = 0; i < n; i++) {
      JsonObject o = arr.add<JsonObject>();
      o["age"] = now > s[i].t ? now - s[i].t : 0;
      o["temp"] = r2(s[i].temp); if (!isnan(s[i].hum)) o["hum"] = r2(s[i].hum); o["pres"] = r2(s[i].pres);
      o["wind"] = r2(s[i].wind); o["gust"] = r2(s[i].gust); o["dir"] = isnan(s[i].dir) ? 0 : roundf(s[i].dir);
      o["rain"] = r2(s[i].rain); o["vbat"] = r2(s[i].vbat); o["rssi"] = rssi;
    }
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
        case EV_TLS: o["stage"] = list[i].s; o["code"] = list[i].a; break;
      }
    }
  }
  String body;
  serializeJson(doc, body);
  return body;
}

String previewBody(const Sample *s, uint8_t n, bool columns) { return buildBody(s, n, columns); }

PostResult postBatch(const Sample *s, uint8_t n) {
  PostResult res{false, false, {false, "", 0, ""}, "", false};
  if (signedMode() && stationId.isEmpty()) { LOG("modo assinado precisa do ID da estacao\n"); return res; }
  bool columns = columnsOk();
  String body = buildBody(s, n, columns);
  const String secret = sha256Hex(deviceKey);
  const String url = serverUrl + "/api/ingest";
  const bool secure = url.startsWith("https://");
  const char *want[] = {"X-Sig"};
  if (secure) tlsSetup(tlsStrict);

  for (int attempt = 0; attempt < 3; attempt++) {
    HTTPClient http;
    http.setReuse(true);  // a mesma conexão serve ao lote e à confirmação que vem logo depois
    http.setTimeout(cfg.wifiTimeoutS * 1000);
    const bool begun = secure ? http.begin(tlsClient, url) : http.begin(plainClient, url);
    if (!begun) return res;
    http.collectHeaders(want, 1);
    http.addHeader("Content-Type", "application/json");
    const String usedNonce = signedMode() ? String(rtcNonce) : String("");
    authHeaders(http, body);
    const int code = http.POST(body);
    const String text = code > 0 ? http.getString() : String("");
    const String sig = http.header("X-Sig");
    http.end();
    LOG("POST %d (%u leituras, %u bytes)\n", code, n, body.length());

    if (secure && tlsFallback(code)) continue;  // certificado não validado: tenta de novo sem validar (o pedido é assinado)
    if (code == 401 && signedMode()) {
      // nonce velho (primeiro envio, ou a resposta anterior se perdeu): o servidor diz o atual
      JsonDocument d;
      if (!deserializeJson(d, text) && d["nonce"].is<const char *>() && strcmp(rtcNonce, d["nonce"].as<const char *>()) != 0) {
        strlcpy(rtcNonce, d["nonce"].as<const char *>(), sizeof(rtcNonce));
        continue;
      }
    }
    if (code == 422 && columns) {  // o servidor não entendeu as colunas: volta ao formato antigo e tenta de novo
      setColumns(false);
      columns = false;
      body = buildBody(s, n, false);
      continue;
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
    if ((reply["fmt"] | 0) >= 2) setColumns(true);  // o servidor aceita colunas: o próximo envio já vai assim
    if (signedMode() && reply["nonce"].is<const char *>()) strlcpy(rtcNonce, reply["nonce"].as<const char *>(), sizeof(rtcNonce));
    if (reply["config"].is<JsonObject>()) { res.modeChanged = applyRemoteConfig(reply["config"].as<JsonObjectConst>()); res.cfgApplied = true; }
    if (reply["cmd"].is<const char *>()) res.cmd = reply["cmd"].as<String>();
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
