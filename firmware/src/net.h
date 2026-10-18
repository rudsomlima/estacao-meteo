#pragma once
#include "types.h"

/** Conecta ao Wi-Fi salvo. Usa canal, BSSID e IP guardados na memória RTC para ser rápido. */
bool wifiConnect(uint32_t timeoutMs);
/** Portal cativo "EstacaoMeteo-XXXX" para escolher a rede, o endereço do site e a chave. */
bool runPortal();
/** Desliga o rádio. */
void netOff();
int netRssi();

struct PostResult {
  bool ok;
  bool modeChanged;  // a configuração nova trocou o modo de vento: reinicie
};

/** Envia as leituras do lote. Cada uma vai com a idade em segundos, porque a estação não tem relógio de verdade. */
PostResult postBatch(const Sample *s, uint8_t n);
