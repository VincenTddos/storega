// Host-side tests for firmware/common. Run: sh firmware/test/run.sh
#include <cstdio>
#include <cstring>
#include <string>
#include "../common/storega_core.h"

using namespace sga;
static int fails = 0, checks = 0;
#define CHECK(c) do { checks++; if (!(c)) { fails++; printf("  ✗ %s:%d  %s\n", __FILE__, __LINE__, #c); } } while (0)
#define SECTION(name) printf("• %s\n", name)

static std::string sha(const char* s) {
  Sha256 h; h.update(s, strlen(s)); uint8_t o[32]; h.finish(o);
  char hex[65]; for (int i = 0; i < 32; i++) snprintf(hex + i * 2, 3, "%02x", o[i]); return hex;
}

// Walk the two beams through a sequence of (a, b, holdMs) steps, collecting events.
struct Step { bool a, b; uint32_t ms; };
static std::string walk(DoorCounter& d, std::initializer_list<Step> steps, uint32_t& t) {
  std::string out;
  for (auto s : steps) for (uint32_t i = 0; i < s.ms; i += 10, t += 10) {
    DoorEvent e = d.update(s.a, s.b, t);
    if (e == DoorEvent::In) out += "I"; else if (e == DoorEvent::Out) out += "O"; else if (e == DoorEvent::Waiting) out += "W";
  }
  return out;
}

