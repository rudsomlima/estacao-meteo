#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include "types.h"

/**
 * Conversa com o site pela porta USB (Web Serial). O site reconhece a placa ao ser plugada e fala com ela por
 * linhas JSON, uma por linha:
 *   {"cmd":"hello"}                                  -> identificação, versão e se já está configurada
 *   {"cmd":"scan"}                                   -> redes Wi-Fi por perto
 *   {"cmd":"provision","ssid":"","pass":"","server":"","id":"","key":""}  -> grava a rede e a chave e reinicia
 *   {"cmd":"config","config":{...}}                  -> aplica a configuração na hora (a mesma que o servidor entrega) e envia logo
 *   {"cmd":"diag"}                                   -> a configuração que a placa tem e o estado do ciclo (níveis de bateria, lote, falhas)
 *   {"cmd":"simvbat","v":3.4}                          -> simula a tensão da bateria (v<0 desliga); só para testes pela USB
 *   {"cmd":"nettest","url":"https://..."}             -> conecta ao Wi-Fi e faz um GET validando o HTTPS (diagnóstico; sem dados da estação)
 *   {"cmd":"portal"}                                  -> abre o portal Wi-Fi como se o BOOT estivesse apertado (3 min)
 *   {"cmd":"restart"}                                -> reinicia
 * As respostas também são uma linha JSON.
 *
 * A porta só é aberta quando há um computador do outro lado do cabo. Em campo (bateria, painel solar ou carregador sem
 * dados) ela nunca é aberta e não custa nada.
 */

/** Há um computador enumerando a placa pela USB (e não só um carregador)? */
bool usbPlugged();
/** Liga a porta USB e o log. Pode ser chamada várias vezes. */
void usbOpen();
/** Atende uma linha JSON pendente, se houver. Devolve true se atendeu. */
bool usbPoll();
bool usbHandleLine(const String &line);
/** O site mandou uma configuração pela USB: o próximo ciclo começa já e envia, para o servidor saber que foi aplicada. */
extern volatile bool usbSendNow;
/** Preenche o estado do ciclo (memória RTC) para o comando "diag". Definida em main.cpp. */
void diagFill(JsonObject o);
/** As leituras do lote (definida em main.cpp). */
uint8_t batchView(const Sample **out);
