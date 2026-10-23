#pragma once

/** Envia o lote quando completa N leituras, quando há urgência, no primeiro boot ou quando o lote enche. */
void sendIfDue(bool urgent);
