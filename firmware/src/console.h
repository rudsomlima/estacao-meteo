#pragma once
#include <Arduino.h>

/**
 * Porta USB nativa do ESP32-C3 (USB-Serial/JTAG). É por ela que o site, o monitor serial e as ferramentas falam com a placa.
 * O firmware só a liga quando há um computador plugado (veja usbOpen em usblink.h); em campo, sem cabo, ela nunca é aberta.
 */
#define Console USBSerial
