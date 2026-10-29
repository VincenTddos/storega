#pragma once
#include <stdint.h>
struct Preferences { bool begin(const char*, bool) { return true; } size_t putUInt(const char*, uint32_t) { return 4; } size_t putUShort(const char*, uint16_t) { return 2; }
  size_t putUChar(const char*, uint8_t) { return 1; } size_t putInt(const char*, int32_t) { return 4; } uint32_t getUInt(const char*, uint32_t d) { return d; }
  uint16_t getUShort(const char*, uint16_t d) { return d; } uint8_t getUChar(const char*, uint8_t d) { return d; } int32_t getInt(const char*, int32_t d) { return d; } };
