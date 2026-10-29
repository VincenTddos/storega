// StoreGA firmware core: everything that is pure logic, with no Arduino calls, so it can be unit-tested
// on a laptop (firmware/test) and reused unchanged by entry_node.ino and zone_node.ino.
// Times are milliseconds from millis().
#pragma once
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "sha256.h"

namespace sga {

/* ---------------------------------------------------------------------------------------------
   Door direction from two infrared beams. A is outside, B is inside.
   Someone walking in breaks A, then B, then both clear: IN. The reverse order is OUT.
   A person who breaks A and backs off (or waits at a closed gate) is reported as WAITING.        */
enum class DoorEvent : uint8_t { None, In, Out, Waiting };

class DoorCounter {
 public:
  explicit DoorCounter(uint32_t timeoutMs = 1500, uint32_t debounceMs = 40) : timeout_(timeoutMs), debounce_(debounceMs) {}

  // Feed the raw beam states (true = beam broken) every loop.
  DoorEvent update(bool a, bool b, uint32_t now) {
    a = debounced(a, a_, aSince_, now);
    b = debounced(b, b_, bSince_, now);
    DoorEvent ev = DoorEvent::None;
    switch (state_) {
      case Idle:
        if (a && !b) { state_ = SawA; t0_ = now; }
        else if (b && !a) { state_ = SawB; t0_ = now; }
        break;
      case SawA:  // walking in
        if (b) state_ = BothFromA;
        else if (!a) { state_ = Idle; ev = DoorEvent::Waiting; }
        else if (now - t0_ > timeout_) { state_ = Stuck; ev = DoorEvent::Waiting; }
        break;
      case SawB:  // walking out
        if (a) state_ = BothFromB;
        else if (!b || now - t0_ > timeout_) state_ = b ? Stuck : Idle;
        break;
      case BothFromA:
        if (!a && !b) { state_ = Idle; ev = DoorEvent::In; }
        else if (!a && b) state_ = LeavingToB;
        break;
      case LeavingToB:
        if (!b) { state_ = Idle; ev = DoorEvent::In; }
        else if (a) state_ = BothFromA;
        break;
      case BothFromB:
        if (!a && !b) { state_ = Idle; ev = DoorEvent::Out; }
        else if (!b && a) state_ = LeavingToA;
        break;
      case LeavingToA:
        if (!a) { state_ = Idle; ev = DoorEvent::Out; }
        else if (b) state_ = BothFromB;
        break;
      case Stuck:  // someone standing in a beam: wait until both are clear
        if (!a && !b) state_ = Idle;
        break;
    }
    return ev;
  }

 private:
  enum State : uint8_t { Idle, SawA, SawB, BothFromA, BothFromB, LeavingToB, LeavingToA, Stuck };
  bool debounced(bool raw, bool& stable, uint32_t& since, uint32_t now) {
    if (raw != stable) { if (since == 0) since = now ? now : 1; if (now - since >= debounce_) { stable = raw; since = 0; } }
    else since = 0;
    return stable;
  }
  State state_ = Idle;
  uint32_t t0_ = 0, timeout_, debounce_, aSince_ = 0, bSince_ = 0;
  bool a_ = false, b_ = false;
};

/* ---------------------------------------------------------------------------------------------
   Gate + counters. The entry board decides the gate itself, so the store keeps limiting entry
   even if Wi-Fi or Node-RED goes down.                                                           */
enum class GateMode : uint8_t { Auto, Open, Closed };

inline const char* gateModeName(GateMode m) { return m == GateMode::Open ? "open" : m == GateMode::Closed ? "closed" : "auto"; }
inline bool parseGateMode(const char* s, GateMode& out) {
  if (!s) return false;
  if (!strcmp(s, "auto")) { out = GateMode::Auto; return true; }
  if (!strcmp(s, "open")) { out = GateMode::Open; return true; }
  if (!strcmp(s, "closed")) { out = GateMode::Closed; return true; }
  return false;
}

struct Store {
  uint32_t in = 0, out = 0, checkout = 0;
  uint16_t capacity = 40, queue = 0;
  GateMode mode = GateMode::Auto;

  int occupancy() const { return in >= out ? (int)(in - out) : 0; }
  bool gateOpen() const { return mode == GateMode::Open || (mode == GateMode::Auto && occupancy() < capacity); }

