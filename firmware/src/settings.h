#pragma once
#include <ArduinoJson.h>
#include "config.h"

// ---------------- configuração padrão (o site sobrescreve) ----------------
struct Settings {
  uint16_t intervalMin   = SCH_DEF_interval_min;
  uint8_t  windWindowS   = SCH_DEF_wind_window_s;       // usado só no modo "janela" (deep sleep entre ciclos)
  uint8_t  gustWindowS   = SCH_DEF_gust_window_s;
  uint8_t  samples       = SCH_DEF_samples;
  uint8_t  wifiTimeoutS  = SCH_DEF_wifi_timeout_s;
  float    mmPerTip      = SCH_DEF_mm_per_tip;
  float    kWind         = SCH_DEF_k_wind;   // m/s por (volta/s)
  float    dirOffset     = SCH_DEF_dir_offset;
  float    slowBelowV    = SCH_DEF_slow_below_v;
  float    criticalV     = SCH_DEF_critical_v;   // abaixo disso a estação só hiberna (depende da química da bateria)
  float    chargeAboveV  = SCH_DEF_charge_above_v;    // 0 = desligado; acima disso considera que está carregando e usa o intervalo curto
  uint8_t  chargeIntervalMin = SCH_DEF_charge_interval_min;   // intervalo enquanto carrega
  uint8_t  benchMin      = SCH_DEF_bench_min;       // modo bancada ao ligar, em minutos (0 = desligado)
  uint8_t  slowFactor    = SCH_DEF_slow_factor;
  uint8_t  sendEvery     = SCH_DEF_send_every;       // envia a cada N leituras (lote)
  uint8_t  continuousWind = SCH_DEF_continuous_wind;      // 1 = conta o vento o ciclo todo em light sleep (exige Hall de baixa corrente)
  uint8_t  urgentGustKmh = SCH_DEF_urgent_gust_kmh;       // 0 = desligado; acima disso envia na hora
  uint8_t  envSensor     = SCH_DEF_env_sensor;       // 0 nenhum, 1 BME280, 2 MS5611 (GY-63), 3 BME280 (temperatura e umidade) + MS5611 (pressão)
  uint8_t  hasWind       = SCH_DEF_has_wind;       // 0 = sem anemômetro (rotor) instalado: não mede velocidade/rajada (evita ruído de pino solto virar "vento")
  uint8_t  hasVane       = SCH_DEF_has_vane;       // 0 = sem biruta (bússola) instalada: não mede direção
  uint8_t  hasRain       = SCH_DEF_has_rain;       // 0 = sem pluviômetro instalado: não mede
  uint8_t  pinSda = DEF_PIN_SDA, pinScl = DEF_PIN_SCL, pinWind = DEF_PIN_WIND, pinRain = DEF_PIN_RAIN, pinVbat = DEF_PIN_VBAT;
  uint8_t  wifiTxSave    = SCH_DEF_wifi_tx_save;       // 1 = reduz sozinha a potência de transmissão do Wi-Fi quando o sinal é bom
  uint8_t  idleEvery     = SCH_DEF_idle_every;       // sem leitura de sensor: manda o sinal de vida a cada N ciclos (1 = todo ciclo)
  uint32_t version       = 0;       // 0 = nunca recebeu configuração; o servidor manda a atual
};

extern Settings cfg;
#define PIN_SDA  (cfg.pinSda)
#define PIN_SCL  (cfg.pinScl)
#define PIN_WIND (cfg.pinWind)
#define PIN_RAIN (cfg.pinRain)
#define PIN_VBAT (cfg.pinVbat)

/** Pinos aceitáveis no ESP32-C3: o da chuva precisa acordar do deep sleep (0-5) e o da bateria ser ADC1 (0-4). Sem repetir pino. */
inline bool pinsValid(int sda, int scl, int wind, int rain, int vbat) {
  const int p[5] = {sda, scl, wind, rain, vbat};
  for (int i = 0; i < 5; i++) {
    bool ok = false;
    for (uint8_t u : SCH_USABLE_PINS) if (u == p[i]) ok = true;
    if (!ok) return false;
    for (int j = i + 1; j < 5; j++) if (p[i] == p[j]) return false;
  }
  return rain <= SCH_PIN_RAIN_MAX && vbat <= SCH_PIN_VBAT_MAX;
}

extern Settings cfg;
extern String wifiSsid, wifiPass, serverUrl, deviceKey, stationId;
/** Código de pareamento digitado no portal, ainda não trocado pela chave (veja claimKey em net.h). */
extern String claimCode;
extern float calCx, calCy, calSx, calSy;

void loadAll();
void saveSettings();
void saveNetwork();
void saveCalibration(float cx, float cy, float sx, float sy);

/** Aplica a configuração vinda do servidor e salva. Devolve true se o modo de vento mudou (precisa reiniciar). */
bool applyRemoteConfig(JsonObjectConst c);
