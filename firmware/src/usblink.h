#pragma once
#include <Arduino.h>

/**
 * Conversa com o site pela porta USB (Web Serial). O site reconhece a placa ao ser plugada e fala com ela por
 * linhas JSON, uma por linha:
 *   {"cmd":"hello"}                                  -> identificação, versão e se já está configurada
 *   {"cmd":"scan"}                                   -> redes Wi-Fi por perto
 *   {"cmd":"provision","ssid":"","pass":"","server":"","id":"","key":""}  -> grava a rede e a chave e reinicia
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
