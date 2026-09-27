/*
 * Drive tracker — starter firmware (ESP32-S3, Arduino core 3.x)
 *
 * UNTESTED SKELETON. It shows the structure described in docs/hardware.md: GNSS logging,
 * store-and-forward on SD, upload to a Traccar server (OsmAnd protocol) over 4G, on-device crash
 * detection, SMS fallback and a speed-interlocked immobilizer. Pin numbers and modem details
 * must be checked against your board before flashing.
 *
 * Libraries: TinyGPSPlus, TinyGSM, ArduinoHttpClient, SD (built in), Wire (built in).
 */

#define TINY_GSM_MODEM_SIM7600   // SIMCom A7672S speaks a compatible AT command set; verify with your module
#define TINY_GSM_RX_BUFFER 1024

#include <TinyGPSPlus.h>
#include <TinyGsmClient.h>
#include <ArduinoHttpClient.h>
#include <SD.h>
#include <SPI.h>
#include <Wire.h>

// ---------- Configuration ----------
const char APN[] = "airtelgprs.com";           // your IoT SIM's APN
const char SERVER[] = "tracker.example.com";   // Traccar host
const int  SERVER_PORT = 5055;                 // Traccar OsmAnd port
const char SOS_NUMBERS[][16] = {"+919845012345"};

const uint32_t LOG_EVERY_MS_DRIVING = 1000;
const uint32_t SEND_EVERY_MS_DRIVING = 10000;
const uint32_t SEND_EVERY_MS_STOLEN = 5000;
const uint32_t HEARTBEAT_MS_PARKED = 30UL * 60 * 1000;

const float CRASH_FROM_KMH = 60, CRASH_TO_KMH = 10, CRASH_WINDOW_S = 2, CRASH_G = 4.0;
const float IMMOBILIZE_BELOW_KMH = 20;

// ---------- Pins (example — adjust to your PCB) ----------
const int PIN_GNSS_RX = 17, PIN_GNSS_TX = 18;
const int PIN_MODEM_RX = 15, PIN_MODEM_TX = 16, PIN_MODEM_PWR = 4;
const int PIN_SD_CS = 10;
const int PIN_ACC = 5;          // ignition sense via optocoupler (LOW = ignition on)
const int PIN_RELAY = 6;        // HIGH = open the NC relay = fuel pump cut
const int PIN_VIN_ADC = 1;      // 12 V through a 1:6 divider

HardwareSerial gnssSerial(1);
HardwareSerial modemSerial(2);
TinyGPSPlus gps;
TinyGsm modem(modemSerial);
TinyGsmClient net(modem);
HttpClient http(net, SERVER, SERVER_PORT);

// ---------- State ----------
struct Point { uint32_t t; float lat, lng, kmh, heading; uint8_t sats; };
bool stolenMode = false;
bool immobilizeRequested = false;
bool immobilized = false;
uint32_t lastLog = 0, lastSend = 0, stationarySince = 0;
float speedHistory[4] = {0};  // last few seconds of speed for the crash rule

String imei;

// ---------- Store and forward ----------
// Points are appended to /queue.csv. /sent.idx holds the byte offset already uploaded, so a
// power cut or a long dead zone never loses data; upload resumes where it left off.
void enqueue(const Point &p) {
  File f = SD.open("/queue.csv", FILE_APPEND);
  if (!f) return;
  f.printf("%lu,%.6f,%.6f,%.1f,%.0f,%u\n", p.t, p.lat, p.lng, p.kmh, p.heading, p.sats);
  f.close();
}

uint32_t readSentOffset() {
  File f = SD.open("/sent.idx");
  if (!f) return 0;
  uint32_t off = f.parseInt();
  f.close();
  return off;
}

void writeSentOffset(uint32_t off) {
  File f = SD.open("/sent.idx", FILE_WRITE);
  if (!f) return;
  f.print(off);
  f.close();
}

// Traccar OsmAnd: one GET per point. Speed is in knots.
bool sendPoint(const String &line, bool ign) {
  uint32_t t; float lat, lng, kmh, hdg; unsigned sats;
  if (sscanf(line.c_str(), "%lu,%f,%f,%f,%f,%u", &t, &lat, &lng, &kmh, &hdg, &sats) != 6) return true;  // skip bad line
  String path = "/?id=" + imei + "&timestamp=" + String(t) + "&lat=" + String(lat, 6) + "&lon=" + String(lng, 6) +
                "&speed=" + String(kmh / 1.852, 1) + "&bearing=" + String(hdg, 0) + "&sat=" + String(sats) +
                "&ignition=" + (ign ? "true" : "false") + "&power=" + String(readVin(), 1);
  if (http.get(path) != 0) return false;
  int status = http.responseStatusCode();
  http.skipResponseHeaders();
  http.stop();
  return status == 200;
}

// Upload the backlog oldest-first, up to `maxPoints` per call.
void flushQueue(int maxPoints, bool ign) {
  if (!modem.isGprsConnected() && !modem.gprsConnect(APN)) return;  // still offline: keep buffering
  File f = SD.open("/queue.csv");
  if (!f) return;
  uint32_t off = readSentOffset();
  f.seek(off);
  int sent = 0;
  while (f.available() && sent < maxPoints) {
    String line = f.readStringUntil('\n');
    if (!sendPoint(line, ign)) break;
    off = f.position();
    sent++;
  }
  f.close();
  writeSentOffset(off);
  // Compact the queue file once everything is sent (a real build rotates files daily instead).
  File q = SD.open("/queue.csv");
  if (q && off >= q.size()) { q.close(); SD.remove("/queue.csv"); writeSentOffset(0); } else if (q) q.close();
}

