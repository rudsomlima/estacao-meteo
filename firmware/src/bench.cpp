#include "bench.h"
#include <ArduinoJson.h>
#include <ESPmDNS.h>
#include <WebServer.h>
#include <WiFi.h>
#include "config.h"
#include "console.h"
#include "events.h"
#include "log.h"
#include "net.h"
#include "sensors.h"
#include "settings.h"
#include "wind.h"

static const char PAGE[] PROGMEM = R"HTML(<!doctype html><html lang="pt-BR"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Modo bancada</title>
<style>
body{margin:0;font:16px system-ui,sans-serif;background:#0b1012;color:#f4f6f7;padding:16px;max-width:520px}
h1{font-size:22px;margin:0 0 2px}small,p{color:#9ca9b0;font-size:13px}
.g{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:14px 0}
.c{background:#0e1417;border:1px solid #1d2529;border-radius:12px;padding:10px}
.c b{display:block;font:600 22px ui-monospace,monospace}.c span{color:#9ca9b0;font-size:12px}
button{font:600 15px system-ui;padding:12px;border-radius:10px;border:0;background:#2563eb;color:#fff;width:100%;margin:4px 0}
button.s{background:#1d2529}#m{margin:10px 0;min-height:20px;color:#7dd3fc}
</style>
<h1>Modo bancada</h1><small id="t">conectando...</small>
<div class="g">
<div class="c"><span>Vento</span><b id="w">-</b></div><div class="c"><span>Rajada (10 s)</span><b id="g">-</b></div>
<div class="c"><span>Direcao</span><b id="d">-</b></div><div class="c"><span>Chuva (basculadas)</span><b id="r">-</b></div>
<div class="c"><span>Temperatura</span><b id="T">-</b></div><div class="c"><span>Umidade</span><b id="H">-</b></div>
<div class="c"><span>Pressao</span><b id="P">-</b></div><div class="c"><span>Bateria</span><b id="V">-</b></div>
</div>
<div id="m"></div>
<button id="c1" onclick="cal()">Calibrar a biruta: comecar</button>
<button class="s" onclick="north()">Mostrar o angulo do norte</button>
<button class="s" onclick="fin()">Terminar o modo bancada</button>
<p>Calibrar: toque em comecar, gire a biruta 360 graus devagar duas vezes e toque de novo. Norte: aponte a biruta para o norte e toque.
O numero do norte vai em Configuracoes &gt; Ajuste do norte da biruta, no site.</p>
<script>
let rec=false;const $=i=>document.getElementById(i);
async function L(){try{const j=await (await fetch('/api/live')).json();
$('w').textContent=j.wind.toFixed(1)+' m/s';$('g').textContent=j.gust.toFixed(1)+' m/s';
$('d').textContent=j.dir_ok?Math.round(j.dir)+'°':'-';$('r').textContent=j.rain;
$('T').textContent=j.temp.toFixed(1)+'°C';$('H').textContent=Math.round(j.hum)+'%';
$('P').textContent=j.pres.toFixed(0)+' hPa';$('V').textContent=j.vbat.toFixed(2)+' V';
$('t').textContent=j.name+' · faltam '+Math.ceil(j.left_s/60)+' min';rec=j.rec;
$('c1').textContent=rec?'Calibrar a biruta: terminar':'Calibrar a biruta: comecar';}catch(e){$('t').textContent='sem conexao'}}
async function post(u){const r=await fetch(u,{method:'POST'});return r.json()}
async function cal(){const j=await post(rec?'/api/cal/finish':'/api/cal/start');$('m').textContent=j.msg||''}
async function north(){$('m').textContent='lendo por 3 s...';const j=await (await fetch('/api/north')).json();$('m').textContent=j.msg}
async function fin(){await post('/api/end');$('m').textContent='Encerrado. A estacao segue a rotina.'}
setInterval(L,1000);L();
</script></html>)HTML";

static WebServer server(80);
static volatile uint32_t benchWind = 0;
static volatile int64_t benchLastUs = 0;
static bool endNow = false;
static bool recording = false;
static int16_t mnx, mxx, mny, mxy;

static void IRAM_ATTR isrBenchWind() {
  const int64_t now = esp_timer_get_time();
  if (now - benchLastUs > 2000) { benchWind = benchWind + 1; benchLastUs = now; }
}

// valores ao vivo
static float liveWind = 0, liveGust = 0, liveDir = 0, liveTemp = 0, liveHum = 0, livePres = 0, liveV = 0;
static bool liveDirOk = false;
static double ex = 0, ey = 0;  // média móvel dos vetores unitários da biruta
static uint32_t secBuckets[10] = {0};
static uint8_t secIdx = 0;

static float angleFromVector(double x, double y) {
  const float raw = atan2f((float)y, (float)x) * 180.0f / PI;
  return fmodf(DIR_SIGN * raw - cfg.dirOffset + 720.0f, 360.0f);
}

static void handleLive(uint32_t leftS) {
  JsonDocument d;
  d["name"] = stationId.isEmpty() ? String("estacao") : stationId;
  d["wind"] = liveWind; d["gust"] = liveGust; d["dir"] = liveDir; d["dir_ok"] = liveDirOk;
  d["rain"] = rtcRainTips; d["temp"] = liveTemp; d["hum"] = liveHum; d["pres"] = livePres; d["vbat"] = liveV;
  d["rec"] = recording; d["left_s"] = leftS;
  String out;
  serializeJson(d, out);
  server.send(200, "application/json", out);
}

static void reply(const String &msg, bool ok = true) {
  JsonDocument d;
  d["ok"] = ok;
  d["msg"] = msg;
  String out;
  serializeJson(d, out);
  server.send(ok ? 200 : 409, "application/json", out);
}

void benchRun(uint8_t minutes) {
  if (minutes == 0 || WiFi.status() != WL_CONNECTED) return;
  setCpuFrequencyMhz(160);

  uint8_t mac[6];
  WiFi.macAddress(mac);
  char host[24];
  snprintf(host, sizeof(host), "estacao-%02x%02x", mac[4], mac[5]);
  const bool mdns = MDNS.begin(host);
  const String ip = WiFi.localIP().toString();
  Console.printf("Modo bancada por %u min: http://%s.local ou http://%s\n", minutes, host, ip.c_str());
  pushEvent(EV_BENCH, minutes, 0, ip.c_str());

  const bool magOk = qmcStart();
  rainAttach();
  attachInterrupt(digitalPinToInterrupt(PIN_WIND), isrBenchWind, FALLING);
  benchWind = 0;
  endNow = false;
  recording = false;
  ex = ey = 0;
  memset(secBuckets, 0, sizeof(secBuckets));

  const uint32_t endAt = millis() + (uint32_t)minutes * 60000UL;
  auto leftS = [&]() -> uint32_t { return millis() >= endAt ? 0 : (endAt - millis()) / 1000; };

  server.on("/", HTTP_GET, []() { server.send_P(200, "text/html", PAGE); });
  server.on("/api/live", HTTP_GET, [&]() { handleLive(leftS()); });
  server.on("/api/cal/start", HTTP_POST, [&]() {
    if (!magOk) return reply("QMC5883L nao respondeu (0x0D).", false);
    mnx = mny = 32767; mxx = mxy = -32768;
    recording = true;
    reply("Gravando: gire a biruta 360 graus, duas vezes, e toque em terminar.");
  });
  server.on("/api/cal/finish", HTTP_POST, [&]() {
    recording = false;
    const float rx = (mxx - mnx) / 2.0f, ry = (mxy - mny) / 2.0f;
    if (rx < 20 || ry < 20) return reply("Sinal fraco demais. Aproxime o ima ou use a faixa de 8 G.", false);
    const float m = (rx + ry) / 2.0f;
    saveCalibration((mxx + mnx) / 2.0f, (mxy + mny) / 2.0f, m / rx, m / ry);
    reply("Calibrado (raio X " + String((int)rx) + ", Y " + String((int)ry) + "). Agora mostre o angulo do norte.");
  });
  server.on("/api/north", HTTP_GET, [&]() {
    if (!magOk) return reply("QMC5883L nao respondeu (0x0D).", false);
    double sx = 0, sy = 0;
    int n = 0;
    const uint32_t t0 = millis();
    while (millis() - t0 < 3000) {
      double ux, uy;
      if (magVector(ux, uy)) { sx += ux; sy += uy; n++; }
      delay(40);
    }
    if (n < 3) return reply("Sem leitura da biruta.", false);
    const float a = fmodf(DIR_SIGN * atan2f((float)sy, (float)sx) * 180.0f / PI + 360.0f, 360.0f);
    reply("Digite " + String((int)lroundf(a)) + " em Ajuste do norte da biruta, no site.");
  });
  server.on("/api/end", HTTP_POST, [&]() { endNow = true; reply("ok"); });
  server.begin();

  uint32_t lastSec = millis(), lastSlow = 0, lastWind = 0;
  while (!endNow && millis() < endAt) {
    server.handleClient();

    int16_t x, y;
    if (magOk && qmcRead(x, y)) {
      if (recording) { mnx = min(mnx, x); mxx = max(mxx, x); mny = min(mny, y); mxy = max(mxy, y); }
      const float bx = (x - calCx) * calSx, by = (y - calCy) * calSy, m = sqrtf(bx * bx + by * by);
      if (m > 1) {
        ex = ex * 0.8 + (bx / m) * 0.2;
        ey = ey * 0.8 + (by / m) * 0.2;
        liveDir = angleFromVector(ex, ey);
        liveDirOk = true;
      }
    }

    const uint32_t now = millis();
    if (now - lastSec >= 1000) {  // um balde por segundo: velocidade (média de 3 s) e rajada (maior de 10 s)
      lastSec = now;
      const uint32_t total = benchWind;
      secBuckets[secIdx] = total - lastWind;
      lastWind = total;
      secIdx = (secIdx + 1) % 10;
      uint32_t three = 0, best = 0;
      for (int i = 1; i <= 3; i++) three += secBuckets[(secIdx + 10 - i) % 10];
      for (int i = 0; i < 10; i++) best = max(best, secBuckets[i]);
      liveWind = cfg.kWind * (three / 3.0f);
      liveGust = cfg.kWind * best;
    }
    if (now - lastSlow >= 2000) {
      lastSlow = now;
      const Env e = readEnv(1);
      if (e.ok) { liveTemp = e.t; liveHum = e.h; livePres = e.p; }
      liveV = batteryVolts();
    }
    delay(5);
  }

  server.stop();
  if (mdns) MDNS.end();
  detachInterrupt(digitalPinToInterrupt(PIN_WIND));
  qmcStop();
  recording = false;
  Console.println("Modo bancada encerrado.");
}
