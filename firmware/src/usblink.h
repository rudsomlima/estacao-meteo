#pragma once
#include <Arduino.h>

/**
 * Conversa com o site pela porta USB (Web Serial). O site reconhece a placa ao ser plugada e fala com ela por
 * linhas JSON, uma por linha:
 *   {"cmd":"hello"}                                  -> identificação, versão e se já está configurada
 *   {"cmd":"provision","ssid":"","pass":"","server":"","id":"","key":""}  -> grava a rede e a chave e reinicia
 *   {"cmd":"restart"}                                -> reinicia
 * As respostas também são uma linha JSON. Só funciona com a USB ligada (ambiente esp32c3) e no boot a frio.
 */
bool usbHandleLine(const String &line);
