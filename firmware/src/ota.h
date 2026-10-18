#pragma once
#include "net.h"

/**
 * Baixa e grava o firmware que o servidor ofereceu, conferindo o SHA-256 (que veio na resposta assinada) antes de
 * ativar. Só chame com o Wi-Fi conectado e a bateria acima do crítico. Reinicia a estação se der certo.
 *
 * Travas: só atualiza quando a versão oferecida é DIFERENTE da instalada; depois de 3 falhas seguidas para a mesma
 * versão, desiste dela até que o servidor publique outra; e a imagem só é ativada se o hash bater.
 */
void otaMaybeUpdate(const OtaOffer &offer, float vbat);
