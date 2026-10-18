#include "settings.h"
#include <Preferences.h>

Settings cfg;
String wifiSsid, wifiPass, serverUrl, deviceKey, stationId, claimCode;
float calCx = 0, calCy = 0, calSx = 1, calSy = 1;

static Preferences prefs;

void loadAll() {
  prefs.begin("meteo", true);
  wifiSsid = prefs.getString("ssid", "");
  wifiPass = prefs.getString("pass", "");
  serverUrl = prefs.getString("server", "");
  deviceKey = prefs.getString("key", "");
  stationId = prefs.getString("sid", "");
  claimCode = prefs.getString("claim", "");
  if (serverUrl.isEmpty()) serverUrl = DEFAULT_SERVER_URL;
  calCx = prefs.getFloat("cx", 0); calCy = prefs.getFloat("cy", 0);
  calSx = prefs.getFloat("sx", 1); calSy = prefs.getFloat("sy", 1);
  if (prefs.getBytesLength("cfg") == sizeof(Settings)) prefs.getBytes("cfg", &cfg, sizeof(Settings));
  prefs.end();
}

void saveSettings() {
  prefs.begin("meteo", false);
  prefs.putBytes("cfg", &cfg, sizeof(Settings));
  prefs.end();
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
  cfg.version = c["version"] | cfg.version;
  saveSettings();
  return cfg.continuousWind != oldMode;
}
