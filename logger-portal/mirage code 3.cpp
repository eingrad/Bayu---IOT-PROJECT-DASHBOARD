// D1 R32 (ESP32) — Dust monitor tower light, threshold logic
// Relay module: 4-ch High/Low Level, jumpers S1-S4 = H
// HIGH-trigger: HIGH = relay ON, LOW = relay OFF
//
// !! VERIFY these 4 pins against your as-built wiring !!
//
// Thresholds (DOE limit = 10 mg/m3):
//   GREEN  : < 8.60          (release from yellow at 8.40)
//   YELLOW : 8.60 - 10.00    (blink 10s, then solid)
//   RED    : > 10.00 + siren (blink 10s, then solid, siren silences)
//
// Serial Monitor @ 115200, line ending = New Line.
// Type a dust value and press Enter. 'off' = all relays off.

#define RELAY_RED     26   // Relay 1
#define RELAY_YELLOW  25   // Relay 2
#define RELAY_GREEN   27   // Relay 3
#define RELAY_BUZZER  14   // Relay 4

#define ON   HIGH
#define OFF  LOW

// --- Thresholds (mg/m3) ---
const float T_YELLOW = 8.60;    // >= this -> YELLOW
const float T_RED    = 10.00;   // >  this -> RED + siren
const float HYST     = 0.20;    // deadband on release, stops relay chatter

#define BLINK_MS      500       // 1 Hz flash
#define BLINK_WINDOW  10000     // blink 10 s, then latch solid

#define IDX_RED     0
#define IDX_YELLOW  1
#define IDX_GREEN   2
#define IDX_BUZZER  3

enum Level { LVL_OFF, LVL_GREEN, LVL_YELLOW, LVL_RED };

const int   relays[]  = {RELAY_RED, RELAY_YELLOW, RELAY_GREEN, RELAY_BUZZER};
const char* lvlName[] = {"OFF", "GREEN", "YELLOW", "RED"};

Level    level      = LVL_OFF;
uint32_t levelStart = 0;
uint32_t lastBlink  = 0;
bool     blinkOn    = false;
bool     out[4]     = {false, false, false, false};

String   inBuf;

void drive(int i, bool on) {
  if (out[i] == on) return;          // never re-click a relay unnecessarily
  out[i] = on;
  digitalWrite(relays[i], on ? ON : OFF);
}

void allRelaysOff() {
  for (int i = 0; i < 4; i++) drive(i, false);
}

// map a reading to a level, with hysteresis on the way down
Level classify(float v, Level cur) {
  Level next;
  if      (v >  T_RED)    next = LVL_RED;
  else if (v >= T_YELLOW) next = LVL_YELLOW;
  else                    next = LVL_GREEN;

  // hold the higher level until the value clears the deadband
  if (cur == LVL_RED    && v >  T_RED    - HYST) next = LVL_RED;
  if (cur == LVL_YELLOW && next == LVL_GREEN
                        && v >  T_YELLOW - HYST) next = LVL_YELLOW;
  return next;
}

void setLevel(Level lv) {
  if (lv == level) return;
  level      = lv;
  levelStart = millis();
  lastBlink  = millis();
  blinkOn    = true;
  allRelaysOff();

  switch (level) {
    case LVL_GREEN:  drive(IDX_GREEN, true);  break;   // solid, no flash
    case LVL_YELLOW: drive(IDX_YELLOW, true); break;
    case LVL_RED:    drive(IDX_RED, true);
                     drive(IDX_BUZZER, true); break;
    case LVL_OFF:    break;
  }
  Serial.printf(">> %s\n", lvlName[level]);
}

// blink-then-solid for YELLOW and RED; siren pulses then silences
void updateOutputs() {
  if (level != LVL_YELLOW && level != LVL_RED) return;
  uint32_t now = millis();

  if (now - levelStart >= BLINK_WINDOW) {
    if (!blinkOn) {                       // latch solid once
      blinkOn = true;
      drive(level == LVL_RED ? IDX_RED : IDX_YELLOW, true);
    }
    if (level == LVL_RED) drive(IDX_BUZZER, true);   // auto-silence siren
    return;
  }

  if (now - lastBlink >= BLINK_MS) {
    lastBlink = now;
    blinkOn = !blinkOn;
    drive(level == LVL_RED ? IDX_RED : IDX_YELLOW, blinkOn);
    if (level == LVL_RED) drive(IDX_BUZZER, blinkOn);
  }
}

// call this from the Modbus poll once the GP4000H is wired
void applyReading(float mgm3) {
  Serial.printf("dust = %.2f mg/m3  ", mgm3);
  setLevel(classify(mgm3, level));
}

void setup() {
  Serial.begin(115200);

  for (int i = 0; i < 4; i++) {
    digitalWrite(relays[i], OFF);
    pinMode(relays[i], OUTPUT);
    digitalWrite(relays[i], OFF);
  }

  Serial.println("\n=== Dust Alert Panel (H-trigger) ===");
  Serial.printf("GREEN < %.2f | YELLOW %.2f-%.2f | RED > %.2f mg/m3\n",
                T_YELLOW, T_YELLOW, T_RED, T_RED);
  Serial.println("Type a dust value and press Enter. 'off' = all off.");
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      inBuf.trim();
      if (inBuf.length()) {
        if (inBuf == "off") { setLevel(LVL_OFF); allRelaysOff(); }
        else                { applyReading(inBuf.toFloat()); }
      }
      inBuf = "";
    } else {
      inBuf += c;
    }
  }

  updateOutputs();
}