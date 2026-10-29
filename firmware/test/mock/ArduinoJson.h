#pragma once
#include <stdint.h>
struct JsonVariantConst { const char* operator|(const char* d) const { return d; } int operator|(int d) const { return d; } };
struct JsonDocument { JsonVariantConst operator[](const char*) const { return {}; } };
struct DeserializationError { explicit operator bool() const { return false; } };
inline DeserializationError deserializeJson(JsonDocument&, const uint8_t*, size_t) { return {}; }
