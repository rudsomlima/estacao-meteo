#pragma once
// GERADO por tools/gen_schema.py a partir de shared/board-schema.json. Não edite à mão.

constexpr auto SCH_DEF_interval_min = 10;
constexpr auto SCH_DEF_wind_window_s = 8;
constexpr auto SCH_DEF_gust_window_s = 3;
constexpr auto SCH_DEF_samples = 8;
constexpr auto SCH_DEF_wifi_timeout_s = 10;
constexpr auto SCH_DEF_mm_per_tip = 0.2f;
constexpr auto SCH_DEF_k_wind = 0.42f;
constexpr auto SCH_DEF_dir_offset = 0.0f;
constexpr auto SCH_DEF_slow_below_v = 3.55f;
constexpr auto SCH_DEF_slow_factor = 3;
constexpr auto SCH_DEF_critical_v = 3.2f;
constexpr auto SCH_DEF_charge_above_v = 0.0f;
constexpr auto SCH_DEF_charge_interval_min = 5;
constexpr auto SCH_DEF_send_every = 3;
constexpr auto SCH_DEF_continuous_wind = 0;
constexpr auto SCH_DEF_urgent_gust_kmh = 0;
constexpr auto SCH_DEF_bench_min = 2;
constexpr auto SCH_DEF_wifi_tx_save = 0;
constexpr auto SCH_DEF_idle_every = 1;
constexpr auto SCH_DEF_env_sensor = 1;
constexpr auto SCH_DEF_has_wind = 1;
constexpr auto SCH_DEF_has_vane = 1;
constexpr auto SCH_DEF_has_rain = 1;
constexpr auto SCH_DEF_pin_sda = 6;
constexpr auto SCH_DEF_pin_scl = 7;
constexpr auto SCH_DEF_pin_wind = 4;
constexpr auto SCH_DEF_pin_rain = 3;
constexpr auto SCH_DEF_pin_vbat = 0;

/** Campos numéricos comuns (os pinos têm regras próprias): X(chave_json, membro_de_Settings, mínimo, máximo) */
#define SCHEMA_FIELDS(X) \
  X("interval_min", intervalMin, 1.0f, 60.0f) \
  X("wind_window_s", windWindowS, 2.0f, 30.0f) \
  X("gust_window_s", gustWindowS, 1.0f, 10.0f) \
  X("samples", samples, 1.0f, 32.0f) \
  X("wifi_timeout_s", wifiTimeoutS, 4.0f, 30.0f) \
  X("mm_per_tip", mmPerTip, 0.01f, 2.0f) \
  X("k_wind", kWind, 0.05f, 3.0f) \
  X("dir_offset", dirOffset, 0.0f, 359.99f) \
  X("slow_below_v", slowBelowV, 0.0f, 4.2f) \
  X("slow_factor", slowFactor, 1.0f, 12.0f) \
  X("critical_v", criticalV, 0.0f, 4.0f) \
  X("charge_above_v", chargeAboveV, 0.0f, 5.0f) \
  X("charge_interval_min", chargeIntervalMin, 1.0f, 60.0f) \
  X("send_every", sendEvery, 1.0f, 12.0f) \
  X("continuous_wind", continuousWind, 0.0f, 1.0f) \
  X("urgent_gust_kmh", urgentGustKmh, 0.0f, 200.0f) \
  X("bench_min", benchMin, 0.0f, 30.0f) \
  X("wifi_tx_save", wifiTxSave, 0.0f, 1.0f) \
  X("idle_every", idleEvery, 1.0f, 12.0f) \
  X("env_sensor", envSensor, 0.0f, 3.0f) \
  X("has_wind", hasWind, 0.0f, 1.0f) \
  X("has_vane", hasVane, 0.0f, 1.0f) \
  X("has_rain", hasRain, 0.0f, 1.0f)

constexpr uint8_t SCH_USABLE_PINS[] = {0, 1, 2, 3, 4, 5, 6, 7, 10, 20, 21};
constexpr int SCH_PIN_RAIN_MAX = 5;
constexpr int SCH_PIN_VBAT_MAX = 4;
