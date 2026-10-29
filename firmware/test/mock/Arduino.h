// Minimal stand-ins for the Arduino / ESP32 APIs the sketches use, only for a host-side syntax and type check.
// They do nothing at runtime. Real builds use the Arduino IDE with the ESP32 core.
#pragma once
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <stdio.h>
#include <math.h>
#include <string>
typedef bool boolean; typedef uint8_t byte;
#define INPUT 0
#define OUTPUT 1
#define INPUT_PULLUP 2
#define LOW 0
#define HIGH 1
#define IRAM_ATTR
#define SERIAL_8N1 0
inline uint32_t millis() { return 0; }
inline void delay(uint32_t) {}
inline void pinMode(int, int) {}
inline int digitalRead(int) { return HIGH; }
inline void digitalWrite(int, int) {}
inline void tone(int, unsigned, unsigned long = 0) {}
struct String { std::string s; String(const char* c = "") : s(c) {} const char* c_str() const { return s.c_str(); } };
struct HardwareSerial { void begin(unsigned long, int = 0, int = -1, int = -1) {} int available() { return 0; } int read() { return -1; }
  template <class... A> int printf(const char*, A...) { return 0; } void println(const char*) {} };
extern HardwareSerial Serial, Serial2;
struct EspClass { void restart() {} uint32_t getFreeHeap() { return 0; } };
extern EspClass ESP;
typedef int portMUX_TYPE;
#define portMUX_INITIALIZER_UNLOCKED 0
#define portENTER_CRITICAL(m) (void)(m)
#define portEXIT_CRITICAL(m) (void)(m)
#define portENTER_CRITICAL_ISR(m) (void)(m)
#define portEXIT_CRITICAL_ISR(m) (void)(m)
#include <time.h>
inline void configTime(long, int, const char*, const char* = nullptr) {}
inline bool getLocalTime(struct tm*, uint32_t = 5000) { return false; }