int main() {
  SECTION("SHA-256 test vectors");
  CHECK(sha("") == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  CHECK(sha("abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  CHECK(sha("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq") == "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");

  SECTION("Door direction");
  { DoorCounter d; uint32_t t = 1;
    CHECK(walk(d, {{0,0,100},{1,0,200},{1,1,200},{0,1,200},{0,0,200}}, t) == "I");
    CHECK(walk(d, {{0,1,200},{1,1,200},{1,0,200},{0,0,200}}, t) == "O");
    CHECK(walk(d, {{1,0,300},{0,0,300}}, t) == "W");                       // looked in, walked away
    CHECK(walk(d, {{1,0,20},{0,0,300}}, t) == "");                         // 20 ms glitch is debounced
    CHECK(walk(d, {{1,0,3000},{0,0,300}}, t) == "W");                      // stood at the closed gate: one WAITING, not more
    CHECK(walk(d, {{1,0,150},{1,1,150},{0,0,200}}, t) == "I");            // both clear at once still counts
    CHECK(walk(d, {{1,0,150},{1,1,150},{0,1,150},{1,1,150},{0,1,150},{0,0,200}}, t) == "I");  // hesitated in the middle
  }

  SECTION("Store, gate and queue");
  { Store s; s.capacity = 2;
    CHECK(s.gateOpen());
    s.apply(DoorEvent::In); s.apply(DoorEvent::In);
    CHECK(s.occupancy() == 2 && !s.gateOpen());
    s.apply(DoorEvent::Waiting); s.apply(DoorEvent::Waiting);
    CHECK(s.queue == 2);
    s.apply(DoorEvent::Out); CHECK(s.gateOpen());
    s.apply(DoorEvent::In); CHECK(s.queue == 1);                          // someone from the queue walked in
    s.mode = GateMode::Open; s.apply(DoorEvent::Waiting); CHECK(s.queue == 1);  // nobody waits when the gate is open
    Store e; e.apply(DoorEvent::Out); CHECK(e.occupancy() == 0 && e.out == 0);  // never negative
    CHECK(!s.setCapacity(5) && !s.setCapacity(200) && s.setCapacity(30) && s.capacity == 30);
    GateMode m; CHECK(parseGateMode("closed", m) && m == GateMode::Closed && !parseGateMode("shut", m));
  }

  SECTION("Dwell (Little's law)");
  { DwellEstimator d; uint32_t t = 1000; d.tick(0, t);
    for (int i = 0; i < 600; i++) { t += 1000; d.tick(10, t); }   // 10 people for 10 minutes
    CHECK(d.averageSec(10) == 600); CHECK(d.averageSec(0) == 0);
  }

  SECTION("Checkout debounce");
  { CheckoutDebounce c; uint8_t a[4] = {1,2,3,4}, b[4] = {9,9,9,9};
    CHECK(c.accept(a, 4, 1000)); CHECK(!c.accept(a, 4, 2000)); CHECK(c.accept(b, 4, 2100)); CHECK(c.accept(a, 4, 2200)); CHECK(c.accept(a, 4, 9000)); }

  SECTION("LED bar and TM1637 text");
  { Bar b = ledBar(0, 40, 14); CHECK(b.lit == 1 && b.color == 0x00C850);
    b = ledBar(20, 40, 14); CHECK(b.lit == 7);
    b = ledBar(30, 40, 14); CHECK(b.color == 0xFF9500);
    b = ledBar(45, 40, 14); CHECK(b.lit == 14 && b.color == 0xFF2A1A);
    char txt[5]; displayText(txt, 19, false, 1500); CHECK(!strcmp(txt, "  19"));
    displayText(txt, 40, true, 1500); CHECK(!strcmp(txt, "FULL")); displayText(txt, 40, true, 2500); CHECK(!strcmp(txt, "  40")); }

  SECTION("LD2410 frames");
  { LD2410Parser p; RadarReading r;
    const uint8_t frame[] = {0xF4,0xF3,0xF2,0xF1, 0x0D,0x00, 0x02,0xAA, 0x03, 0x5A,0x00, 0x40, 0x2C,0x01, 0x22, 0x5A,0x00, 0x55,0x00, 0xF8,0xF7,0xF6,0xF5};
    bool got = false; for (uint8_t g : {0x00, 0xF4, 0x12}) got |= p.feed(g, r);   // garbage before the frame
    for (uint8_t c : frame) got |= p.feed(c, r);
    CHECK(got && r.presence && r.moving && r.moveCm == 90 && r.stillCm == 300 && r.moveEnergy == 0x40);
    uint8_t still[sizeof frame]; memcpy(still, frame, sizeof frame); still[8] = 0x02;
    got = false; for (uint8_t c : still) got |= p.feed(c, r); CHECK(got && r.presence && !r.moving);
    uint8_t bad[sizeof frame]; memcpy(bad, frame, sizeof frame); bad[sizeof bad - 1] = 0x00;
    RadarReading r2; got = false; for (uint8_t c : bad) got |= p.feed(c, r2); CHECK(!got);
  }

  SECTION("Wi-Fi device counting");
  { DeviceSet<8> s; const char* salt = "storega-2026";
    uint8_t p1[6] = {0x3C,0x22,0xFB,1,2,3}, p2[6] = {0x3C,0x22,0xFB,1,2,4}, mc[6] = {0x01,0,0x5E,0,0,1};
    CHECK(s.see(p1, -60, -75, salt, 1000)); CHECK(!s.see(p1, -58, -75, salt, 2000));
    CHECK(!s.see(p2, -80, -75, salt, 2000));               // too weak: outside the zone
    CHECK(!s.see(mc, -50, -75, salt, 2000));               // multicast
    CHECK(s.see(p2, -70, -75, salt, 3000));
    CHECK(s.count(3000, 60000) == 2); CHECK(s.count(63500, 60000) == 0);
    uint8_t h[8]; hashMac(p1, salt, h); char hex[17]; hexHash(h, hex);
    const char* staff[] = {hex}; DeviceSet<8> w; w.setWhitelist(staff, 1);
    CHECK(!w.see(p1, -50, -75, salt, 0) && w.see(p2, -50, -75, salt, 0));
    uint8_t h2[8]; hashMac(p1, "other-salt", h2); CHECK(memcmp(h, h2, 8) != 0);   // salt changes the hash
    uint8_t probe[24] = {0x40}, beacon[24] = {0x80}; CHECK(isProbeRequest(probe, 24) && !isProbeRequest(beacon, 24));
  }

  SECTION("JSON payloads");
  { Store s; s.in = 412; s.out = 393; s.checkout = 129; s.capacity = 40;
    char j[300]; counterJson(j, sizeof j, s, 24.14f, 60.4f, 1014);
    CHECK(std::string(j) == "{\"in\":412,\"out\":393,\"occupancy\":19,\"queue\":0,\"checkout\":129,\"gate\":true,\"temp\":24.1,\"hum\":60,\"dwell_avg\":1014,\"mode\":\"auto\",\"capacity\":40}");
    counterJson(j, sizeof j, s, 0.0f / 0.0f, 0.0f / 0.0f, 0); CHECK(strstr(j, "\"temp\":null,\"hum\":null") != nullptr);
    statusJson(j, sizeof j, -56, "192.168.50.31", "1.3.8", 22140, 181000);
    CHECK(std::string(j) == "{\"rssi\":-56,\"ip\":\"192.168.50.31\",\"fw\":\"1.3.8\",\"uptime\":22140,\"heap\":181000,\"reset\":\"other\"}");
  }

  SECTION("Occupancy correction, message stamps, command acks");
  { Store st; st.in = 50; st.out = 44;
    CHECK(st.setOccupancy(0) && st.occupancy() == 0 && st.in == 50);        // closing time: nobody is inside
    CHECK(st.setOccupancy(3) && st.occupancy() == 3);
    CHECK(!st.setOccupancy(51) && st.occupancy() == 3);                       // cannot be more than came in today
    CHECK(!st.setOccupancy(-1));
    char b[96] = "{\"raw\":4}";
    CHECK(stampJson(b, sizeof b, 17, 1730000000123ULL) > 0 && !strcmp(b, "{\"raw\":4,\"seq\":17,\"ts\":1730000000123}"));
    char small[20] = "{\"raw\":4}"; CHECK(stampJson(small, sizeof small, 1, 0) == -1 && !strcmp(small, "{\"raw\":4}"));  // too long: left untouched
    char a[128]; ackJson(a, sizeof a, "c12", "capacity", false, "out of range");
    CHECK(!strcmp(a, "{\"id\":\"c12\",\"action\":\"capacity\",\"ok\":false,\"reason\":\"out of range\"}"));
    ackJson(a, sizeof a, "c13", "gate", true, ""); CHECK(!strcmp(a, "{\"id\":\"c13\",\"action\":\"gate\",\"ok\":true}"));
    CHECK(!strcmp(resetReasonName(6), "watchdog") && !strcmp(resetReasonName(1), "poweron") && !strcmp(resetReasonName(9), "brownout"));
    char st2[160]; statusJson(st2, sizeof st2, -60, "10.0.0.2", "1.5.0", 12, 1000, "watchdog"); CHECK(strstr(st2, "\"reset\":\"watchdog\"") != nullptr);
  }

  printf("\n%d / %d checks passed\n", checks - fails, checks);
  return fails ? 1 : 0;
}
