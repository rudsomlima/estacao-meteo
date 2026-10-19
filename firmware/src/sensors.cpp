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
static bool readBme(uint8_t n, bool only76, Env &e) {
  if (!(bme.begin(0x76, &Wire) || (!only76 && bme.begin(0x77, &Wire)))) return false;
  bme.setSampling(Adafruit_BME280::MODE_FORCED, Adafruit_BME280::SAMPLING_X1, Adafruit_BME280::SAMPLING_X1,
                  Adafruit_BME280::SAMPLING_X1, Adafruit_BME280::FILTER_OFF);
  e.t = e.h = e.p = 0;
  for (uint8_t i = 0; i < n; i++) {
    bme.takeForcedMeasurement();
    e.t += bme.readTemperature();
    e.h += bme.readHumidity();
    e.p += bme.readPressure() / 100.0f;
    delay(15);
  }
  e.t /= n; e.h = constrain(e.h / n, 0.0f, 100.0f); e.p /= n;
  return true;
}

// ---------------- MS5611 (GY-63): pressão e temperatura, sem umidade ----------------
static uint16_t msC[7];

static bool msCmd(uint8_t a, uint8_t c) { Wire.beginTransmission(a); Wire.write(c); return Wire.endTransmission() == 0; }

static bool msAdc(uint8_t a, uint32_t &v) {
  Wire.beginTransmission(a); Wire.write((uint8_t)0x00);
  if (Wire.endTransmission() != 0 || Wire.requestFrom((int)a, 3) != 3) return false;
  v = (uint32_t)Wire.read() << 16; v |= (uint32_t)Wire.read() << 8; v |= Wire.read();
  return v != 0;
}

static bool msInit(uint8_t a) {
  if (!msCmd(a, 0x1E)) return false;  // reset
  delay(3);
  uint16_t any = 0;
  for (uint8_t i = 0; i < 7; i++) {   // PROM: C1..C6 em 0xA2..0xAC (msC[1..6])
    Wire.beginTransmission(a); Wire.write((uint8_t)(0xA0 + 2 * i));
    if (Wire.endTransmission(false) != 0 || Wire.requestFrom((int)a, 2) != 2) return false;
    msC[i] = (Wire.read() << 8) | Wire.read();
    any |= msC[i];
  }
  return any != 0 && msC[1] != 0;
}

/** Uma conversão com a compensação de segunda ordem do datasheet. t em °C, p em hPa. */
static bool msOnce(uint8_t a, float &t, float &p) {
  uint32_t d1, d2;
  if (!msCmd(a, 0x48)) return false;  // D1 (pressão), OSR 4096
  delay(10);
  if (!msAdc(a, d1)) return false;
  if (!msCmd(a, 0x58)) return false;  // D2 (temperatura)
  delay(10);
  if (!msAdc(a, d2)) return false;
  const int64_t dT = (int64_t)d2 - ((int64_t)msC[5] << 8);
  int64_t temp = 2000 + dT * msC[6] / 8388608LL;
  int64_t off = ((int64_t)msC[2] << 16) + (((int64_t)msC[4] * dT) >> 7);
  int64_t sens = ((int64_t)msC[1] << 15) + (((int64_t)msC[3] * dT) >> 8);
  if (temp < 2000) {
    const int64_t t2 = (dT * dT) >> 31;
    int64_t off2 = 5 * (temp - 2000) * (temp - 2000) / 2, sens2 = off2 / 2;
    if (temp < -1500) { off2 += 7 * (temp + 1500) * (temp + 1500); sens2 += 11 * (temp + 1500) * (temp + 1500) / 2; }
    temp -= t2; off -= off2; sens -= sens2;
  }
  const int64_t pr = ((((int64_t)d1 * sens) >> 21) - off) >> 15;  // centésimos de mbar
  t = temp / 100.0f;
  p = pr / 100.0f;
  return p > 300 && p < 1200;
}

/** addr 0 = tenta 0x77 e depois 0x76. */
static bool readMs(uint8_t n, uint8_t addr, Env &e) {
  uint8_t a = addr;
  if (!a) a = msInit(0x77) ? 0x77 : (msInit(0x76) ? 0x76 : 0);
  else if (!msInit(a)) a = 0;
  if (!a) return false;
  float t = 0, p = 0;
  uint8_t ok = 0;
  for (uint8_t i = 0; i < n; i++) {
    float ti, pi;
    if (msOnce(a, ti, pi)) { t += ti; p += pi; ok++; }
  }
  if (!ok) return false;
  e.t = t / ok; e.p = p / ok; e.h = NAN;
  return true;
}

Env readEnv(uint8_t samples) {
  Env e{false, NAN, NAN, NAN};
  const uint8_t n = constrain(samples, 1, 32);
  switch (cfg.envSensor) {
    case 1: e.ok = readBme(n, false, e); break;
    case 2: e.ok = readMs(min<uint8_t>(n, 8), 0, e); break;
    case 3: {  // temperatura e umidade do BME280 (0x76), pressão do MS5611 (0x77)
      Env ms{false, NAN, NAN, NAN};
      e.ok = readBme(n, true, e);
      if (e.ok && readMs(min<uint8_t>(n, 8), 0x77, ms)) e.p = ms.p;
      break;
    }
    default: break;  // 0: sem sensor, só o sinal de vida
  }
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
