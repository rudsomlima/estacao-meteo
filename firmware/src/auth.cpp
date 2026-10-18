#include "auth.h"
#include <mbedtls/md.h>

static String toHex(const uint8_t *d, size_t n) {
  static const char *H = "0123456789abcdef";
  String s;
  s.reserve(n * 2);
  for (size_t i = 0; i < n; i++) { s += H[d[i] >> 4]; s += H[d[i] & 15]; }
  return s;
}

String sha256Hex(const uint8_t *data, size_t len) {
  uint8_t out[32];
  mbedtls_md(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), data, len, out);
  return toHex(out, 32);
}

String sha256Hex(const String &s) { return sha256Hex((const uint8_t *)s.c_str(), s.length()); }

String hmacSha256Hex(const String &key, const String &message) {
  uint8_t out[32];
  mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), (const uint8_t *)key.c_str(), key.length(),
                  (const uint8_t *)message.c_str(), message.length(), out);
  return toHex(out, 32);
}

bool equalsConst(const String &a, const String &b) {
  if (a.length() != b.length() || a.length() == 0) return false;
  uint8_t d = 0;
  for (size_t i = 0; i < a.length(); i++) d |= (uint8_t)a[i] ^ (uint8_t)b[i];
  return d == 0;
}
