#pragma once
#include <Arduino.h>

/** SHA-256 em hexadecimal minúsculo. */
String sha256Hex(const uint8_t *data, size_t len);
String sha256Hex(const String &s);
/** HMAC-SHA256 em hexadecimal minúsculo. A chave é o texto em si (como o servidor usa o hash da chave). */
String hmacSha256Hex(const String &key, const String &message);
bool equalsConst(const String &a, const String &b);
