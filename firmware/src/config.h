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
