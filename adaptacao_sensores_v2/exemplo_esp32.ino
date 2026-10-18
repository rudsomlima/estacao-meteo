/*
  Estação de vento — exemplo para ESP32 (NÃO TESTADO em hardware; use como ponto de partida)

  Direção: GY-273 (QMC5883L, I2C 0x0D) deitado sob a base. Um ímã na biruta gira em volta
           do eixo; o campo horizontal no chip gira junto -> ângulo = atan2(By - cy, Bx - cx).
  Velocidade: A3144 (Hall, saída coletor aberto) no braço fixo. 1 pulso por volta do rotor.

  Ligações:
    GY-273 : VCC 3V3 | GND | SDA GPIO21 | SCL GPIO22
    A3144  : VCC 5V (VIN) | GND | OUT -> GPIO27 e resistor 10 kΩ de OUT para 3V3

  Uso:
    1) Grave o sketch e abra o monitor serial (115200).
    2) Calibração: envie 'c' e gire a biruta 360° devagar, duas vezes; envie 'c' de novo para terminar.
       O sketch guarda o centro (cx, cy) de cada eixo (min/máx). Anote os valores e coloque em CAL_*.
    3) Aponte a biruta para o NORTE (mesma direção do indicador N) e envie 'n': grava o offset.
    4) Velocidade: ajuste K_VENTO comparando com um anemômetro de referência (m/s por volta/s).
*/
#include <Wire.h>

// ---------------- configuração ----------------
const int PIN_HALL = 27;
const uint8_t QMC_ADDR = 0x0D;
float K_VENTO = 0.42f;            // m/s por (volta/s)  -> CALIBRAR. Valor inicial só estimado:
                                  // v ≈ 0,3..0,4 · (2π · r) · f, com r ≈ 0,067 m (centro dos copos)
// Calibração do magnetômetro (preencha após a rotina 'c'):
float CAL_CX = 0, CAL_CY = 0;     // centro (hard-iron)
float CAL_SX = 1, CAL_SY = 1;     // escala (para corrigir elipse; 1 = sem correção)
float OFFSET_N = 0;               // graus lidos quando a biruta aponta para o norte

// ---------------- velocidade (A3144) ----------------
volatile uint32_t pulsos = 0;
volatile uint32_t ultimoUs = 0;
void IRAM_ATTR isrHall() {
  uint32_t agora = micros();
  if (agora - ultimoUs > 1000) {  // filtro de 1 ms (anti-repique)
    pulsos++;
    ultimoUs = agora;
  }
}

// ---------------- QMC5883L ----------------
void qmcEscreve(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(QMC_ADDR); Wire.write(reg); Wire.write(val); Wire.endTransmission();
}
bool qmcLe(int16_t &x, int16_t &y, int16_t &z) {
  Wire.beginTransmission(QMC_ADDR); Wire.write(0x00); if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom((int)QMC_ADDR, 6) != 6) return false;
  x = Wire.read() | (Wire.read() << 8);
  y = Wire.read() | (Wire.read() << 8);
  z = Wire.read() | (Wire.read() << 8);
  return true;
}
void qmcInicia() {
  qmcEscreve(0x0B, 0x01);         // SET/RESET period
  qmcEscreve(0x09, 0x0D);         // OSR 512, faixa ±2 G, 200 Hz, contínuo (0x1D = ±8 G se saturar)
}

// ---------------- calibração ----------------
bool calibrando = false;
int16_t minX = 32767, maxX = -32768, minY = 32767, maxY = -32768;

float anguloBruto(int16_t x, int16_t y) {
  float bx = (x - CAL_CX) * CAL_SX, by = (y - CAL_CY) * CAL_SY;
  float a = atan2f(by, bx) * 180.0f / PI;
  return a < 0 ? a + 360.0f : a;
}

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  Wire.setClock(100000);
  qmcInicia();
  pinMode(PIN_HALL, INPUT);       // pull-up EXTERNO de 10 kΩ para 3V3
  attachInterrupt(digitalPinToInterrupt(PIN_HALL), isrHall, FALLING);
  Serial.println("Pronto. 'c' = calibrar (gire a biruta 360°), 'n' = gravar norte.");
}

uint32_t t0 = 0, pulsos0 = 0;
float ultimoAngulo = 0;

void loop() {
  int16_t x, y, z;
  if (qmcLe(x, y, z)) {
    if (calibrando) {
      minX = min(minX, x); maxX = max(maxX, x);
      minY = min(minY, y); maxY = max(maxY, y);
    }
    ultimoAngulo = anguloBruto(x, y);
  }

  if (Serial.available()) {
    char c = Serial.read();
    if (c == 'c') {
      if (!calibrando) { minX = minY = 32767; maxX = maxY = -32768; calibrando = true; Serial.println("Calibrando... gire a biruta 360° (2x). 'c' para terminar."); }
      else {
        calibrando = false;
        CAL_CX = (maxX + minX) / 2.0f; CAL_CY = (maxY + minY) / 2.0f;
        float rx = (maxX - minX) / 2.0f, ry = (maxY - minY) / 2.0f, m = (rx + ry) / 2.0f;
        CAL_SX = m / rx; CAL_SY = m / ry;
        Serial.printf("CAL_CX=%.1f CAL_CY=%.1f CAL_SX=%.3f CAL_SY=%.3f\n", CAL_CX, CAL_CY, CAL_SX, CAL_SY);
      }
    } else if (c == 'n') {
      OFFSET_N = ultimoAngulo;
      Serial.printf("OFFSET_N=%.1f\n", OFFSET_N);
    }
  }

  uint32_t agora = millis();
  if (agora - t0 >= 2000) {       // janela de 2 s para a velocidade
    noInterrupts(); uint32_t p = pulsos; interrupts();
    float f = (p - pulsos0) / ((agora - t0) / 1000.0f);   // voltas/s
    pulsos0 = p; t0 = agora;
    float dir = fmodf(ultimoAngulo - OFFSET_N + 360.0f, 360.0f);
    Serial.printf("Direcao: %6.1f graus | Rotor: %5.2f voltas/s (%.0f rpm) | Vento: %.1f m/s\n",
                  dir, f, f * 60.0f, K_VENTO * f);
  }
  delay(5);
}
