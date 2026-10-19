#pragma once
#include <Arduino.h>
#include <HTTPClient.h>
#include "types.h"

/** Conecta ao Wi-Fi salvo. Usa canal, BSSID e IP guardados na memória RTC para ser rápido. */
bool wifiConnect(uint32_t timeoutMs);
/** Portal cativo "EstacaoMeteo-XXXX": rede, endereço do site, ID e chave da estação, e minutos do modo bancada. */
bool runPortal();
/**
 * Troca o código de pareamento pela chave da estação (POST /api/claim). Só por https://, porque a chave viaja na resposta.
 * Devolve true se não havia código a trocar ou se a troca deu certo. Um código recusado pelo servidor é descartado;
 * uma falha de rede o mantém para a próxima tentativa.
 */
bool claimKey();
/** Desliga o rádio. */
void netOff();
int netRssi();

/** Atualização de firmware oferecida pelo servidor na resposta do envio (já com a assinatura conferida). */
struct OtaOffer {
  bool offered;
  String version;
  size_t size;
  String sha256;
};

struct PostResult {
  bool ok;
  bool modeChanged;  // a configuração nova trocou o modo de vento: reinicie
  OtaOffer ota;
  String cmd;        // comando do administrador ("restart"), entregue na resposta
  bool cfgApplied;  // a resposta trouxe uma configuração nova e ela foi aplicada: confirme logo ao servidor
};

/**
 * Envia o lote (e os eventos pendentes). Cada leitura vai com a idade em segundos, porque a estação não tem relógio.
 * Com o endereço em https:// manda a chave no cabeçalho. Com http:// a chave nunca viaja: o pedido vai assinado
 * (HMAC) com um nonce que o servidor troca a cada envio, e a resposta só é aceita se vier assinada.
 */
PostResult postBatch(const Sample *s, uint8_t n);

/** Cabeçalhos de autenticação para outros pedidos (por exemplo, baixar o firmware). `body` vazio para GET. */
void authHeaders(HTTPClient &http, const String &body);
bool signedMode();
