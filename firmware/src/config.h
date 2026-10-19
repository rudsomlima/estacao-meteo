#pragma once
#include <Arduino.h>

// ---------------- pinos (ESP32-C3) ----------------
// Só GPIO0-5 acordam do deep sleep. GPIO2, 8 e 9 são pinos de boot: evite-os para sensores.
constexpr int PIN_SDA  = 6;   // BME280 (0x76) e QMC5883L/GY-273 (0x0D)
constexpr int PIN_SCL  = 7;
constexpr int PIN_WIND = 4;   // Hall do anemômetro, 1 pulso por volta (pull-up externo de 1 MΩ a 10 kΩ para 3V3)
constexpr int PIN_RAIN = 3;   // Hall do tanque de chuva, acorda do deep sleep (pull-up externo)
constexpr int PIN_VBAT = 0;   // ADC1_CH0, divisor de 2 resistores iguais e 100 nF para o GND
constexpr int PIN_BOOT = 9;   // botão BOOT: segurar ao ligar abre o portal Wi-Fi

constexpr float VBAT_DIV = 2.0f;        // relação do divisor (2 resistores iguais = 2,0)

// ---------------- sensor de direção ----------------
constexpr uint8_t QMC_ADDR = 0x0D;
constexpr float DIR_SIGN = 1.0f;        // use -1 se a direção girar ao contrário (depende de como colou o GY-273)

// ---------------- rede ----------------
constexpr uint32_t PORTAL_TIMEOUT_S = 180;
// A validação do certificado HTTPS é ligada colando o certificado raiz em ROOT_CA_PEM (net.cpp).

// Endereço do seu site embutido no firmware (assim o portal pede só a rede e o código de pareamento).
// Defina ao compilar: build_flags = -DDEFAULT_SERVER_URL=\"https://seu-site.workers.dev\"
#ifndef DEFAULT_SERVER_URL
#define DEFAULT_SERVER_URL ""
#endif

// ---------------- versão ----------------
// Mude a cada firmware que publicar pelo site: a estação só atualiza quando a versão publicada é DIFERENTE desta.
#ifndef FW_VERSION
#define FW_VERSION "0.3.2"
#endif

// ---------------- limites ----------------
constexpr uint8_t MAX_BATCH = 12;               // leituras guardadas na memória RTC esperando envio
constexpr uint16_t MAX_WIND_SECONDS = 3600;     // maior janela de vento em uma medição

// ---------------- configuração padrão (o site sobrescreve) ----------------
struct Settings {
  uint16_t intervalMin   = 10;
  uint8_t  windWindowS   = 8;       // usado só no modo "janela" (deep sleep entre ciclos)
  uint8_t  gustWindowS   = 3;
  uint8_t  samples       = 8;
  uint8_t  wifiTimeoutS  = 10;
  float    mmPerTip      = 0.2f;
  float    kWind         = 0.42f;   // m/s por (volta/s)
  float    dirOffset     = 0.0f;
  float    slowBelowV    = 3.55f;
  float    criticalV     = 3.20f;   // abaixo disso a estação só hiberna (depende da química da bateria)
  float    chargeAboveV  = 0.0f;    // 0 = desligado; acima disso considera que está carregando e usa o intervalo curto
  uint8_t  chargeIntervalMin = 5;   // intervalo enquanto carrega
  uint8_t  benchMin      = 2;       // modo bancada ao ligar, em minutos (0 = desligado)
  uint8_t  slowFactor    = 3;
  uint8_t  sendEvery     = 3;       // envia a cada N leituras (lote)
  uint8_t  continuousWind = 0;      // 1 = conta o vento o ciclo todo em light sleep (exige Hall de baixa corrente)
  uint8_t  urgentGustKmh = 0;       // 0 = desligado; acima disso envia na hora
  uint8_t  wifiTxSave    = 0;       // 1 = reduz sozinha a potência de transmissão do Wi-Fi quando o sinal é bom
  uint32_t version       = 0;       // 0 = nunca recebeu configuração; o servidor manda a atual
};
