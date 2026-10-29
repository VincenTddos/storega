#pragma once
#include <math.h>
#define DHT11 11
struct DHT { DHT(uint8_t, uint8_t) {} void begin() {} float readTemperature() { return NAN; } float readHumidity() { return NAN; } };
