#include "sensors.h"
#include "console.h"
#include "usblink.h"
#include <Adafruit_BME280.h>
#include <Wire.h>
#include "config.h"
#include "settings.h"

static Adafruit_BME280 bme;

// ---------------- bateria ----------------
float batteryVolts() {
  analogSetPinAttenuation(PIN_VBAT, ADC_11db);
  uint32_t mv = 0;
  for (int i = 0; i < 16; i++) { mv += analogReadMilliVolts(PIN_VBAT); delayMicroseconds(200); }
  return (mv / 16.0f) / 1000.0f * VBAT_DIV;
}

// ---------------- BME280 ----------------
Env readEnv(uint8_t samples) {
  Env e{false, 0, 0, 0};
  if (!(bme.begin(0x76, &Wire) || bme.begin(0x77, &Wire))) return e;
  bme.setSampling(Adafruit_BME280::MODE_FORCED, Adafruit_BME280::SAMPLING_X1, Adafruit_BME280::SAMPLING_X1,
                  Adafruit_BME280::SAMPLING_X1, Adafruit_BME280::FILTER_OFF);
  const uint8_t n = constrain(samples, 1, 32);
  for (uint8_t i = 0; i < n; i++) {
    bme.takeForcedMeasurement();
    e.t += bme.readTemperature();
    e.h += bme.readHumidity();
    e.p += bme.readPressure() / 100.0f;
    delay(15);
  }
  e.t /= n; e.h = constrain(e.h / n, 0.0f, 100.0f); e.p /= n;
  e.ok = true;
  return e;
}

// ---------------- QMC5883L ----------------
static bool qmcWrite(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(QMC_ADDR); Wire.write(reg); Wire.write(val);
  return Wire.endTransmission() == 0;
}

bool qmcStart() {
  if (!qmcWrite(0x0B, 0x01)) return false;  // SET/RESET
  return qmcWrite(0x09, 0x01);              // 10 Hz, ±2 G, OSR 512, contínuo (0x11 = ±8 G se saturar)
}

void qmcStop() { qmcWrite(0x09, 0x00); }

bool qmcRead(int16_t &x, int16_t &y) {
  Wire.beginTransmission(QMC_ADDR); Wire.write(0x06);
  if (Wire.endTransmission(false) != 0 || Wire.requestFrom((int)QMC_ADDR, 1) != 1) return false;
  if (!(Wire.read() & 0x01)) return false;  // sem dado novo
  Wire.beginTransmission(QMC_ADDR); Wire.write(0x00);
  if (Wire.endTransmission(false) != 0 || Wire.requestFrom((int)QMC_ADDR, 4) != 4) return false;
  x = Wire.read() | (Wire.read() << 8);
  y = Wire.read() | (Wire.read() << 8);
  return true;
}

bool magVector(double &ux, double &uy) {
  int16_t x, y;
  if (!qmcRead(x, y)) return false;
  const float bx = (x - calCx) * calSx, by = (y - calCy) * calSy;
  const float m = sqrtf(bx * bx + by * by);
  if (m <= 1) return false;
  ux = bx / m; uy = by / m;
  return true;
}

// ---------------- ferramentas pela porta USB ----------------
void serialTools(uint32_t windowMs) {
  Console.printf("\nEstacao Meteo. 'c' = calibrar biruta, 'n' = ler angulo do norte. (%u s)\n", (unsigned)(windowMs / 1000));
  uint32_t t0 = millis();
  while (millis() - t0 < windowMs) {
    if (usbPoll()) { t0 = millis(); continue; }  // o site (Web Serial) fala em JSON, uma linha por comando; cada comando renova a janela
    if (!Console.available()) { delay(20); continue; }
    const char c = Console.read();
    if (c != 'c' && c != 'n') continue;
    if (!qmcStart()) { Console.println("QMC5883L nao respondeu (0x0D)."); return; }
    if (c == 'c') {
      Console.println("Gire a biruta 360 graus devagar, duas vezes, durante 20 s...");
      int16_t mnx = 32767, mxx = -32768, mny = 32767, mxy = -32768;
      const uint32_t s = millis();
      while (millis() - s < 20000) {
        int16_t x, y;
        if (qmcRead(x, y)) { mnx = min(mnx, x); mxx = max(mxx, x); mny = min(mny, y); mxy = max(mxy, y); }
        delay(20);
      }
      const float rx = (mxx - mnx) / 2.0f, ry = (mxy - mny) / 2.0f;
      if (rx < 20 || ry < 20) { Console.println("Sinal fraco demais. Aproxime o ima ou use a faixa de 8 G."); qmcStop(); return; }
      const float m = (rx + ry) / 2.0f;
      saveCalibration((mxx + mnx) / 2.0f, (mxy + mny) / 2.0f, m / rx, m / ry);
      Console.printf("Calibrado: raio X=%.0f Y=%.0f. Reinicie e use 'n' para achar o norte.\n", rx, ry);
    } else if (c == 'n') {
      Console.println("Aponte a biruta para o NORTE (indicador N). Lendo 3 s...");
      double sx = 0, sy = 0; int n = 0;
      const uint32_t s = millis();
      while (millis() - s < 3000) {
        double ux, uy;
        if (magVector(ux, uy)) { sx += ux; sy += uy; n++; }
        delay(50);
      }
      if (n < 3) { Console.println("Sem leitura."); qmcStop(); return; }
      const float a = fmodf(DIR_SIGN * atan2f((float)sy, (float)sx) * 180.0f / PI + 360.0f, 360.0f);
      Console.printf("Digite no site, em Ajuste do norte da biruta: %.0f\n", a);
    }
    qmcStop();
    return;
  }
}
