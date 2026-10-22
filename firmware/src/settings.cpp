#include "settings.h"
#include <Preferences.h>

Settings cfg;
String wifiSsid, wifiPass, serverUrl, deviceKey, stationId, claimCode;
float calCx = 0, calCy = 0, calSx = 1, calSy = 1;

static Preferences prefs;

/**
 * Configuração guardada campo a campo (namespace "cfg"). Antes era um bloco de bytes do tamanho da estrutura: qualquer
 * firmware que mudasse a estrutura voltava tudo ao padrão (inclusive os pinos) até o servidor reenviar.
 * Campo que não existe na flash fica com o padrão; campo novo num firmware novo idem.
 */
#define CFG_U8(X)  X(windWindowS, "wwin") X(gustWindowS, "gwin") X(samples, "samp") X(wifiTimeoutS, "wto") X(chargeIntervalMin, "chint") \
  X(benchMin, "bench") X(slowFactor, "slowf") X(sendEvery, "sendn") X(continuousWind, "cont") X(urgentGustKmh, "urg") X(envSensor, "env") \
  X(hasWind, "hwind") X(hasRain, "hrain") \
  X(pinSda, "psda") X(pinScl, "pscl") X(pinWind, "pwind") X(pinRain, "prain") X(pinVbat, "pvbat") X(wifiTxSave, "txs") X(idleEvery, "idle")
#define CFG_F(X)   X(mmPerTip, "mmtip") X(kWind, "kwind") X(dirOffset, "north") X(slowBelowV, "slowv") X(criticalV, "critv") X(chargeAboveV, "chgv")

/** A estrutura do firmware 0.4.x, para ler o bloco antigo uma vez e passar para campo a campo. */
struct SettingsV1 {
  uint16_t intervalMin; uint8_t windWindowS, gustWindowS, samples, wifiTimeoutS;
  float mmPerTip, kWind, dirOffset, slowBelowV, criticalV, chargeAboveV;
  uint8_t chargeIntervalMin, benchMin, slowFactor, sendEvery, continuousWind, urgentGustKmh, envSensor;
  uint8_t pinSda, pinScl, pinWind, pinRain, pinVbat, wifiTxSave;
  uint32_t version;
};

static void loadSettings() {
  Preferences p;
  if (p.begin("cfg", true)) {
    cfg.intervalMin = p.getUShort("int", cfg.intervalMin);
    cfg.version = p.getUInt("ver", cfg.version);
#define RD_U8(f, k) cfg.f = p.getUChar(k, cfg.f);
#define RD_F(f, k) cfg.f = p.getFloat(k, cfg.f);
    CFG_U8(RD_U8) CFG_F(RD_F)
    p.end();
  }
}

void saveSettings() {
  Preferences p;
  p.begin("cfg", false);
  p.putUShort("int", cfg.intervalMin);
  p.putUInt("ver", cfg.version);
#define WR_U8(f, k) p.putUChar(k, cfg.f);
#define WR_F(f, k) p.putFloat(k, cfg.f);
  CFG_U8(WR_U8) CFG_F(WR_F)
  p.end();
}

void loadAll() {
  prefs.begin("meteo", false);
  wifiSsid = prefs.getString("ssid", "");
  wifiPass = prefs.getString("pass", "");
  serverUrl = prefs.getString("server", "");
  deviceKey = prefs.getString("key", "");
  stationId = prefs.getString("sid", "");
  claimCode = prefs.getString("claim", "");
  if (serverUrl.isEmpty()) serverUrl = DEFAULT_SERVER_URL;
  calCx = prefs.getFloat("cx", 0); calCy = prefs.getFloat("cy", 0);
  calSx = prefs.getFloat("sx", 1); calSy = prefs.getFloat("sy", 1);
  // firmware 0.4.x: bloco de bytes; passa para campo a campo e apaga o bloco
  SettingsV1 old;
  const bool legacy = prefs.getBytesLength("cfg") == sizeof(SettingsV1) && prefs.getBytes("cfg", &old, sizeof(old)) == sizeof(old);
  if (prefs.isKey("cfg")) prefs.remove("cfg");
  prefs.end();
  if (legacy) {
    cfg.intervalMin = old.intervalMin; cfg.windWindowS = old.windWindowS; cfg.gustWindowS = old.gustWindowS; cfg.samples = old.samples;
    cfg.wifiTimeoutS = old.wifiTimeoutS; cfg.mmPerTip = old.mmPerTip; cfg.kWind = old.kWind; cfg.dirOffset = old.dirOffset;
    cfg.slowBelowV = old.slowBelowV; cfg.criticalV = old.criticalV; cfg.chargeAboveV = old.chargeAboveV;
    cfg.chargeIntervalMin = old.chargeIntervalMin; cfg.benchMin = old.benchMin; cfg.slowFactor = old.slowFactor; cfg.sendEvery = old.sendEvery;
    cfg.continuousWind = old.continuousWind; cfg.urgentGustKmh = old.urgentGustKmh; cfg.envSensor = old.envSensor;
    cfg.pinSda = old.pinSda; cfg.pinScl = old.pinScl; cfg.pinWind = old.pinWind; cfg.pinRain = old.pinRain; cfg.pinVbat = old.pinVbat;
    cfg.wifiTxSave = old.wifiTxSave; cfg.version = old.version;
    saveSettings();
  } else {
    loadSettings();
  }
}