// ---------- Sensors ----------
float readVin() { return analogReadMilliVolts(PIN_VIN_ADC) * 6.0f / 1000.0f; }
bool ignitionOn() { return digitalRead(PIN_ACC) == LOW; }

float readPeakG() {
  // Placeholder: read the IMU (LSM6DSOX / BMI270) at 100+ Hz over I2C and return the largest
  // acceleration magnitude since the last call. Use the IMU's wake-on-motion interrupt when parked.
  return 0.0f;
}

void sendSms(const String &text) {
  for (auto &n : SOS_NUMBERS) modem.sendSMS(n, text);
}

// ---------- Crash rule (same as the app) ----------
void checkCrash(float kmh) {
  for (int i = 3; i > 0; i--) speedHistory[i] = speedHistory[i - 1];
  speedHistory[0] = kmh;
  bool speedCollapse = speedHistory[(int)CRASH_WINDOW_S] >= CRASH_FROM_KMH && kmh <= CRASH_TO_KMH;
  bool impact = readPeakG() >= CRASH_G;
  if (!speedCollapse && !impact) return;

  String link = "https://maps.google.com/?q=" + String(gps.location.lat(), 6) + "," + String(gps.location.lng(), 6);
  // 1) Tell the server (the app shows the SOS screen). 2) SMS works without mobile data.
  http.get("/?id=" + imei + "&alarm=accident&lat=" + String(gps.location.lat(), 6) + "&lon=" + String(gps.location.lng(), 6));
  http.stop();
  sendSms("Drive: possible collision. Speed " + String(speedHistory[(int)CRASH_WINDOW_S], 0) + "->" + String(kmh, 0) + " km/h. " + link);
  // 3) Lock the audio/video ring buffer (-15 s / +15 s) so it's kept as evidence (not shown).
  memset(speedHistory, 0, sizeof(speedHistory));
}

// ---------- Immobilizer with speed interlock ----------
void updateImmobilizer(float kmh) {
  if (kmh < 1) { if (!stationarySince) stationarySince = millis(); } else stationarySince = 0;
  bool safe = kmh < IMMOBILIZE_BELOW_KMH && (stolenMode || (stationarySince && millis() - stationarySince > 5000));
  if (immobilizeRequested && !immobilized && safe) { digitalWrite(PIN_RELAY, HIGH); immobilized = true; }
  if (!immobilizeRequested && immobilized) { digitalWrite(PIN_RELAY, LOW); immobilized = false; }
}

// ---------- Commands ----------
// Traccar can send commands as SMS or over its protocol; here we accept simple SMS commands
// from the owner's number, e.g. "STOLEN ON", "IMMOB ON", "IMMOB OFF".
void pollSmsCommands() {
  // Placeholder: read unread SMS (AT+CMGL), check the sender against SOS_NUMBERS, then:
  //   "STOLEN ON"  -> stolenMode = true;  immobilizeRequested = true;
  //   "STOLEN OFF" -> stolenMode = false; immobilizeRequested = false;
  //   "IMMOB ON/OFF" -> immobilizeRequested = true/false;
}

// ---------- Setup / loop ----------
void setup() {
  Serial.begin(115200);
  pinMode(PIN_ACC, INPUT_PULLUP);
  pinMode(PIN_RELAY, OUTPUT);
  digitalWrite(PIN_RELAY, LOW);  // relay de-energised: NC contact closed, car drives normally
  pinMode(PIN_MODEM_PWR, OUTPUT);

  gnssSerial.begin(9600, SERIAL_8N1, PIN_GNSS_RX, PIN_GNSS_TX);
  modemSerial.begin(115200, SERIAL_8N1, PIN_MODEM_RX, PIN_MODEM_TX);
  Wire.begin();
  if (!SD.begin(PIN_SD_CS)) Serial.println("SD missing: running without offline buffer");

  digitalWrite(PIN_MODEM_PWR, HIGH); delay(1200); digitalWrite(PIN_MODEM_PWR, LOW);
  modem.restart();
  imei = modem.getIMEI();
  modem.gprsConnect(APN);  // fine if this fails: we keep logging to SD
}

void loop() {
  while (gnssSerial.available()) gps.encode(gnssSerial.read());

  const bool ign = ignitionOn();
  const uint32_t now = millis();
  const float kmh = gps.speed.isValid() ? gps.speed.kmph() : 0;

  if (gps.location.isUpdated() && gps.location.isValid() && (ign || stolenMode) && now - lastLog >= LOG_EVERY_MS_DRIVING) {
    lastLog = now;
    Point p;
    struct tm tmv = { gps.time.second(), gps.time.minute(), gps.time.hour(), gps.date.day(), gps.date.month() - 1, gps.date.year() - 1900 };
    p.t = mktime(&tmv);  // GNSS time (UTC), so buffered points keep their true timestamps
    p.lat = gps.location.lat(); p.lng = gps.location.lng();
    p.kmh = kmh; p.heading = gps.course.deg(); p.sats = gps.satellites.value();
    enqueue(p);
    checkCrash(kmh);
  }

  const uint32_t sendEvery = stolenMode ? SEND_EVERY_MS_STOLEN : ign ? SEND_EVERY_MS_DRIVING : HEARTBEAT_MS_PARKED;
  if (now - lastSend >= sendEvery) {
    lastSend = now;
    flushQueue(stolenMode ? 20 : 60, ign);
    pollSmsCommands();
    if (stolenMode && gps.location.isValid()) {
      static uint32_t lastSms = 0;
      if (now - lastSms > 120000) { lastSms = now; sendSms("Drive STOLEN: https://maps.google.com/?q=" + String(gps.location.lat(), 6) + "," + String(gps.location.lng(), 6)); }
    }
  }

  updateImmobilizer(kmh);

  // Parked: a real build enters light sleep here and wakes on the IMU motion interrupt or the ACC pin.
}