  void apply(DoorEvent ev) {
    switch (ev) {
      case DoorEvent::In: in++; if (queue) queue--; break;
      case DoorEvent::Out: if (out < in) out++; break;  // never below zero: a stray OUT at opening time is ignored
      case DoorEvent::Waiting: if (!gateOpen() && queue < 14) queue++; break;
      default: break;
    }
  }
  bool setCapacity(int v) { if (v < 10 || v > 80) return false; capacity = (uint16_t)v; return true; }
  void resetDay() { in = out = checkout = 0; queue = 0; }
};

/* Average stay without tracking anyone (Little's law): average stay = ∫ occupancy dt ÷ people who came in. */
class DwellEstimator {
 public:
  void tick(int occupancy, uint32_t now) { if (last_) area_ += (double)occupancy * (now - last_) / 1000.0; last_ = now; }
  uint32_t averageSec(uint32_t entries) const { return entries ? (uint32_t)(area_ / entries) : 0; }
  void reset() { area_ = 0; }
 private:
  double area_ = 0;
  uint32_t last_ = 0;
};

/* RFID: one tap per card counts as one checkout; the same card again within 3 s is the same tap. */
class CheckoutDebounce {
 public:
  bool accept(const uint8_t* uid, uint8_t len, uint32_t now) {
    if (len > sizeof last_) len = sizeof last_;
    bool same = len == lastLen_ && !memcmp(uid, last_, len) && now - lastAt_ < 3000;
    memcpy(last_, uid, len); lastLen_ = len; lastAt_ = now;
    return !same;
  }
 private:
  uint8_t last_[10] = {0}, lastLen_ = 0;
  uint32_t lastAt_ = 0;
};

/* ---------------------------------------------------------------------------------------------
   WS2812 bar: how many of `leds` pixels to light and in which colour (0xRRGGBB).               */
struct Bar { uint8_t lit; uint32_t color; };
inline Bar ledBar(int occ, int cap, uint8_t leds) {
  float r = cap > 0 ? (float)occ / cap : 0;
  if (r < 0) r = 0;
  uint8_t lit = (uint8_t)(r >= 1 ? leds : (int)(r * leds + 0.5f));
  if (lit == 0) lit = 1;  // one pixel always on: the board is alive
  uint32_t c = r < 0.6f ? 0x00C850 : r < 0.85f ? 0xFF9500 : 0xFF2A1A;
  return {lit, c};
}

/* TM1637 4-digit text: the number, or "FULL" blinking with it when the gate is closed. */
inline void displayText(char out[5], int occ, bool gateClosed, uint32_t now) {
  if (gateClosed && (now / 1000) % 2) { memcpy(out, "FULL", 5); return; }
  if (occ > 9999) occ = 9999;
  snprintf(out, 5, "%4d", occ < 0 ? 0 : occ);
}

/* ---------------------------------------------------------------------------------------------
   HLK-LD2410 basic report frame (engineering mode off), 256000 baud:
   F4 F3 F2 F1 | len LE (13) | 02 AA | state | moveDist LE | moveEnergy | staticDist LE | staticEnergy | detectDist LE | 55 00 | F8 F7 F6 F5
   state: 0 none, 1 moving, 2 still, 3 moving + still.                                            */
struct RadarReading { bool presence = false, moving = false; uint16_t moveCm = 0, stillCm = 0; uint8_t moveEnergy = 0, stillEnergy = 0; };

class LD2410Parser {
 public:
  // Feed one byte at a time; returns true when a complete, valid frame produced `out`.
  bool feed(uint8_t c, RadarReading& out) {
    static const uint8_t HEAD[4] = {0xF4, 0xF3, 0xF2, 0xF1}, TAIL[4] = {0xF8, 0xF7, 0xF6, 0xF5};
    if (n_ < 4) { if (c == HEAD[n_]) buf_[n_++] = c; else n_ = (c == HEAD[0]) ? (buf_[0] = c, 1) : 0; return false; }
    buf_[n_++] = c;
    if (n_ == 6) { len_ = buf_[4] | (buf_[5] << 8); if (len_ < 4 || len_ > 40) { n_ = 0; return false; } }
    if (n_ < 6 || n_ < (size_t)(6 + len_ + 4)) { if (n_ >= sizeof buf_) n_ = 0; return false; }
    bool ok = !memcmp(buf_ + 6 + len_, TAIL, 4) && buf_[6] == 0x02 && buf_[7] == 0xAA;
    if (ok && len_ >= 11) {
      const uint8_t* d = buf_ + 8;
      out.presence = d[0] != 0; out.moving = d[0] & 1;
      out.moveCm = d[1] | (d[2] << 8); out.moveEnergy = d[3];
      out.stillCm = d[4] | (d[5] << 8); out.stillEnergy = d[6];
    }
    n_ = 0;
    return ok;
  }
 private:
  uint8_t buf_[64];
  size_t n_ = 0;
  uint16_t len_ = 0;
};

/* ---------------------------------------------------------------------------------------------
   Wi-Fi probe counting. The board never stores or sends a MAC: it keeps the first 8 bytes of
   SHA-256(salt + MAC) and forgets them after `windowMs`. Staff phones are skipped by hash.        */
inline void hashMac(const uint8_t mac[6], const char* salt, uint8_t out8[8]) {
  Sha256 s; s.update(salt, strlen(salt)); s.update(mac, 6);
  uint8_t full[32]; s.finish(full); memcpy(out8, full, 8);
}
inline void hexHash(const uint8_t h8[8], char out[17]) { for (int i = 0; i < 8; i++) snprintf(out + i * 2, 3, "%02x", h8[i]); }

template <size_t CAP = 256>
class DeviceSet {
 public:
  void setWhitelist(const char* const* hexes, size_t n) { white_ = hexes; whiteN_ = n; }
  // returns true if this device was new in the current window
  bool see(const uint8_t mac[6], int8_t rssi, int8_t minRssi, const char* salt, uint32_t now) {
    if (rssi < minRssi) return false;          // too far away: probably outside the zone
    if (mac[0] & 0x01) return false;           // multicast source: not a phone
    uint8_t h[8]; hashMac(mac, salt, h);
    char hex[17]; hexHash(h, hex);
    for (size_t i = 0; i < whiteN_; i++) if (!strncmp(white_[i], hex, 16)) return false;
    for (size_t i = 0; i < n_; i++) if (!memcmp(e_[i].h, h, 8)) { e_[i].at = now; return false; }
    if (n_ < CAP) { memcpy(e_[n_].h, h, 8); e_[n_].at = now; n_++; return true; }
    return false;
  }
  // drop devices not heard for windowMs, return how many remain
  size_t count(uint32_t now, uint32_t windowMs) {
    size_t w = 0;
    for (size_t i = 0; i < n_; i++) if (now - e_[i].at <= windowMs) e_[w++] = e_[i];
    n_ = w;
    return n_;
  }
 private:
  struct E { uint8_t h[8]; uint32_t at; } e_[CAP];
  size_t n_ = 0;
  const char* const* white_ = nullptr;
  size_t whiteN_ = 0;
};

/* 802.11 management frame: subtype 4 = probe request; source address at byte 10. */
inline bool isProbeRequest(const uint8_t* frame, size_t len) { return len >= 24 && (frame[0] & 0xFC) == 0x40; }
inline const uint8_t* frameSource(const uint8_t* frame) { return frame + 10; }

/* ---------------------------------------------------------------------------------------------
   JSON payloads exactly as docs/mqtt.md describes them.                                           */
inline int counterJson(char* out, size_t n, const Store& s, float temp, float hum, uint32_t dwellAvgSec) {
  char t[12], h[12];
  if (temp != temp) strcpy(t, "null"); else snprintf(t, sizeof t, "%.1f", temp);   // NaN when the DHT11 read failed
  if (hum != hum) strcpy(h, "null"); else snprintf(h, sizeof h, "%.0f", hum);
  return snprintf(out, n, "{\"in\":%lu,\"out\":%lu,\"occupancy\":%d,\"queue\":%u,\"checkout\":%lu,\"gate\":%s,\"temp\":%s,\"hum\":%s,\"dwell_avg\":%lu,\"mode\":\"%s\",\"capacity\":%u}",
    (unsigned long)s.in, (unsigned long)s.out, s.occupancy(), s.queue, (unsigned long)s.checkout, s.gateOpen() ? "true" : "false", t, h,
    (unsigned long)dwellAvgSec, gateModeName(s.mode), s.capacity);
}
inline int statusJson(char* out, size_t n, int rssi, const char* ip, const char* fw, uint32_t uptimeSec, uint32_t heap) {
  return snprintf(out, n, "{\"rssi\":%d,\"ip\":\"%s\",\"fw\":\"%s\",\"uptime\":%lu,\"heap\":%lu}", rssi, ip, fw, (unsigned long)uptimeSec, (unsigned long)heap);
}
inline int radarJson(char* out, size_t n, const RadarReading& r) {
  return snprintf(out, n, "{\"presence\":%s,\"moving\":%s,\"move_cm\":%u,\"still_cm\":%u}", r.presence ? "true" : "false", r.moving ? "true" : "false", r.moveCm, r.stillCm);
}

}  // namespace sga
