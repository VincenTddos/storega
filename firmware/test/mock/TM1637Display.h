#pragma once
#include <stdint.h>
#define SEG_A 0x01
#define SEG_B 0x02
#define SEG_C 0x04
#define SEG_D 0x08
#define SEG_E 0x10
#define SEG_F 0x20
#define SEG_G 0x40
struct TM1637Display { TM1637Display(uint8_t, uint8_t, unsigned = 100) {} void setBrightness(uint8_t, bool = true) {}
  void setSegments(const uint8_t[], uint8_t = 4, uint8_t = 0) {} uint8_t encodeDigit(uint8_t) { return 0; } };
