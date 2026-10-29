#pragma once
#include <stdint.h>
struct MFRC522 { struct Uid { uint8_t size; uint8_t uidByte[10]; } uid; MFRC522(uint8_t, uint8_t) {} void PCD_Init() {}
  bool PICC_IsNewCardPresent() { return false; } bool PICC_ReadCardSerial() { return false; } uint8_t PICC_HaltA() { return 0; } };
