#pragma once
#include <ArduinoJson.h>
#include "config.h"

extern Settings cfg;
extern String wifiSsid, wifiPass, serverUrl, deviceKey, stationId;
/** Código de pareamento digitado no portal, ainda não trocado pela chave (veja claimKey em net.h). */
extern String claimCode;
extern float calCx, calCy, calSx, calSy;

void loadAll();
void saveSettings();
void saveNetwork();
void saveCalibration(float cx, float cy, float sx, float sy);

/** Aplica a configuração vinda do servidor e salva. Devolve true se o modo de vento mudou (precisa reiniciar). */
bool applyRemoteConfig(JsonObjectConst c);
