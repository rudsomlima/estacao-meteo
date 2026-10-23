#pragma once
#include <Arduino.h>
#include "schema_gen.h"   // limites e padrões: shared/board-schema.json (tools/gen_schema.py)

// ---------------- pinos (ESP32-C3) ----------------
// Os pinos dos sensores vêm da configuração (padrões abaixo; o site muda em Sensores e pinos). Só GPIO0-5 acordam do deep sleep.
// GPIO2, 8 e 9 são pinos de boot, 18 e 19 são da USB, 11-17 da flash.
constexpr uint8_t DEF_PIN_SDA = SCH_DEF_pin_sda;    // BME280 (0x76), MS5611 (0x77) e QMC5883L/GY-273 (0x0D)
constexpr uint8_t DEF_PIN_SCL = SCH_DEF_pin_scl;
constexpr uint8_t DEF_PIN_WIND = SCH_DEF_pin_wind;   // Hall do anemômetro, 1 pulso por volta (pull-up externo de 1 MΩ a 10 kΩ para 3V3)
constexpr uint8_t DEF_PIN_RAIN = SCH_DEF_pin_rain;   // Hall do tanque de chuva, acorda do deep sleep (pull-up externo)
constexpr uint8_t DEF_PIN_VBAT = SCH_DEF_pin_vbat;   // ADC1, divisor de 2 resistores iguais e 100 nF para o GND
constexpr int PIN_BOOT = 9;   // botão BOOT: segurar ao ligar abre o portal Wi-Fi

constexpr float VBAT_DIV = 2.0f;        // relação do divisor (2 resistores iguais = 2,0)

// ---------------- sensor de direção ----------------
constexpr uint8_t QMC_ADDR = 0x0D;
constexpr float DIR_SIGN = 1.0f;        // use -1 se a direção girar ao contrário (depende de como colou o GY-273)

// ---------------- rede ----------------
constexpr uint32_t PORTAL_TIMEOUT_S = 180;
// O HTTPS é validado com as raízes de src/roots.h (tools/make_roots.py). Se a validação falhar, os envios seguem assinados (a chave não viaja).

// Endereço do seu site embutido no firmware (assim o portal pede só a rede e o código de pareamento).
// Defina ao compilar: build_flags = -DDEFAULT_SERVER_URL=\"https://seu-site.workers.dev\"
#ifndef DEFAULT_SERVER_URL
#define DEFAULT_SERVER_URL ""
#endif

// ---------------- versão ----------------
// Mude a cada firmware que publicar pelo site: a estação só atualiza quando a versão publicada é DIFERENTE desta.
#ifndef FW_VERSION
#define FW_VERSION "0.5.2"
#endif

// ---------------- limites ----------------
constexpr uint8_t MAX_BATCH = 12;               // leituras guardadas na memória RTC esperando envio
constexpr uint16_t MAX_WIND_SECONDS = 3600;     // maior janela de vento em uma medição

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