void saveNetwork() {
  prefs.begin("meteo", false);
  prefs.putString("ssid", wifiSsid); prefs.putString("pass", wifiPass);
  prefs.putString("server", serverUrl); prefs.putString("key", deviceKey); prefs.putString("sid", stationId); prefs.putString("claim", claimCode);
  prefs.end();
}

void saveCalibration(float cx, float cy, float sx, float sy) {
  prefs.begin("meteo", false);
  prefs.putFloat("cx", cx); prefs.putFloat("cy", cy);
  prefs.putFloat("sx", sx); prefs.putFloat("sy", sy);
  prefs.end();
  calCx = cx; calCy = cy; calSx = sx; calSy = sy;
}

bool applyRemoteConfig(JsonObjectConst c) {
  const uint8_t oldMode = cfg.continuousWind;
  cfg.intervalMin = c["interval_min"] | cfg.intervalMin;
  cfg.windWindowS = c["wind_window_s"] | cfg.windWindowS;
  cfg.gustWindowS = c["gust_window_s"] | cfg.gustWindowS;
  cfg.samples = c["samples"] | cfg.samples;
  cfg.wifiTimeoutS = c["wifi_timeout_s"] | cfg.wifiTimeoutS;
  cfg.mmPerTip = c["mm_per_tip"] | cfg.mmPerTip;
  cfg.kWind = c["k_wind"] | cfg.kWind;
  cfg.dirOffset = c["dir_offset"] | cfg.dirOffset;
  cfg.slowBelowV = c["slow_below_v"] | cfg.slowBelowV;
  cfg.slowFactor = c["slow_factor"] | cfg.slowFactor;
  cfg.criticalV = c["critical_v"] | cfg.criticalV;
  cfg.chargeAboveV = c["charge_above_v"] | cfg.chargeAboveV;
  cfg.chargeIntervalMin = constrain((int)(c["charge_interval_min"] | cfg.chargeIntervalMin), 1, 60);
  cfg.benchMin = constrain((int)(c["bench_min"] | cfg.benchMin), 0, 30);
  cfg.sendEvery = constrain((int)(c["send_every"] | cfg.sendEvery), 1, (int)MAX_BATCH);
  cfg.continuousWind = c["continuous_wind"] | cfg.continuousWind;
  cfg.urgentGustKmh = c["urgent_gust_kmh"] | cfg.urgentGustKmh;
  cfg.wifiTxSave = c["wifi_tx_save"] | cfg.wifiTxSave;
  cfg.idleEvery = constrain((int)(c["idle_every"] | cfg.idleEvery), 1, 12);
  cfg.envSensor = constrain((int)(c["env_sensor"] | cfg.envSensor), 0, 3);
  cfg.hasWind = constrain((int)(c["has_wind"] | cfg.hasWind), 0, 1);
  cfg.hasRain = constrain((int)(c["has_rain"] | cfg.hasRain), 0, 1);
  // pinos: só aceita um conjunto válido; qualquer mudança reinicia a placa para religar interrupções e I2C nos pinos novos
  const int sda = c["pin_sda"] | cfg.pinSda, scl = c["pin_scl"] | cfg.pinScl, wind = c["pin_wind"] | cfg.pinWind;
  const int rain = c["pin_rain"] | cfg.pinRain, vbat = c["pin_vbat"] | cfg.pinVbat;
  bool pinsChanged = false;
  if (pinsValid(sda, scl, wind, rain, vbat)) {
    pinsChanged = sda != cfg.pinSda || scl != cfg.pinScl || wind != cfg.pinWind || rain != cfg.pinRain || vbat != cfg.pinVbat;
    cfg.pinSda = sda; cfg.pinScl = scl; cfg.pinWind = wind; cfg.pinRain = rain; cfg.pinVbat = vbat;
  }
  cfg.version = c["version"] | cfg.version;
  saveSettings();
  return cfg.continuousWind != oldMode || pinsChanged;
}
