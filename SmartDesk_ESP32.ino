#include <Arduino.h>
#include <Preferences.h>
Preferences preferences;
#include <SPI.h>

#include "Audio.h" // Install via Library Manager: "ESP32-audioI2S"
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <ArduinoJson.h> // Install via Library Manager: "ArduinoJson" by Benoit Blanchon
#include <TJpg_Decoder.h>
#include <XPT2046_Touchscreen.h>

// --- AI Voice Agent (I2S) Pins ---
#define I2S_BCLK 26
#define I2S_LRC 25
#define I2S_DOUT 22
Audio audio;
unsigned long lastVoicePollMs = 0;
const unsigned long VOICE_POLL_INTERVAL = 10000; // Poll every 10s

#include "driver/spi_slave.h"
#include "esp_heap_caps.h"

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

// =====================================================
// NETWORK & BACKEND INTEGRATION
// =====================================================
#include <HTTPClient.h>
#include <WiFi.h>
#include <time.h>

// TODO: Replace with your actual WiFi credentials
// 1. Update the WiFi name (EXACTLY matching your Mac, including spaces and
// caps)
const char *ssid = "smmart";

// 2. Update the WiFi password
const char *password = "smmart@26";

// 3. Update the Server IP to match your Mac's new IP on the hotspot network!
const char *serverName =
    "https://backend-kwid.onrender.com/api/devices/ESP32-S3-01/activity";

// =====================================================
// BACKEND API ENDPOINTS
// =====================================================
const char *taskServerURL =
    "https://backend-kwid.onrender.com/api/devices/ESP32-S3-01/tasks";
const char *statsServerURL =
    "https://backend-kwid.onrender.com/api/devices/ESP32-S3-01/stats";
const char *sessionBaseURL =
    "https://backend-kwid.onrender.com/api/sessions/ESP32-S3-01";
const char *sdwPointsURL =
    "https://backend-kwid.onrender.com/api/sessions/ESP32-S3-01/sdwpoints";
const char *voiceURL =
    "https://backend-kwid.onrender.com/api/voice/ESP32-S3-01/next";
const char *displayConfigURL =
    "https://backend-kwid.onrender.com/api/devices/ESP32-S3-01/display-config";

// =====================================================
// DEVICE DISPLAY CUSTOMIZATION (User Selectable)
// =====================================================
String breakDisplayMode = "SESSION"; // "SESSION" or "DAILY"
bool   showSessionTimer = true;
bool   showBreaks       = true;
bool   showProdScore    = true;
bool   showProdSpike    = true;
bool   showSelfRating   = true;
bool   showModerator    = true;

// =====================================================
// SESSION STATE MACHINE
// =====================================================
enum SessionState {
  SESSION_IDLE,       // nobody at desk
  SESSION_ACTIVE,     // person working
  SESSION_BREAK,      // person left (break timer running)
  SESSION_DYING,      // break >= 10 min — alarm!
  SESSION_INVALID,    // took > 3 breaks in session
  SESSION_ENDED,      // session completed, waiting for reset
  SESSION_LOCKED_OUT  // exceeded 10 invalid sessions — 48 hr lockout!
};

SessionState sessionState = SESSION_IDLE;

// 48-Hour Hard Lockout System (Exceeding 10 invalid sessions)
bool isDeviceLockedOut = false;
uint32_t lockoutRemainingSec = 0;
bool lockoutScreenDrawn = false;

unsigned long sessionStartMs = 0; // millis() when current active period began
unsigned long sessionTotalMs = 0; // accumulated active time (ms) across breaks
unsigned long breakStartMs = 0;   // millis() when current break began
unsigned long totalBreakMs = 0;   // accumulated break time (ms)
int sessionBreakCount = 0;        // how many 5m+ breaks taken this session
bool currentBreakCounted = false; // true once current absence has reached 5 minutes
int dailyBreakCount = 0;
unsigned long dailyBreakMs = 0;
int selfRating = 0; // 0 = unrated, 1-5
bool productivitySpike = false;
bool sessionDyingShown = false;

// 2-Hour Reverse Countdown & Extension Configuration
int targetDurationMinutes = 120; // 2 hrs default
bool extensionPromptActive = false;
bool extensionPromptShowOptions = false;
bool extensionPromptDismissed = false;
bool sessionCompletedShown = false;

// Sound & Alarm System
bool soundAlarmActive = false;
String soundAlarmMessage = "";
bool isInvalidSession = false;
bool alarmScreenDrawn = false;
unsigned long alarmTriggeredAtMs = 0;

// Alarm: flash screen red when session is dying
unsigned long dyingAlarmMs = 0;
bool dyingAlarmActive = false;

// SDW Points (fetched from backend)
int sdwWeeklyPts = 0;
int sdwMonthlyPts = 0;
bool sdwFetched = false;

// Moderator (fetched from backend — stubbed for now)
int moderatorCommands = 0;
int moderatorAlarms = 0;

// Break thresholds: 5 minutes to count as a break; 10 minutes to trigger dying alert
#define BREAK_COUNT_THRESHOLD_MS (5UL * 60UL * 1000UL) // 5 minutes before counting as break
#define BREAK_DYING_THRESHOLD_MS (10UL * 60UL * 1000UL)
#define DYING_GRACE_MS (30UL * 1000UL) // 30s to return after dying alarm

// =====================================================
// DYNAMIC DASHBOARD STATS
// =====================================================
int productivityScore = 0;
int totalEmployeesCount = 0;
int hourlyHistory[6] = {0, 0, 0, 0, 0, 0};
int weeklyHistory[6] = {0, 0, 0, 0, 0, 0};
char hourlyLabels[6][8] = {"", "", "", "", "", ""};
char weeklyLabels[6][8] = {"", "", "", "", "", ""};
bool showHourlyStats = true; // default to hourly
bool statsFetched = false;

#define MAX_TASKS 5

struct TaskItem {
  char title[64];
  char status[16];
  char priority[8];
};

TaskItem fetchedTasks[MAX_TASKS];
int fetchedTaskCount = 0;
bool tasksFetched = false;

// =====================================================
// ALERT / NOTIFICATION STATE
// =====================================================
#define MAX_ALERTS 5

struct AlertItem {
  char title[64];   // Task title that triggered the alert
  char priority[8]; // Priority of the task
  bool read;        // Has the user opened the Alerts page?
};

AlertItem alerts[MAX_ALERTS];
int alertCount = 0;       // Total alerts stored
int unreadAlertCount = 0; // Badge counter
int prevTaskCount = -1;   // Track previous count to detect new tasks
bool hasUnreadAlerts = false;

// =====================================================
// TFT
// =====================================================

#define TFT_CS 10
#define TFT_DC 8
#define TFT_RST 9

#define TFT_SCK 12
#define TFT_MISO 13
#define TFT_MOSI 11

// =====================================================
// TOUCH
// =====================================================

#define TOUCH_CS 14
#define TOUCH_IRQ 7

// =====================================================
// ESP32-CAM SPI
// =====================================================

#define CAM_SPI_MOSI 4
#define CAM_SPI_MISO 5
#define CAM_SPI_SCK 6
#define CAM_SPI_CS 15

#define CAM_READY_PIN 16

// =====================================================
// SPI SLAVE
// =====================================================

#define CAM_SPI_HOST SPI3_HOST

#define SPI_CHUNK_SIZE 2048

#define MAX_JPEG_SIZE 200000

#define FRAME_MAGIC 0xCAFE1234UL

// =====================================================
// HLK-LD2410C RADAR
// =====================================================
//
// LD2410C:
//
// LD2410C TX -> ESP32-S3 GPIO18 (RX)
// LD2410C RX -> ESP32-S3 GPIO17 (TX)
//
// UART1
// 256000 baud
// 8N1
//
// =====================================================

#define RADAR_RX_PIN 18 // LD2410C TX -> ESP32-S3 RX
#define RADAR_TX_PIN 17 // LD2410C RX -> ESP32-S3 TX

#define RADAR_BAUD 256000

HardwareSerial RadarSerial(1);

// =====================================================
// TFT OBJECT
// =====================================================

Adafruit_ILI9341 tft(TFT_CS, TFT_DC, TFT_RST);

// =====================================================
// TOUCH OBJECT
// =====================================================

XPT2046_Touchscreen touch(TOUCH_CS, TOUCH_IRQ);

// =====================================================
// PAGE SYSTEM
// =====================================================

enum Page {
  PAGE_HOME = 0,
  PAGE_TASKS,
  PAGE_STATS,
  PAGE_CAMERA,
  PAGE_ALERTS,
  PAGE_SETTINGS,
  PAGE_LOCKOUT
};

volatile Page currentPage = PAGE_HOME;

// =====================================================
// JPEG BUFFER
// =====================================================

uint8_t *jpegBuffer = nullptr;

volatile uint32_t jpegLength = 0;

size_t jpegBufferCapacity = 0;

// =====================================================
// CAMERA FRAME READY
// =====================================================

volatile bool cameraFrameReady = false;

// =====================================================
// DMA BUFFER
// =====================================================

uint8_t dmaBuffer[SPI_CHUNK_SIZE + 4] __attribute__((aligned(4)));

// =====================================================
// FRAME HEADER
// =====================================================

struct FrameHeader {
  uint32_t magic;
  uint32_t length;
};

// =====================================================
// CAMERA TASK
// =====================================================

TaskHandle_t cameraTaskHandle = nullptr;

// =====================================================
// UI COLORS
// =====================================================

#define COLOR_BG 0x1082
#define COLOR_PANEL 0x18E3
#define COLOR_PANEL2 0x2124
#define COLOR_TEXT ILI9341_WHITE
#define COLOR_MUTED 0x9CF3
#define COLOR_ACCENT 0x07FF
#define COLOR_GREEN 0x07E0
#define COLOR_RED 0xF800
#define COLOR_YELLOW 0xFFE0
#define COLOR_ORANGE 0xFD20
#define COLOR_BLUE 0x001F

// =====================================================
// TOUCH DEBOUNCE
// =====================================================

uint32_t lastTouchTime = 0;

#define TOUCH_DEBOUNCE_MS 250

// =====================================================
// JPEG DISPLAY CALLBACK
// =====================================================

bool jpegCallback(int16_t x, int16_t y, uint16_t w, uint16_t h,
                  uint16_t *bitmap) {
  tft.drawRGBBitmap(x, y, bitmap, w, h);

  return true;
}

// =====================================================
// JPEG BUFFER ALLOCATION
// =====================================================

bool ensureJpegBuffer(uint32_t requiredSize) {
  if (requiredSize == 0)
    return false;

  if (requiredSize > MAX_JPEG_SIZE)
    return false;

  if (jpegBuffer != nullptr && jpegBufferCapacity >= requiredSize) {
    return true;
  }

  Serial.print("Allocating JPEG buffer: ");

  Serial.print(requiredSize);

  Serial.println(" bytes");

  uint8_t *newBuffer = nullptr;

  // ===================================================
  // USE PSRAM IF AVAILABLE
  // ===================================================

  if (psramFound()) {
    newBuffer = (uint8_t *)heap_caps_malloc(requiredSize, MALLOC_CAP_SPIRAM |
                                                              MALLOC_CAP_8BIT);
  } else {
    newBuffer = (uint8_t *)heap_caps_malloc(requiredSize, MALLOC_CAP_8BIT);
  }

  if (newBuffer == nullptr) {
    Serial.println("JPEG buffer allocation FAILED!");

    Serial.print("Free heap: ");

    Serial.println(ESP.getFreeHeap());

    return false;
  }

  // ===================================================
  // FREE OLD BUFFER
  // ===================================================

  if (jpegBuffer != nullptr) {
    heap_caps_free(jpegBuffer);

    jpegBuffer = nullptr;
  }

  jpegBuffer = newBuffer;

  jpegBufferCapacity = requiredSize;

  Serial.print("JPEG buffer ready. Free heap: ");

  Serial.println(ESP.getFreeHeap());

  return true;
}

// =====================================================
// RECEIVE SPI TRANSACTION
// =====================================================

bool receiveSPI(uint8_t *buffer, uint32_t length) {
  spi_slave_transaction_t transaction;

  memset(&transaction, 0, sizeof(transaction));

  transaction.length = length * 8;

  transaction.rx_buffer = buffer;

  // ===================================================
  // TELL CAMERA S3 IS READY
  // ===================================================

  digitalWrite(CAM_READY_PIN, HIGH);

  // ===================================================
  // WAIT FOR CAMERA
  // ===================================================

  esp_err_t result =
      spi_slave_transmit(CAM_SPI_HOST, &transaction, portMAX_DELAY);

  // ===================================================
  // TRANSACTION COMPLETE
  // ===================================================

  digitalWrite(CAM_READY_PIN, LOW);

  if (result != ESP_OK) {
    Serial.print("SPI receive error: ");

    Serial.println(result);

    return false;
  }

  return true;
}

// =====================================================
// RECEIVE COMPLETE JPEG
// =====================================================

bool receiveFrame() {
  FrameHeader header;

  // ===================================================
  // RECEIVE HEADER
  // ===================================================

  if (!receiveSPI((uint8_t *)&header, sizeof(header))) {
    return false;
  }

  // ===================================================
  // CHECK MAGIC
  // ===================================================

  if (header.magic != FRAME_MAGIC) {
    Serial.print("BAD MAGIC: 0x");

    Serial.println(header.magic, HEX);

    return false;
  }

  // ===================================================
  // CHECK JPEG SIZE
  // ===================================================

  if (header.length == 0 || header.length > MAX_JPEG_SIZE) {
    Serial.print("BAD JPEG SIZE: ");

    Serial.println(header.length);

    return false;
  }

  // ===================================================
  // ALLOCATE JPEG BUFFER
  // ===================================================

  if (!ensureJpegBuffer(header.length)) {
    return false;
  }

  jpegLength = header.length;

  // ===================================================
  // RECEIVE JPEG DATA
  // ===================================================

  uint32_t offset = 0;

  while (offset < jpegLength) {
    uint32_t remaining = jpegLength - offset;

    uint32_t chunk = (remaining > SPI_CHUNK_SIZE) ? SPI_CHUNK_SIZE : remaining;

    // =================================================
    // ROUND TO 4 BYTES
    // =================================================

    uint32_t transferSize = (chunk + 3) & ~3;

    // =================================================
    // SAFETY CHECK
    // =================================================

    if (transferSize > sizeof(dmaBuffer)) {
      Serial.println("DMA buffer overflow!");

      return false;
    }

    // =================================================
    // RECEIVE INTO DMA BUFFER
    // =================================================

    if (!receiveSPI(dmaBuffer, transferSize)) {
      return false;
    }

    // =================================================
    // COPY ACTUAL JPEG DATA
    // =================================================

    memcpy(jpegBuffer + offset, dmaBuffer, chunk);

    offset += chunk;
  }

  return true;
}

// =====================================================
// INITIALIZE CAMERA SPI
// =====================================================

void initCameraSPI() {
  spi_bus_config_t busConfig;

  memset(&busConfig, 0, sizeof(busConfig));

  busConfig.mosi_io_num = CAM_SPI_MOSI;

  busConfig.miso_io_num = CAM_SPI_MISO;

  busConfig.sclk_io_num = CAM_SPI_SCK;

  busConfig.quadwp_io_num = -1;

  busConfig.quadhd_io_num = -1;

  busConfig.max_transfer_sz = SPI_CHUNK_SIZE;

  // ===================================================
  // SLAVE CONFIG
  // ===================================================

  spi_slave_interface_config_t slaveConfig;

  memset(&slaveConfig, 0, sizeof(slaveConfig));

  slaveConfig.spics_io_num = CAM_SPI_CS;

  slaveConfig.queue_size = 1;

  slaveConfig.mode = 0;

  // ===================================================
  // INITIALIZE
  // ===================================================

  esp_err_t result = spi_slave_initialize(CAM_SPI_HOST, &busConfig,
                                          &slaveConfig, SPI_DMA_CH_AUTO);

  if (result != ESP_OK) {
    Serial.print("Camera SPI init FAILED: ");

    Serial.println(result);

    while (true) {
      delay(1000);
    }
  }

  Serial.println("Camera SPI initialized!");
}

// =====================================================
// RADAR DATA STRUCTURE
// =====================================================

struct RadarData {
  uint8_t targetState;

  uint16_t movingDistance;
  uint8_t movingEnergy;

  uint16_t stationaryDistance;
  uint8_t stationaryEnergy;

  uint16_t detectionDistance;

  bool valid;

  uint32_t lastUpdate;
};

RadarData radar = {0, 0, 0, 0, 0, 0, false, 0};

// =====================================================
// RADAR GRAPH HISTORY
// =====================================================

#define RADAR_GRAPH_POINTS 70

uint16_t movingDistanceHistory[RADAR_GRAPH_POINTS];

uint16_t stationaryDistanceHistory[RADAR_GRAPH_POINTS];

uint8_t movingEnergyHistory[RADAR_GRAPH_POINTS];

uint8_t stationaryEnergyHistory[RADAR_GRAPH_POINTS];

uint16_t radarGraphIndex = 0;

// =====================================================
// RADAR RECEIVE BUFFER
// =====================================================

#define RADAR_RX_BUFFER_SIZE 128

uint8_t radarRxBuffer[RADAR_RX_BUFFER_SIZE];

uint16_t radarRxIndex = 0;

// =====================================================
// INITIALIZE RADAR
// =====================================================

void initRadar() {
  Serial.println();
  Serial.println("================================");

  Serial.println("INITIALIZING HLK-LD2410C");

  Serial.println("================================");

  RadarSerial.begin(RADAR_BAUD, SERIAL_8N1, RADAR_RX_PIN, RADAR_TX_PIN);

  delay(100);

  Serial.println("LD2410C UART READY");

  Serial.println("UART1 RX = GPIO18");

  Serial.println("UART1 TX = GPIO17");

  Serial.println("BAUD = 256000");

  memset(movingDistanceHistory, 0, sizeof(movingDistanceHistory));

  memset(stationaryDistanceHistory, 0, sizeof(stationaryDistanceHistory));

  memset(movingEnergyHistory, 0, sizeof(movingEnergyHistory));

  memset(stationaryEnergyHistory, 0, sizeof(stationaryEnergyHistory));
}

// =====================================================
// RADAR OCCUPANCY TEXT
// =====================================================

const char *getRadarStateText() {
  switch (radar.targetState) {
  case 0:
    return "NO PERSON";

  case 1:
    return "MOVING";

  case 2:
    return "STATIONARY";

  case 3:
    return "MOVING + STATIC";

  default:
    return "UNKNOWN";
  }
}

// =====================================================
// PARSE LD2410C FRAME
// =====================================================

bool parseRadarFrame(uint8_t *frame, uint16_t length) {
  if (length < 23 || length > RADAR_RX_BUFFER_SIZE) {
    return false;
  }

  // Declared payload length must match the received frame.
  uint16_t dataLength = frame[4] | ((uint16_t)frame[5] << 8);

  uint16_t expectedLength = 4 + 2 + dataLength + 4;

  if (expectedLength != length || dataLength < 13) {
    return false;
  }

  // ===================================================
  // HEADER
  // ===================================================

  if (frame[0] != 0xF4 || frame[1] != 0xF3 || frame[2] != 0xF2 ||
      frame[3] != 0xF1) {
    return false;
  }

  // ===================================================
  // FOOTER
  // ===================================================

  if (frame[length - 4] != 0xF8 || frame[length - 3] != 0xF7 ||
      frame[length - 2] != 0xF6 || frame[length - 1] != 0xF5) {
    return false;
  }

  // ===================================================
  // DATA TYPE
  // ===================================================

  if (frame[6] != 0x02) {
    return false;
  }

  // ===================================================
  // DATA HEADER
  // ===================================================

  if (frame[7] != 0xAA) {
    return false;
  }

  // ===================================================
  // TARGET STATE
  // ===================================================

  radar.targetState = frame[8];

  // ===================================================
  // MOVING TARGET DISTANCE
  // ===================================================

  radar.movingDistance = frame[9] | ((uint16_t)frame[10] << 8);

  // ===================================================
  // MOVING TARGET ENERGY
  // ===================================================

  radar.movingEnergy = frame[11];

  // ===================================================
  // STATIONARY TARGET DISTANCE
  // ===================================================

  radar.stationaryDistance = frame[12] | ((uint16_t)frame[13] << 8);

  // ===================================================
  // STATIONARY TARGET ENERGY
  // ===================================================

  radar.stationaryEnergy = frame[14];

  // ===================================================
  // DETECTION DISTANCE
  // ===================================================

  radar.detectionDistance = frame[15] | ((uint16_t)frame[16] << 8);

  radar.valid = true;

  radar.lastUpdate = millis();

  // ===================================================
  // ADD DATA TO GRAPH
  // ===================================================

  movingDistanceHistory[radarGraphIndex] = radar.movingDistance;

  stationaryDistanceHistory[radarGraphIndex] = radar.stationaryDistance;

  movingEnergyHistory[radarGraphIndex] = radar.movingEnergy;

  stationaryEnergyHistory[radarGraphIndex] = radar.stationaryEnergy;

  radarGraphIndex++;

  if (radarGraphIndex >= RADAR_GRAPH_POINTS) {
    radarGraphIndex = 0;
  }

  return true;
}

// =====================================================
// READ RADAR UART
// =====================================================

void readRadar() {
  while (RadarSerial.available()) {
    uint8_t data = RadarSerial.read();

    // =================================================
    // SEARCH FOR FRAME HEADER
    // =================================================

    if (radarRxIndex == 0) {
      if (data != 0xF4) {
        continue;
      }
    }

    radarRxBuffer[radarRxIndex] = data;

    radarRxIndex++;

    // =================================================
    // BUFFER OVERFLOW
    // =================================================

    if (radarRxIndex >= RADAR_RX_BUFFER_SIZE) {
      radarRxIndex = 0;
      continue;
    }

    // =================================================
    // CHECK FIRST 4 HEADER BYTES
    // =================================================

    if (radarRxIndex == 4) {
      if (radarRxBuffer[0] != 0xF4 || radarRxBuffer[1] != 0xF3 ||
          radarRxBuffer[2] != 0xF2 || radarRxBuffer[3] != 0xF1) {
        radarRxIndex = 0;
      }
    }

    // =================================================
    // GET FRAME LENGTH
    // =================================================

    if (radarRxIndex >= 6) {
      uint16_t dataLength =
          radarRxBuffer[4] | ((uint16_t)radarRxBuffer[5] << 8);

      uint16_t totalLength = 4 + 2 + dataLength + 4;

      // =================================================
      // FRAME COMPLETE
      // =================================================

      if (radarRxIndex >= totalLength) {
        parseRadarFrame(radarRxBuffer, totalLength);

        radarRxIndex = 0;
      }
    }
  }
}

// =====================================================
// DRAW GRAPH GRID
// =====================================================

void drawRadarGraphGrid(int x, int y, int width, int height,
                        const char *title) {
  // ===================================================
  // OUTLINE
  // ===================================================

  tft.drawRect(x, y, width, height, COLOR_MUTED);

  // ===================================================
  // TITLE
  // ===================================================

  tft.setTextSize(1);

  tft.setTextColor(COLOR_TEXT);

  tft.setCursor(x + 4, y + 3);

  tft.print(title);

  // ===================================================
  // GRID
  // ===================================================

  int plotTop = y + 15;

  int plotBottom = y + height - 3;

  // Horizontal lines

  for (int i = 1; i <= 3; i++) {
    int gy = plotTop + ((plotBottom - plotTop) * i / 4);

    tft.drawFastHLine(x + 2, gy, width - 4, 0x39E7);
  }

  // Vertical lines

  for (int i = 1; i <= 3; i++) {
    int gx = x + ((width - 4) * i / 4);

    tft.drawFastVLine(gx, plotTop, plotBottom - plotTop, 0x39E7);
  }
}

// =====================================================
// DRAW DISTANCE GRAPH
// =====================================================

void drawDistanceGraph(int x, int y, int width, int height, uint16_t *history) {
  int plotX = x + 2;

  int plotY = y + 15;

  int plotW = width - 4;

  int plotH = height - 18;

  // ===================================================
  // ERASE GRAPH AREA
  // ===================================================

  tft.fillRect(plotX + 1, plotY + 1, plotW - 2, plotH - 2, COLOR_BG);

  // ===================================================
  // REDRAW GRID
  // ===================================================

  for (int i = 1; i <= 3; i++) {
    int gy = plotY + (plotH * i / 4);

    tft.drawFastHLine(plotX, gy, plotW, 0x39E7);
  }

  for (int i = 1; i <= 3; i++) {
    int gx = plotX + (plotW * i / 4);

    tft.drawFastVLine(gx, plotY, plotH, 0x39E7);
  }

  // ===================================================
  // GRAPH
  // ===================================================

  for (int i = 0; i < RADAR_GRAPH_POINTS - 1; i++) {
    int index1 = (radarGraphIndex + i) % RADAR_GRAPH_POINTS;

    int index2 = (radarGraphIndex + i + 1) % RADAR_GRAPH_POINTS;

    uint16_t value1 = history[index1];

    uint16_t value2 = history[index2];

    // Maximum display distance = 800 cm

    if (value1 > 800)
      value1 = 800;

    if (value2 > 800)
      value2 = 800;

    int px1 = plotX + ((long)i * plotW / (RADAR_GRAPH_POINTS - 1));

    int px2 = plotX + ((long)(i + 1) * plotW / (RADAR_GRAPH_POINTS - 1));

    int py1 = plotY + plotH - ((long)value1 * plotH / 800);

    int py2 = plotY + plotH - ((long)value2 * plotH / 800);

    tft.drawLine(px1, py1, px2, py2, COLOR_GREEN);
  }
}

// =====================================================
// DRAW ENERGY GRAPH
// =====================================================

void drawEnergyGraph(int x, int y, int width, int height, uint8_t *history) {
  int plotX = x + 2;

  int plotY = y + 15;

  int plotW = width - 4;

  int plotH = height - 18;

  // ===================================================
  // ERASE
  // ===================================================

  tft.fillRect(plotX + 1, plotY + 1, plotW - 2, plotH - 2, COLOR_BG);

  // ===================================================
  // GRID
  // ===================================================

  for (int i = 1; i <= 3; i++) {
    int gy = plotY + (plotH * i / 4);

    tft.drawFastHLine(plotX, gy, plotW, 0x39E7);
  }

  for (int i = 1; i <= 3; i++) {
    int gx = plotX + (plotW * i / 4);

    tft.drawFastVLine(gx, plotY, plotH, 0x39E7);
  }

  // ===================================================
  // GRAPH
  // ===================================================

  for (int i = 0; i < RADAR_GRAPH_POINTS - 1; i++) {
    int index1 = (radarGraphIndex + i) % RADAR_GRAPH_POINTS;

    int index2 = (radarGraphIndex + i + 1) % RADAR_GRAPH_POINTS;

    uint8_t value1 = history[index1];

    uint8_t value2 = history[index2];

    int px1 = plotX + ((long)i * plotW / (RADAR_GRAPH_POINTS - 1));

    int px2 = plotX + ((long)(i + 1) * plotW / (RADAR_GRAPH_POINTS - 1));

    int py1 = plotY + plotH - ((long)value1 * plotH / 100);

    int py2 = plotY + plotH - ((long)value2 * plotH / 100);

    tft.drawLine(px1, py1, px2, py2, COLOR_ACCENT);
  }
}

// =====================================================
// TOP BAR
// =====================================================

void drawTopBar(const char *title) {
  tft.fillRect(0, 0, 320, 38, COLOR_PANEL2);

  tft.setTextColor(COLOR_TEXT);

  tft.setTextSize(2);

  tft.setCursor(10, 11);

  tft.print(title);
}

// =====================================================
// BOTTOM NAVIGATION
// =====================================================

void drawNavigation() {
  if (isDeviceLockedOut || sessionState == SESSION_LOCKED_OUT || currentPage == PAGE_LOCKOUT) {
    return;
  }

  const int navY = 195;
  const int navH = 45;
  const int itemW = 53;

  tft.fillRect(0, navY, 320, navH, COLOR_PANEL2);

  const char *labels[6] = {"HOME", "TASK", "STAT", "CAM", "ALRT", "SETT"};

  for (int i = 0; i < 6; i++) {
    int x = i * itemW;

    bool active = ((int)currentPage == i);

    if (active) {
      tft.fillRoundRect(x + 2, navY + 3, itemW - 4, navH - 6, 5, COLOR_ACCENT);
    }

    tft.setTextSize(1);

    if (active)
      tft.setTextColor(COLOR_BG);
    else
      tft.setTextColor(COLOR_MUTED);

    int textWidth = strlen(labels[i]) * 6;

    tft.setCursor(x + (itemW - textWidth) / 2, navY + 18);

    tft.print(labels[i]);

    // ===================================================
    // RED DOT BADGE on ALRT tab (index 4)
    // ===================================================
    if (i == 4 && hasUnreadAlerts) {
      // Draw red circle badge top-right of the ALRT tab
      int dotX = x + itemW - 10;
      int dotY = navY + 7;
      tft.fillCircle(dotX, dotY, 5, COLOR_RED);

      // Show count if > 1
      if (unreadAlertCount > 0 && unreadAlertCount < 10) {
        tft.setTextSize(1);
        tft.setTextColor(ILI9341_WHITE);
        tft.setCursor(dotX - 3, dotY - 4);
        tft.print(unreadAlertCount);
      }
    }
  }
}

// =====================================================
// MM PAGE
// =====================================================

void drawSettingsPage() {
  if (isDeviceLockedOut || sessionState == SESSION_LOCKED_OUT) {
    drawLockoutScreen();
    return;
  }
  tft.fillScreen(COLOR_BG);
  drawTopBar("SETTINGS & SDW POINTS");

  // ===================================================
  // SDW Coins Header
  // ===================================================
  tft.fillRoundRect(5, 34, 310, 28, 7, COLOR_PANEL);
  tft.fillCircle(22, 48, 9, COLOR_YELLOW);
  tft.setTextColor(COLOR_BG);
  tft.setTextSize(1);
  tft.setCursor(18, 44);
  tft.print("S");
  tft.setTextColor(COLOR_MUTED);
  tft.setTextSize(1);
  tft.setCursor(38, 38);
  tft.print("SMMART DEEP WORK COINS");
  tft.setTextColor(COLOR_MUTED);
  tft.setCursor(38, 50);
  tft.print("Earn 5 pts per 2hr+ session");

  // ===================================================
  // Weekly + Monthly Points cards
  // ===================================================
  int cY = 68, cH = 50, cW = 150;

  // Weekly
  tft.fillRoundRect(5, cY, cW, cH, 7, COLOR_PANEL);
  tft.setTextColor(COLOR_MUTED);
  tft.setTextSize(1);
  tft.setCursor(14, cY + 8);
  tft.print("THIS WEEK");
  tft.setTextColor(COLOR_YELLOW);
  tft.setTextSize(3);
  tft.setCursor(14, cY + 22);
  if (sdwFetched)
    tft.print(sdwWeeklyPts);
  else
    tft.print("--");
  tft.setTextSize(1);
  tft.setTextColor(COLOR_MUTED);
  tft.setCursor(55, cY + 33);
  tft.print(" pts");

  // Monthly
  tft.fillRoundRect(161, cY, cW, cH, 7, COLOR_PANEL);
  tft.setTextColor(COLOR_MUTED);
  tft.setTextSize(1);
  tft.setCursor(170, cY + 8);
  tft.print("THIS MONTH");
  tft.setTextColor(COLOR_YELLOW);
  tft.setTextSize(3);
  tft.setCursor(170, cY + 22);
  if (sdwFetched)
    tft.print(sdwMonthlyPts);
  else
    tft.print("--");
  tft.setTextSize(1);
  tft.setTextColor(COLOR_MUTED);
  tft.setCursor(211, cY + 33);
  tft.print(" pts");

  // ===================================================
  // Milestone bar: sessions needed for next reward
  // ===================================================
  int mY = 124;
  tft.fillRoundRect(5, mY, 310, 24, 6, COLOR_PANEL);
  tft.setTextColor(COLOR_MUTED);
  tft.setTextSize(1);
  tft.setCursor(12, mY + 4);
  int sessionsThisMonth = sdwFetched ? (sdwMonthlyPts / 5) : 0;
  tft.printf("MONTHLY SESSIONS: %d  |  Min 5 sessions for BLOOM badge",
             sessionsThisMonth);

  // Progress bar
  int barW = 300;
  int filled = min((sessionsThisMonth * barW) / 5, barW);
  tft.fillRoundRect(10, mY + 14, barW, 8, 3, COLOR_PANEL2);
  tft.fillRoundRect(10, mY + 14, filled, 8, 3, COLOR_YELLOW);

  // ===================================================
  // Current session info
  // ===================================================
  int sY = 153;
  tft.fillRoundRect(5, sY, 310, 36, 7, COLOR_PANEL);
  tft.setTextColor(COLOR_MUTED);
  tft.setTextSize(1);
  tft.setCursor(12, sY + 6);
  tft.print("CURRENT SESSION");

  unsigned long displayMs = sessionTotalMs;
  if (sessionState == SESSION_ACTIVE && sessionStartMs > 0) {
    displayMs += (millis() - sessionStartMs);
  }
  unsigned long dispMin = (displayMs / 1000) / 60;

  tft.setTextColor(sessionState == SESSION_ACTIVE ? COLOR_GREEN : COLOR_MUTED);
  tft.setCursor(12, sY + 20);
  tft.printf("Active: %lum   Breaks: %d   Self Rating: %d/5", dispMin,
             sessionBreakCount, selfRating);

  drawNavigation();
}

// Forward declarations
void drawAlarmScreen();
void drawExtensionPrompt();
void drawExtensionOptions();
void drawSessionCompletedScreen();
void triggerSessionCompleted();

// =====================================================
// ALARM SCREEN (AWAY 30S OR INVALID SESSION)
// =====================================================
void drawAlarmScreen() {
  tft.fillScreen(COLOR_BG);
  alarmScreenDrawn = true;

  // Top Warning Header
  tft.fillRoundRect(10, 10, 300, 36, 6, isInvalidSession ? COLOR_RED : COLOR_ORANGE);
  tft.setTextColor(ILI9341_WHITE);
  tft.setTextSize(2);
  tft.setCursor(25, 20);
  tft.print(isInvalidSession ? "[!] SOUND: ALARM [!]" : "[!] SOUND: BEEPING [!]");

  // Center Message Box
  tft.fillRoundRect(10, 52, 300, 85, 6, COLOR_PANEL);
  tft.setTextSize(2);
  tft.setTextColor(isInvalidSession ? COLOR_RED : COLOR_YELLOW);
  tft.setCursor(20, 62);
  if (isInvalidSession) {
    tft.print("SESSION INVALID & DIED");
    tft.setTextSize(1);
    tft.setTextColor(COLOR_TEXT);
    tft.setCursor(20, 88);
    tft.print("Exceeded limit of 3 breaks (5m+ each).");
    tft.setCursor(20, 104);
    tft.print("Session terminated. 0 SDW points.");
  } else {
    tft.print("AWAY ALERT (30s)");
    tft.setTextSize(1);
    tft.setTextColor(COLOR_TEXT);
    tft.setCursor(20, 88);
    tft.print("You left desk for 30s. Come back to study!");
    tft.setCursor(20, 104);
    if (currentBreakCounted) {
      tft.printf("Break %d of 3 max allowed (crossed 5m).", sessionBreakCount);
    } else {
      tft.printf("Away < 5m (Breaks: %d/3 max. Not a break yet)", sessionBreakCount);
    }
  }

  // BIG STOP SOUND BUTTON
  tft.fillRoundRect(25, 145, 270, 52, 8, COLOR_RED);
  tft.drawRoundRect(25, 145, 270, 52, 8, ILI9341_WHITE);
  tft.setTextColor(ILI9341_WHITE);
  tft.setTextSize(2);
  tft.setCursor(75, 162);
  tft.print("STOP SOUND");

  // Notice at bottom
  tft.setTextSize(1);
  tft.setTextColor(COLOR_MUTED);
  tft.setCursor(25, 208);
  tft.print("Sound does not stop until you tap STOP SOUND");
}

// =====================================================
// 48-HOUR HARD LOCKOUT SCREEN (Exceeded 10 invalid sessions)
// =====================================================
void drawLockoutScreen() {
  currentPage = PAGE_LOCKOUT;
  tft.fillScreen(COLOR_BG);

  // Red Lockout Header Banner
  tft.fillRoundRect(15, 12, 290, 42, 6, COLOR_RED);
  tft.drawRoundRect(15, 12, 290, 42, 6, ILI9341_WHITE);
  tft.setTextColor(ILI9341_WHITE);
  tft.setTextSize(2);
  tft.setCursor(35, 24);
  tft.print("SYSTEM LOCKED OUT");

  // Warning text
  tft.setTextSize(1);
  tft.setTextColor(COLOR_YELLOW);
  tft.setCursor(25, 66);
  tft.print("Exceeded 10 Invalid Sessions (>3 breaks)");
  tft.setTextColor(COLOR_TEXT);
  tft.setCursor(25, 82);
  tft.print("Access restricted for 48 Hours.");

  // Center Countdown Card Box
  tft.fillRoundRect(20, 102, 280, 68, 8, COLOR_PANEL);
  tft.drawRoundRect(20, 102, 280, 68, 8, COLOR_RED);

  tft.setTextColor(COLOR_MUTED);
  tft.setTextSize(1);
  tft.setCursor(35, 112);
  tft.print("REVERSE COUNTDOWN REMAINING:");

  // Big Timer
  uint32_t sec = lockoutRemainingSec;
  uint32_t hours = sec / 3600;
  uint32_t mins = (sec % 3600) / 60;
  uint32_t secs = sec % 60;

  char timeBuf[32];
  if (hours > 0) {
    snprintf(timeBuf, sizeof(timeBuf), "%02uh %02um %02us", hours, mins, secs);
  } else {
    snprintf(timeBuf, sizeof(timeBuf), "%02um %02us", mins, secs);
  }

  tft.setTextColor(COLOR_RED);
  tft.setTextSize(3);
  tft.setCursor(hours > 0 ? 35 : 75, 132);
  tft.print(timeBuf);

  // Bottom Notice
  tft.setTextSize(1);
  tft.setTextColor(COLOR_MUTED);
  tft.setCursor(25, 185);
  tft.print("Power cycling or reset will NOT bypass.");
  tft.setCursor(25, 202);
  tft.print("Contact administrator to unlock desk.");

  lockoutScreenDrawn = true;
}

void updateLockoutCountdown() {
  if (!lockoutScreenDrawn || currentPage != PAGE_LOCKOUT) {
    drawLockoutScreen();
    return;
  }

  // Overwrite only the timer text area in the center card box
  tft.fillRect(25, 130, 270, 32, COLOR_PANEL);

  uint32_t sec = lockoutRemainingSec;
  uint32_t hours = sec / 3600;
  uint32_t mins = (sec % 3600) / 60;
  uint32_t secs = sec % 60;

  char timeBuf[32];
  if (hours > 0) {
    snprintf(timeBuf, sizeof(timeBuf), "%02uh %02um %02us", hours, mins, secs);
  } else {
    snprintf(timeBuf, sizeof(timeBuf), "%02um %02us", mins, secs);
  }

  tft.setTextColor(COLOR_RED);
  tft.setTextSize(3);
  tft.setCursor(hours > 0 ? 35 : 75, 132);
  tft.print(timeBuf);
}

// =====================================================
// 15-MIN EXTENSION PROMPT
// =====================================================
void drawExtensionPrompt() {
  tft.fillScreen(COLOR_BG);

  // Modal box
  tft.fillRoundRect(15, 15, 290, 205, 8, COLOR_PANEL);
  tft.drawRoundRect(15, 15, 290, 205, 8, COLOR_ACCENT);

  tft.setTextColor(COLOR_YELLOW);
  tft.setTextSize(2);
  tft.setCursor(30, 28);
  tft.print("15 MINS REMAINING!");

  tft.setTextColor(COLOR_TEXT);
  tft.setTextSize(1);
  tft.setCursor(30, 54);
  tft.print("Your 2-hr study session is almost complete.");
  tft.setCursor(30, 68);
  tft.print("Would you like to extend this session?");

  // YES Button (Green)
  tft.fillRoundRect(30, 92, 120, 55, 6, COLOR_GREEN);
  tft.setTextColor(ILI9341_BLACK);
  tft.setTextSize(2);
  tft.setCursor(65, 105);
  tft.print("YES");
  tft.setTextSize(1);
  tft.setCursor(45, 128);
  tft.print("Add More Time");

  // NO Button (Muted/Panel2)
  tft.fillRoundRect(170, 92, 120, 55, 6, COLOR_PANEL2);
  tft.drawRoundRect(170, 92, 120, 55, 6, COLOR_MUTED);
  tft.setTextColor(ILI9341_WHITE);
  tft.setTextSize(2);
  tft.setCursor(215, 105);
  tft.print("NO");
  tft.setTextSize(1);
  tft.setCursor(185, 128);
  tft.print("Finish at 2h");

  // Bottom info
  tft.setTextColor(COLOR_MUTED);
  tft.setTextSize(1);
  tft.setCursor(30, 168);
  tft.print("Can also be extended from Web Dashboard");
}

// =====================================================
// EXTENSION OPTIONS SCREEN (+15m, +30m, +45m, +1h)
// =====================================================
void drawExtensionOptions() {
  tft.fillScreen(COLOR_BG);

  tft.fillRoundRect(15, 12, 290, 212, 8, COLOR_PANEL);
  tft.drawRoundRect(15, 12, 290, 212, 8, COLOR_ACCENT);

  tft.setTextColor(COLOR_ACCENT);
  tft.setTextSize(2);
  tft.setCursor(30, 24);
  tft.print("CHOOSE EXTENSION:");

  // [+15m] (X: 30, Y: 52, W: 120, H: 44)
  tft.fillRoundRect(30, 52, 120, 44, 6, COLOR_PANEL2);
  tft.drawRoundRect(30, 52, 120, 44, 6, COLOR_ACCENT);
  tft.setTextColor(COLOR_TEXT);
  tft.setTextSize(2);
  tft.setCursor(46, 66);
  tft.print("+15 MIN");

  // [+30m] (X: 170, Y: 52, W: 120, H: 44)
  tft.fillRoundRect(170, 52, 120, 44, 6, COLOR_PANEL2);
  tft.drawRoundRect(170, 52, 120, 44, 6, COLOR_ACCENT);
  tft.setTextColor(COLOR_TEXT);
  tft.setTextSize(2);
  tft.setCursor(186, 66);
  tft.print("+30 MIN");

  // [+45m] (X: 30, Y: 104, W: 120, H: 44)
  tft.fillRoundRect(30, 104, 120, 44, 6, COLOR_PANEL2);
  tft.drawRoundRect(30, 104, 120, 44, 6, COLOR_ACCENT);
  tft.setTextColor(COLOR_TEXT);
  tft.setTextSize(2);
  tft.setCursor(46, 118);
  tft.print("+45 MIN");

  // [+1 hr] (X: 170, Y: 104, W: 120, H: 44)
  tft.fillRoundRect(170, 104, 120, 44, 6, COLOR_PANEL2);
  tft.drawRoundRect(170, 104, 120, 44, 6, COLOR_ACCENT);
  tft.setTextColor(COLOR_TEXT);
  tft.setTextSize(2);
  tft.setCursor(186, 118);
  tft.print("+1 HOUR");

  // CANCEL button (X: 90, Y: 160, W: 140, H: 36)
  tft.fillRoundRect(90, 160, 140, 36, 6, COLOR_PANEL);
  tft.drawRoundRect(90, 160, 140, 36, 6, COLOR_MUTED);
  tft.setTextColor(COLOR_MUTED);
  tft.setTextSize(1);
  tft.setCursor(135, 173);
  tft.print("CANCEL");
}

// =====================================================
// SESSION COMPLETED & 1-5 RATING SCREEN
// =====================================================
void drawSessionCompletedScreen() {
  tft.fillScreen(COLOR_BG);

  // Header Box
  tft.fillRoundRect(10, 10, 300, 48, 6, COLOR_GREEN);
  tft.setTextColor(ILI9341_BLACK);
  tft.setTextSize(2);
  tft.setCursor(35, 18);
  tft.print("SESSION COMPLETED!");
  tft.setTextSize(1);
  tft.setCursor(65, 38);
  tft.print("+5 SDW POINTS AWARDED");

  // Rating Subtitle
  tft.setTextColor(COLOR_TEXT);
  tft.setTextSize(1);
  tft.setCursor(20, 68);
  tft.print("How was your session? Tap 1 to 5 stars:");

  // 5 Star Buttons
  for (int i = 1; i <= 5; i++) {
    int sX = 15 + (i - 1) * 60;
    int sY = 88;
    int sW = 50;
    int sH = 46;
    bool isSelected = (selfRating == i);
    tft.fillRoundRect(sX, sY, sW, sH, 6, isSelected ? COLOR_YELLOW : COLOR_PANEL2);
    tft.drawRoundRect(sX, sY, sW, sH, 6, isSelected ? COLOR_ORANGE : COLOR_MUTED);
    tft.setTextColor(isSelected ? ILI9341_BLACK : COLOR_TEXT);
    tft.setTextSize(2);
    tft.setCursor(sX + 10, sY + 14);
    tft.printf("*%d", i);
  }

  if (selfRating > 0) {
    tft.setTextColor(COLOR_YELLOW);
    tft.setTextSize(1);
    tft.setCursor(20, 146);
    tft.printf("Rating confirmed: %d Stars! Syncing...", selfRating);
  }

  // Finish Button
  tft.fillRoundRect(35, 168, 250, 46, 6, COLOR_ACCENT);
  tft.setTextColor(ILI9341_BLACK);
  tft.setTextSize(2);
  tft.setCursor(75, 182);
  tft.print("DONE / FINISH");
}

void triggerSessionCompleted() {
  if (sessionCompletedShown) return;
  sessionState = SESSION_ENDED;
  sessionCompletedShown = true;
  drawSessionCompletedScreen(); // Render screen immediately with zero lag
  Serial.println("[SESSION] 2-Hour Goal Reached! Session completed successfully (+5 SDW pts)");
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(String(sessionBaseURL) + "/end");
    http.setTimeout(1500);
    http.addHeader("Content-Type", "application/json");
    unsigned long activeMins = sessionTotalMs / 60000;
    http.POST("{\"activeMinutes\":" + String(activeMins) + ",\"selfRating\":" + String(selfRating) + "}");
    http.end();
    vTaskDelay(pdMS_TO_TICKS(1));
  }
}

// =====================================================
// HOME PAGE
// =====================================================

void drawHomePage() {
  if (isDeviceLockedOut || sessionState == SESSION_LOCKED_OUT) {
    drawLockoutScreen();
    return;
  }

  if (soundAlarmActive) {
    if (!alarmScreenDrawn) {
      drawAlarmScreen();
    }
    return;
  }
  alarmScreenDrawn = false;
  if (sessionCompletedShown) {
    drawSessionCompletedScreen();
    return;
  }
  if (extensionPromptActive) {
    if (extensionPromptShowOptions) {
      drawExtensionOptions();
    } else {
      drawExtensionPrompt();
    }
    return;
  }

  tft.fillScreen(COLOR_BG);

  int r1Y = 5, r1H = 55;

  // ── ROW 1: Uninterrupted Session (left 190px)
  tft.fillRoundRect(5, r1Y, 190, r1H, 7, COLOR_PANEL);
  tft.setTextSize(1);
  tft.setCursor(12, r1Y + 6);
  if (sessionState == SESSION_IDLE) {
    tft.setTextColor(COLOR_GREEN);
    tft.print("TAP TO START SESSION");
  } else {
    tft.setTextColor(COLOR_MUTED);
    tft.print(showSessionTimer ? "UNINTERRUPTED SESSION" : "SESSION DISABLED");
  }

  // ── ROW 1: Breaks (right 120px)
  tft.fillRoundRect(198, r1Y, 120, r1H, 7, COLOR_PANEL);
  tft.setTextColor(COLOR_MUTED);
  tft.setTextSize(1);
  tft.setCursor(205, r1Y + 6);
  if (!showBreaks) {
    tft.print("BREAKS OFF");
  } else if (breakDisplayMode == "DAILY") {
    tft.print("TODAY'S BREAKS");
  } else {
    tft.print("SESSION BREAKS");
  }

  // ── ROW 2: Prod Score | Prod Spike | Self Rating ────────
  int r2Y = 70, r2H = 55;
  tft.fillRoundRect(5, r2Y, 100, r2H, 7, COLOR_PANEL);
  tft.setTextColor(COLOR_MUTED);
  tft.setTextSize(1);
  tft.setCursor(12, r2Y + 6);
  tft.print(showProdScore ? "PROD SCORE" : "");

  tft.fillRoundRect(109, r2Y, 100, r2H, 7, COLOR_PANEL);
  tft.setTextColor(COLOR_MUTED);
  tft.setTextSize(1);
  tft.setCursor(115, r2Y + 6);
  tft.print(showProdSpike ? "PROD SPIKE" : "");

  tft.fillRoundRect(213, r2Y, 105, r2H, 7, COLOR_PANEL);
  tft.setTextColor(COLOR_MUTED);
  tft.setTextSize(1);
  tft.setCursor(218, r2Y + 6);
  tft.print(showSelfRating ? "SELF RATING" : "");

  // ── ROW 3: Moderator Intervention ───────────────────────
  int r3Y = 135, r3H = 55;
  tft.fillRoundRect(5, r3Y, 313, r3H, 7, COLOR_PANEL);
  if (showModerator) {
    tft.setTextColor(COLOR_MUTED);
    tft.setTextSize(1);
    tft.setCursor(12, r3Y + 6);
    tft.print("MODERATOR INTERVENTION");
    tft.setTextColor(COLOR_ACCENT);
    tft.setCursor(12, r3Y + 26);
    tft.print("CMD:");
    tft.setTextColor(COLOR_MUTED);
    tft.setCursor(160, r3Y + 26);
    tft.print("ALARMS RAISED:");
  }
  // live values drawn in updateHomePageLiveValues()

  drawNavigation();
  updateHomePageLiveValues();
}

void updateHomePageLiveValues() {
  if (isDeviceLockedOut || sessionState == SESSION_LOCKED_OUT || currentPage != PAGE_HOME)
    return;
  if (soundAlarmActive || sessionState == SESSION_DYING || extensionPromptActive || sessionCompletedShown)
    return; // Don't draw over alerts / prompts

  unsigned long nowMs = millis();

  // ── Reverse Timer (Counts down from 2h / target duration) ───
  int r1Y = 5;
  tft.fillRect(10, r1Y + 16, 180, 36, COLOR_PANEL); // clear timer area
  if (sessionState == SESSION_IDLE) {
    // Prominent "START TIMER" button on screen
    tft.fillRoundRect(10, r1Y + 18, 178, 32, 6, COLOR_GREEN);
    tft.setTextColor(ILI9341_BLACK);
    tft.setTextSize(2);
    tft.setCursor(18, r1Y + 26);
    tft.print("> START TIMER");
  } else if (showSessionTimer) {
    unsigned long activeSec = sessionTotalMs / 1000;
    if (sessionState == SESSION_ACTIVE && sessionStartMs > 0)
      activeSec += (nowMs - sessionStartMs) / 1000;

    unsigned long targetSec = (unsigned long)targetDurationMinutes * 60UL;
    unsigned long remainingSec = (activeSec >= targetSec) ? 0 : (targetSec - activeSec);

    // Goal reached: trigger session completed
    if (remainingSec == 0 && (sessionState == SESSION_ACTIVE || sessionState == SESSION_BREAK)) {
      triggerSessionCompleted();
      return;
    }

    // Check 15-minute extension prompt trigger
    if (remainingSec <= 900 && remainingSec > 0 && !extensionPromptDismissed && !extensionPromptActive && (sessionState == SESSION_ACTIVE || sessionState == SESSION_BREAK)) {
      extensionPromptActive = true;
      extensionPromptShowOptions = false;
      drawExtensionPrompt();
      return;
    }

    unsigned long remH = remainingSec / 3600;
    unsigned long remM = (remainingSec % 3600) / 60;
    unsigned long remS = remainingSec % 60;

    tft.setTextColor(sessionState == SESSION_ACTIVE  ? COLOR_GREEN
                     : sessionState == SESSION_BREAK ? COLOR_YELLOW
                     : sessionState == SESSION_INVALID ? COLOR_RED
                                                     : COLOR_TEXT);
    char timeBuf[16];
    if (remH > 0) {
      tft.setTextSize(3);
      tft.setCursor(12, r1Y + 22);
      sprintf(timeBuf, "%lu:%02lu:%02lu", remH, remM, remS);
    } else {
      tft.setTextSize(3);
      tft.setCursor(20, r1Y + 22);
      sprintf(timeBuf, "%02lu:%02lu", remM, remS);
    }
    tft.print(timeBuf);
  } else {
    tft.setTextColor(COLOR_MUTED);
    tft.setTextSize(2);
    tft.setCursor(12, r1Y + 25);
    tft.print("--:--");
  }

  // Status dot indicator
  uint16_t statusColor = COLOR_MUTED;
  if (sessionState == SESSION_ACTIVE)
    statusColor = COLOR_GREEN;
  else if (sessionState == SESSION_BREAK)
    statusColor = COLOR_YELLOW;
  else if (sessionState == SESSION_INVALID)
    statusColor = COLOR_RED;
  tft.fillCircle(175, r1Y + 34, 5, statusColor);

  // ── Breaks (right block) ─────────────────────────
  tft.fillRect(205, r1Y + 16, 108, 34, COLOR_PANEL);
  if (showBreaks) {
    unsigned long breakDispMs = 0;
    int displayBreakCount = 0;

    if (breakDisplayMode == "DAILY") {
      breakDispMs = dailyBreakMs;
      displayBreakCount = dailyBreakCount;
    } else {
      breakDispMs = totalBreakMs;
      displayBreakCount = sessionBreakCount;
    }

    if (sessionState == SESSION_BREAK && breakStartMs > 0 && currentBreakCounted)
      breakDispMs += (nowMs - breakStartMs);
    unsigned long bkMins = breakDispMs / 60000;

    tft.setTextColor(displayBreakCount > 0 ? COLOR_YELLOW : COLOR_TEXT);
    tft.setTextSize(2);
    tft.setCursor(205, r1Y + 20);
    tft.printf("%d brks", displayBreakCount);
    tft.setTextColor(COLOR_MUTED);
    tft.setTextSize(1);
    tft.setCursor(205, r1Y + 38);
    if (breakDisplayMode == "DAILY") {
      tft.printf("%luM today", bkMins);
    } else {
      tft.printf("%luM session", bkMins);
    }
  }

  // ── Prod Score ─────────────────────────────────────────
  int r2Y = 70;
  tft.fillRect(12, r2Y + 20, 90, 30, COLOR_PANEL);
  if (showProdScore) {
    tft.setTextColor(productivityScore >= 80 ? COLOR_GREEN : COLOR_YELLOW);
    tft.setTextSize(2);
    tft.setCursor(12, r2Y + 26);
    if (statsFetched)
      tft.printf("%d%%", productivityScore);
    else
      tft.print("--%");
  }

  // ── Prod Spike + green tick if selfRating > 3.5 ────────
  tft.fillRect(113, r2Y + 20, 90, 32, COLOR_PANEL);
  if (showProdSpike) {
    if (productivitySpike) {
      uint16_t spikeColor = COLOR_RED; // Default to red for < 3
      if (selfRating > 3)
        spikeColor = COLOR_GREEN;
      else if (selfRating == 3)
        spikeColor = COLOR_ORANGE;

      tft.setTextColor(spikeColor);
      tft.setTextSize(1);
      tft.setCursor(113, r2Y + 26);

      if (selfRating > 3) {
        tft.print("YES  OK");
        tft.fillCircle(195, r2Y + 32, 7, spikeColor);
        tft.setTextColor(COLOR_BG);
        tft.setCursor(191, r2Y + 28);
        tft.print("v");
      } else if (selfRating == 3) {
        tft.print("AVG");
        tft.fillCircle(195, r2Y + 32, 7, spikeColor);
        tft.setTextColor(COLOR_BG);
        tft.setCursor(191, r2Y + 28);
        tft.print("-");
      } else {
        tft.print("POOR");
        tft.fillCircle(195, r2Y + 32, 7, spikeColor);
        tft.setTextColor(COLOR_BG);
        tft.setCursor(191, r2Y + 28);
        tft.print("x");
      }
    } else {
      tft.setTextColor(COLOR_MUTED);
      tft.setTextSize(1);
      tft.setCursor(113, r2Y + 32);
      tft.print("--");
    }
  }

  // ── Self Rating boxes ──────────────────────────────────
  tft.fillRect(213, r2Y + 20, 100, 32, COLOR_PANEL);
  if (showSelfRating) {
    for (int r = 1; r <= 5; r++) {
      int bx = 213 + (r - 1) * 20;
      bool active = (selfRating == r);
      tft.fillRoundRect(bx, r2Y + 26, 17, 20, 3,
                        active ? COLOR_ACCENT : COLOR_PANEL2);
      tft.setTextColor(active ? COLOR_BG : COLOR_MUTED);
      tft.setTextSize(1);
      tft.setCursor(bx + 5, r2Y + 32);
      tft.print(r);
    }
  }

  // ── Moderator CMD + Alarms (overview) ───────────────────────
  int r3Y = 135;
  tft.fillRect(12, r3Y + 20, 140, 30, COLOR_PANEL);
  tft.fillRect(160, r3Y + 20, 153, 30, COLOR_PANEL);
  if (showModerator) {
    tft.setTextColor(moderatorCommands > 0 ? COLOR_ACCENT : COLOR_MUTED);
    tft.setTextSize(2);
    tft.setCursor(12, r3Y + 22);
    tft.printf("CMD %d", moderatorCommands);
    tft.setTextSize(1);
    tft.setTextColor(COLOR_MUTED);
    tft.setCursor(12, r3Y + 38);
    tft.print("today");

    tft.setTextColor(moderatorAlarms > 0 ? COLOR_RED : COLOR_MUTED);
    tft.setTextSize(2);
    tft.setCursor(160, r3Y + 22);
    tft.printf("ALM %d", moderatorAlarms);
    tft.setTextSize(1);
    tft.setTextColor(moderatorAlarms > 0 ? COLOR_RED : COLOR_MUTED);
    tft.setCursor(160, r3Y + 38);
    tft.print("tap >");
  }
}

// =====================================================
// FETCH TASKS FROM BACKEND
// =====================================================
void fetchTasksFromBackend() {
  if (isDeviceLockedOut || sessionState == SESSION_LOCKED_OUT) return;
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[TASKS] WiFi not connected.");
    return;
  }

  HTTPClient http;
  http.begin(taskServerURL);
  http.setTimeout(2000);

  int httpCode = http.GET();

  if (httpCode == 200) {
    String payload = http.getString();

    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, payload);

    if (!err) {
      JsonArray tasks = doc["data"]["tasks"].as<JsonArray>();
      int newCount = 0;

      // Temporary buffer for incoming tasks
      TaskItem incoming[MAX_TASKS];

      for (JsonObject task : tasks) {
        if (newCount >= MAX_TASKS)
          break;

        const char *title = task["title"] | "Untitled";
        const char *status = task["status"] | "TODO";
        const char *priority = task["priority"] | "MEDIUM";

        strncpy(incoming[newCount].title, title, 63);
        strncpy(incoming[newCount].status, status, 15);
        strncpy(incoming[newCount].priority, priority, 7);

        incoming[newCount].title[63] = '\0';
        incoming[newCount].status[15] = '\0';
        incoming[newCount].priority[7] = '\0';

        newCount++;
      }

      // -----------------------------------------------
      // DETECT NEW TASKS — compare titles vs previous
      // -----------------------------------------------
      if (prevTaskCount >= 0 && newCount > prevTaskCount) {
        // There are more tasks than before — find which ones are new
        for (int n = 0; n < newCount; n++) {
          bool found = false;
          for (int o = 0; o < fetchedTaskCount; o++) {
            if (strcmp(incoming[n].title, fetchedTasks[o].title) == 0) {
              found = true;
              break;
            }
          }
          if (!found) {
            // This is a brand new task — add an alert
            if (alertCount < MAX_ALERTS) {
              strncpy(alerts[alertCount].title, incoming[n].title, 63);
              strncpy(alerts[alertCount].priority, incoming[n].priority, 7);
              alerts[alertCount].title[63] = '\0';
              alerts[alertCount].priority[7] = '\0';
              alerts[alertCount].read = false;
              alertCount++;
              unreadAlertCount++;
              hasUnreadAlerts = true;
              Serial.printf("[ALERT] New task assigned: %s\n",
                            incoming[n].title);
            }
          }
        }
      }

      // Copy incoming into fetchedTasks
      fetchedTaskCount = newCount;
      prevTaskCount = newCount;
      for (int i = 0; i < newCount; i++) {
        fetchedTasks[i] = incoming[i];
      }

      tasksFetched = true;
      Serial.printf("[TASKS] Fetched %d task(s) from backend.\n",
                    fetchedTaskCount);

    } else {
      Serial.println("[TASKS] JSON parse error.");
    }

  } else if (httpCode == 404) {
    fetchedTaskCount = 0;
    prevTaskCount = 0;
    tasksFetched = true;
    Serial.println("[TASKS] No employee assigned to this device.");
  } else {
    Serial.printf("[TASKS] HTTP error: %d\n", httpCode);
  }

  http.end();
  vTaskDelay(pdMS_TO_TICKS(1));
}

// =====================================================
// FETCH STATS FROM BACKEND
// =====================================================
void fetchStatsFromBackend() {
  if (isDeviceLockedOut || sessionState == SESSION_LOCKED_OUT) return;
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  HTTPClient http;
  http.begin(statsServerURL);
  http.setTimeout(2000);

  int httpCode = http.GET();

  if (httpCode == 200) {
    String payload = http.getString();

    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, payload);

    if (!err) {
      productivityScore = doc["data"]["productivity"] | 0;
      totalEmployeesCount = doc["data"]["totalEmployees"] | 0;

      JsonArray hArray = doc["data"]["hourlyHistory"].as<JsonArray>();
      int hIndex = 0;
      for (int v : hArray) {
        if (hIndex < 6) {
          hourlyHistory[hIndex++] = v;
        }
      }

      JsonArray wArray = doc["data"]["weeklyHistory"].as<JsonArray>();
      int wIndex = 0;
      for (int v : wArray) {
        if (wIndex < 6) {
          weeklyHistory[wIndex++] = v;
        }
      }

      JsonArray hLabels = doc["data"]["hourlyLabels"].as<JsonArray>();
      int hlIndex = 0;
      for (const char *l : hLabels) {
        if (hlIndex < 6) {
          strncpy(hourlyLabels[hlIndex], l, 7);
          hourlyLabels[hlIndex][7] = '\0';
          hlIndex++;
        }
      }

      JsonArray wLabels = doc["data"]["weeklyLabels"].as<JsonArray>();
      int wlIndex = 0;
      for (const char *l : wLabels) {
        if (wlIndex < 6) {
          strncpy(weeklyLabels[wlIndex], l, 7);
          weeklyLabels[wlIndex][7] = '\0';
          wlIndex++;
        }
      }

      statsFetched = true;
      Serial.printf("[STATS] Prod: %d%%, Emp: %d\n", productivityScore,
                    totalEmployeesCount);
    }
  }

  http.end();
  vTaskDelay(pdMS_TO_TICKS(1));
}

// =====================================================
// TASK PAGE (LIVE FROM BACKEND)
// =====================================================
void drawTasksPage() {
  if (isDeviceLockedOut || sessionState == SESSION_LOCKED_OUT) {
    drawLockoutScreen();
    return;
  }
  tft.fillScreen(COLOR_BG);
  drawTopBar("TASKS");

  if (!tasksFetched || fetchedTaskCount == 0) {
    // ── Loading / Empty State ──────────────────────
    tft.fillRoundRect(10, 60, 300, 50, 8, COLOR_PANEL);
    tft.setTextColor(COLOR_MUTED);
    tft.setTextSize(1);
    tft.setCursor(20, 72);
    tft.print(!tasksFetched ? "Fetching tasks..."
                            : "No active tasks assigned.");
    tft.setCursor(20, 87);
    tft.print(!tasksFetched ? "Please wait..."
                            : "Ask your manager to assign tasks.");

  } else {
    // ── Draw Each Task ─────────────────────────────
    for (int i = 0; i < fetchedTaskCount && i < 3; i++) {
      int y = 46 + i * 46;

      tft.fillRoundRect(10, y, 300, 38, 7, COLOR_PANEL);

      // Priority dot color
      uint16_t dotColor = COLOR_ACCENT;
      if (strcmp(fetchedTasks[i].priority, "HIGH") == 0)
        dotColor = COLOR_RED;
      else if (strcmp(fetchedTasks[i].priority, "MEDIUM") == 0)
        dotColor = COLOR_YELLOW;
      else if (strcmp(fetchedTasks[i].priority, "LOW") == 0)
        dotColor = COLOR_GREEN;

      tft.fillCircle(26, y + 14, 6, dotColor);

      // Status badge
      uint16_t badgeColor = (strcmp(fetchedTasks[i].status, "IN_PROGRESS") == 0)
                                ? COLOR_ACCENT
                                : COLOR_MUTED;
      tft.setTextColor(badgeColor);
      tft.setTextSize(1);
      tft.setCursor(40, y + 8);
      tft.print(fetchedTasks[i].status);

      // Task title
      tft.setTextColor(COLOR_TEXT);
      tft.setTextSize(1);
      tft.setCursor(40, y + 22);

      // Truncate title if too long
      char truncated[34];
      strncpy(truncated, fetchedTasks[i].title, 33);
      truncated[33] = '\0';
      tft.print(truncated);
    }

    // Show count if more than 3
    if (fetchedTaskCount > 3) {
      tft.setTextColor(COLOR_MUTED);
      tft.setTextSize(1);
      tft.setCursor(10, 183);
      tft.printf("+ %d more task(s) on dashboard", fetchedTaskCount - 3);
    }
  }

  drawNavigation();
}

// =====================================================
// STATS PAGE
// =====================================================

void drawStatsPage() {
  if (isDeviceLockedOut || sessionState == SESSION_LOCKED_OUT) {
    drawLockoutScreen();
    return;
  }
  tft.fillScreen(COLOR_BG);

  drawTopBar("PRODUCTIVITY");

  tft.setTextColor(COLOR_MUTED);

  tft.setTextSize(1);

  tft.setCursor(15, 48);

  tft.print("TIMEFRAME:");

  // Hourly Button (x: 90, y: 43, w: 55, h: 16)
  tft.fillRoundRect(90, 43, 55, 16, 4,
                    showHourlyStats ? COLOR_ACCENT : COLOR_PANEL2);
  tft.setTextColor(showHourlyStats ? COLOR_BG : COLOR_MUTED);
  tft.setCursor(98, 47);
  tft.print("HOURS");

  // Weekly Button (x: 155, y: 43, w: 55, h: 16)
  tft.fillRoundRect(155, 43, 55, 16, 4,
                    !showHourlyStats ? COLOR_ACCENT : COLOR_PANEL2);
  tft.setTextColor(!showHourlyStats ? COLOR_BG : COLOR_MUTED);
  tft.setCursor(163, 47);
  tft.print("WEEKS");

  // ===================================================
  // GRAPH
  // ===================================================

  tft.drawRect(10, 62, 300,
               130, // Increased height to fit labels
               COLOR_PANEL2);

  for (int i = 0; i < 6; i++) {
    int x = 25 + i * 45;

    // Convert percentage to bar height (max height 105px)
    int percentage = showHourlyStats ? hourlyHistory[i] : weeklyHistory[i];
    int barHeight = (percentage * 105) / 100;

    // Default tiny bar if 0
    if (barHeight == 0)
      barHeight = 2;

    // Decide color (green if >= 80, yellow if >= 50, else red)
    uint16_t barColor = COLOR_ACCENT;
    if (percentage >= 80)
      barColor = COLOR_GREEN;
    else if (percentage >= 50)
      barColor = COLOR_YELLOW;
    else
      barColor = COLOR_RED;

    tft.fillRect(x, 177 - barHeight, 25, barHeight, barColor);

    // Draw the percentage number on top of the bar
    tft.setTextColor(COLOR_MUTED);
    tft.setTextSize(1);
    tft.setCursor(x, 177 - barHeight - 12);
    if (statsFetched) {
      tft.print(percentage);
    } else {
      tft.print("-");
    }

    // Draw the time/day label underneath the bar
    const char *label = showHourlyStats ? hourlyLabels[i] : weeklyLabels[i];
    tft.setTextColor(COLOR_TEXT);
    tft.setTextSize(1);

    // Center the label text (roughly 6px per char) under the 25px wide bar
    int textWidth = strlen(label) * 6;
    int labelX = x + 12 - (textWidth / 2);
    tft.setCursor(labelX, 182); // Placed just below the line (177)

    if (statsFetched) {
      tft.print(label);
    } else {
      tft.print("-");
    }
  }

  drawNavigation();
}

// =====================================================
// ALERTS PAGE
// =====================================================

void drawAlertsPage() {
  if (isDeviceLockedOut || sessionState == SESSION_LOCKED_OUT) {
    drawLockoutScreen();
    return;
  }
  tft.fillScreen(COLOR_BG);
  drawTopBar("ALERTS");

  // Mark all alerts as read when user opens this page
  if (hasUnreadAlerts) {
    for (int i = 0; i < alertCount; i++) {
      alerts[i].read = true;
    }
    unreadAlertCount = 0;
    hasUnreadAlerts = false;
  }

  if (alertCount == 0) {
    // ── No alerts ─────────────────────────────────
    tft.fillRoundRect(10, 55, 300, 55, 8, COLOR_PANEL);

    // Green checkmark circle
    tft.fillCircle(35, 82, 12, COLOR_GREEN);
    tft.setTextColor(ILI9341_WHITE);
    tft.setTextSize(2);
    tft.setCursor(29, 75);
    tft.print("!");

    tft.setTextColor(COLOR_TEXT);
    tft.setTextSize(1);
    tft.setCursor(58, 68);
    tft.print("No alerts");

    tft.setTextColor(COLOR_MUTED);
    tft.setCursor(58, 83);
    tft.print("System operating normally");
    tft.setCursor(58, 96);
    tft.print("You will be notified of new tasks here.");

  } else {
    // ── Show alerts (newest first) ─────────────────
    tft.setTextColor(COLOR_MUTED);
    tft.setTextSize(1);
    tft.setCursor(10, 46);
    tft.printf("%d notification(s)", alertCount);

    int maxShow = min(alertCount, 3);
    for (int i = 0; i < maxShow; i++) {
      // Draw newest first (reverse order)
      int idx = alertCount - 1 - i;
      int y = 56 + i * 42;

      tft.fillRoundRect(5, y, 310, 36, 7, COLOR_PANEL);

      // Priority dot
      uint16_t dotColor = COLOR_ACCENT;
      if (strcmp(alerts[idx].priority, "HIGH") == 0)
        dotColor = COLOR_RED;
      else if (strcmp(alerts[idx].priority, "MEDIUM") == 0)
        dotColor = COLOR_YELLOW;
      else if (strcmp(alerts[idx].priority, "LOW") == 0)
        dotColor = COLOR_GREEN;
      tft.fillCircle(20, y + 13, 7, dotColor);

      // "NEW TASK" label
      tft.setTextColor(COLOR_ACCENT);
      tft.setTextSize(1);
      tft.setCursor(34, y + 6);
      tft.print("NEW TASK ASSIGNED");

      // Task title
      tft.setTextColor(COLOR_TEXT);
      tft.setCursor(34, y + 20);
      char truncated[38];
      strncpy(truncated, alerts[idx].title, 37);
      truncated[37] = '\0';
      tft.print(truncated);

      // Priority label
      tft.setTextColor(dotColor);
      tft.setCursor(240, y + 6);
      tft.print(alerts[idx].priority);
    }

    if (alertCount > 3) {
      tft.setTextColor(COLOR_MUTED);
      tft.setTextSize(1);
      tft.setCursor(10, 182);
      tft.printf("+ %d more notifications", alertCount - 3);
    }
  }

  drawNavigation();
}

// =====================================================
// CAMERA PAGE
// =====================================================

void drawCameraPage() {
  if (isDeviceLockedOut || sessionState == SESSION_LOCKED_OUT) {
    drawLockoutScreen();
    return;
  }
  tft.fillScreen(ILI9341_BLACK);

  // ===================================================
  // CAMERA TOP BAR
  // ===================================================

  tft.fillRect(0, 0, 320, 32, COLOR_PANEL2);

  // ===================================================
  // BACK BUTTON
  // ===================================================

  tft.fillRoundRect(5, 5, 70, 22, 5, COLOR_ACCENT);

  tft.setTextColor(COLOR_BG);

  tft.setTextSize(1);

  tft.setCursor(13, 12);

  tft.print("< BACK");

  // ===================================================
  // TITLE
  // ===================================================

  tft.setTextColor(COLOR_TEXT);

  tft.setTextSize(1);

  tft.setCursor(105, 12);

  tft.print("LIVE CAMERA");

  // ===================================================
  // WAITING MESSAGE
  // ===================================================

  tft.setTextColor(COLOR_MUTED);

  tft.setTextSize(1);

  tft.setCursor(88, 120);

  tft.print("Waiting for camera...");
}

// =====================================================
// MANUAL SESSION START (from Device Button)
// Calls exact same endpoint: POST /api/sessions/ESP32-S3-01/start
// =====================================================
void startSessionFromDevice() {
  if (isDeviceLockedOut || sessionState == SESSION_LOCKED_OUT) {
    Serial.println("[SESSION] Cannot start: Device is locked out.");
    return;
  }
  if (sessionState == SESSION_ACTIVE) {
    Serial.println("[SESSION] Session already active.");
    return;
  }

  sessionState = SESSION_ACTIVE;
  sessionStartMs = millis();
  sessionTotalMs = 0;
  sessionBreakCount = 0;
  totalBreakMs = 0;
  selfRating = 0;
  productivitySpike = false;
  sessionDyingShown = false;
  targetDurationMinutes = 120; // 2 hrs default
  extensionPromptActive = false;
  extensionPromptShowOptions = false;
  extensionPromptDismissed = false;
  sessionCompletedShown = false;
  soundAlarmActive = false;
  alarmScreenDrawn = false;
  isInvalidSession = false;
  currentBreakCounted = false;

  Serial.println("[SESSION] Manual START button pressed on device! Starting 2-hour session");
  drawHomePage(); // Immediate UI update!

  // Call the exact same API endpoint that Web calls
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(String(sessionBaseURL) + "/start");
    http.setTimeout(2500);
    http.addHeader("Content-Type", "application/json");
    int startCode = http.POST("{}");
    if (startCode == 403) {
      String payload = http.getString();
      JsonDocument doc;
      if (!deserializeJson(doc, payload) && doc["data"]["lockedOut"] == true) {
        isDeviceLockedOut = true;
        sessionState = SESSION_LOCKED_OUT;
        currentPage = PAGE_LOCKOUT;
        lockoutRemainingSec = doc["data"]["remainingSeconds"] | 172800UL;
        preferences.putUInt("lockSec", lockoutRemainingSec);
        soundAlarmActive = false;
        drawLockoutScreen();
      }
    } else if (startCode == 200) {
      Serial.println("[SESSION] Server registered session successfully from device button.");
      // Immediately fetch /current to lock timer into server's exact remainingSeconds
      HTTPClient httpCur;
      httpCur.begin(String(sessionBaseURL) + "/current");
      httpCur.setTimeout(2000);
      int curCode = httpCur.GET();
      if (curCode == 200) {
        String curPayload = httpCur.getString();
        JsonDocument curDoc;
        if (!deserializeJson(curDoc, curPayload) && !curDoc["data"].isNull()) {
          unsigned long beRemSec = curDoc["data"]["remainingSeconds"] | 0;
          int beTarget = curDoc["data"]["targetDurationMinutes"] | 120;
          targetDurationMinutes = beTarget;
          if (beRemSec > 0) {
            unsigned long targetSec = (unsigned long)targetDurationMinutes * 60UL;
            unsigned long serverActiveSec = (targetSec > beRemSec) ? (targetSec - beRemSec) : 0;
            sessionTotalMs = serverActiveSec * 1000UL;
            sessionStartMs = millis();
            Serial.printf("[SESSION] Locked countdown to server: remainingSeconds=%lu activeSec=%lu\n", beRemSec, serverActiveSec);
          }
        }
      }
      httpCur.end();
    }
    http.end();
    vTaskDelay(pdMS_TO_TICKS(1));
  }
}

// =====================================================
// TOUCH HANDLER
// =====================================================

void handleTouch() {
  if (!touch.touched()) {
    return;
  }

  uint32_t now = millis();

  if (now - lastTouchTime < TOUCH_DEBOUNCE_MS) {
    return;
  }

  TS_Point p = touch.getPoint();

  uint16_t rawX = p.x;

  uint16_t rawY = p.y;

  lastTouchTime = now;

  // ===================================================
  // 0. HARD LOCKOUT ENFORCEMENT
  // Touch is completely disabled while device is locked out!
  // ===================================================
  if (isDeviceLockedOut || sessionState == SESSION_LOCKED_OUT) {
    Serial.println("[LOCKOUT] Touch blocked: Device is in 48h hard lockout.");
    return;
  }

  Serial.print("RAW TOUCH X=");

  Serial.print(rawX);

  Serial.print(" Y=");

  Serial.println(rawY);

  int tX = map(rawX, 3800, 250, 0, 320);
  int tY = map(rawY, 3800, 550, 0, 240);

  // ===================================================
  // 1. SOUND ALARM DISMISSAL (STOP SOUND BUTTON)
  // The sound does NOT stop until user taps STOP SOUND
  // ===================================================
  if (soundAlarmActive) {
    if (tY >= 130 && tY <= 220 && tX >= 20 && tX <= 300) {
      soundAlarmActive = false;
      alarmScreenDrawn = false;
      soundAlarmMessage = "";
      Serial.println("[SOUND] STOP SOUND pressed by user! Alarm silenced.");

      bool shouldResume = false;
      bool wasCounted = false;
      if (sessionState == SESSION_INVALID) {
        sessionState = SESSION_IDLE; // Reset invalid/died session
        Serial.println("[SESSION] Invalid session reset to IDLE.");
      } else if (sessionState == SESSION_BREAK) {
        if (radar.valid && radar.targetState > 0) {
          unsigned long breakDuration = millis() - breakStartMs;
          if (currentBreakCounted) {
            totalBreakMs += breakDuration;
            dailyBreakMs += breakDuration;
            preferences.putUInt("brkMs", dailyBreakMs);
          }
          sessionState = SESSION_ACTIVE;
          sessionStartMs = millis();
          shouldResume = true;
          wasCounted = currentBreakCounted;
          currentBreakCounted = false;
          if (wasCounted) {
            Serial.printf("[SESSION] Resumed after 5m+ Break #%d via STOP SOUND.\n", sessionBreakCount);
          } else {
            Serial.printf("[SESSION] Resumed within 5 mins (%lu sec) via STOP SOUND. NOT counted as a break.\n", breakDuration / 1000);
          }
        }
      }

      drawHomePage(); // Immediate UI feedback!

      if (WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        http.begin(String(sessionBaseURL) + "/stop-sound");
        http.setTimeout(1500);
        http.POST("{}");
        http.end();
        vTaskDelay(pdMS_TO_TICKS(1));

        if (shouldResume) {
          HTTPClient http2;
          http2.begin(String(sessionBaseURL) + "/resume");
          http2.setTimeout(1500);
          http2.addHeader("Content-Type", "application/json");
          http2.POST("{\"isCountedBreak\":" + String(wasCounted ? "true" : "false") + "}");
          http2.end();
          vTaskDelay(pdMS_TO_TICKS(1));
        }
      }
      return;
    }
    return; // Don't process other screen buttons while sound alarm is active
  }

  // ===================================================
  // 2. SESSION COMPLETED RATING SCREEN TOUCH
  // ===================================================
  if (sessionCompletedShown) {
    // 5 Star buttons: Y: 80 to 145
    if (tY >= 80 && tY <= 145) {
      int tappedStar = 0;
      for (int i = 1; i <= 5; i++) {
        int sX = 15 + (i - 1) * 60;
        if (tX >= sX && tX <= sX + 50) {
          tappedStar = i;
          break;
        }
      }
      if (tappedStar > 0) {
        selfRating = tappedStar;
        Serial.printf("[SESSION] Star rating selected: %d\n", selfRating);
        drawSessionCompletedScreen(); // Immediate UI update
        if (WiFi.status() == WL_CONNECTED) {
          HTTPClient http;
          http.begin(String(sessionBaseURL) + "/rate");
          http.setTimeout(1500);
          http.addHeader("Content-Type", "application/json");
          http.POST("{\"rating\":" + String(selfRating) + "}");
          http.end();
          vTaskDelay(pdMS_TO_TICKS(1));
        }
        return;
      }
    }
    // Done / Finish button: Y: 160 to 225
    if (tY >= 160 && tY <= 225 && tX >= 30 && tX <= 290) {
      sessionCompletedShown = false;
      sessionState = SESSION_IDLE;
      Serial.println("[SESSION] Completed screen dismissed. Returning to IDLE.");
      drawHomePage();
      return;
    }
    return;
  }

  // ===================================================
  // 3. 15-MIN EXTENSION PROMPT TOUCH
  // ===================================================
  if (extensionPromptActive) {
    if (!extensionPromptShowOptions) {
      // YES button: X: 30-150, Y: 90-150
      if (tX >= 30 && tX <= 150 && tY >= 90 && tY <= 150) {
        extensionPromptShowOptions = true;
        drawExtensionOptions();
        return;
      }
      // NO button: X: 170-290, Y: 90-150
      if (tX >= 170 && tX <= 290 && tY >= 90 && tY <= 150) {
        extensionPromptDismissed = true;
        extensionPromptActive = false;
        Serial.println("[EXTENSION] User chose NO extension. Continuing 2h countdown.");
        drawHomePage();
        return;
      }
    } else {
      int chosenMins = 0;
      // +15m: X: 30-150, Y: 50-100
      if (tX >= 30 && tX <= 150 && tY >= 50 && tY <= 100) chosenMins = 15;
      // +30m: X: 170-290, Y: 50-100
      else if (tX >= 170 && tX <= 290 && tY >= 50 && tY <= 100) chosenMins = 30;
      // +45m: X: 30-150, Y: 100-150
      else if (tX >= 30 && tX <= 150 && tY >= 100 && tY <= 150) chosenMins = 45;
      // +1h:  X: 170-290, Y: 100-150
      else if (tX >= 170 && tX <= 290 && tY >= 100 && tY <= 150) chosenMins = 60;
      // CANCEL: X: 80-240, Y: 155-200
      else if (tX >= 80 && tX <= 240 && tY >= 155 && tY <= 200) {
        extensionPromptActive = false;
        extensionPromptShowOptions = false;
        drawHomePage();
        return;
      }

      if (chosenMins > 0) {
        targetDurationMinutes += chosenMins;
        extensionPromptActive = false;
        extensionPromptShowOptions = false;
        extensionPromptDismissed = false; // reset so we can prompt again at the next 15-min mark
        Serial.printf("[EXTENSION] Added +%d mins! New target: %d mins\n", chosenMins, targetDurationMinutes);
        drawHomePage(); // Immediate UI update
        if (WiFi.status() == WL_CONNECTED) {
          HTTPClient http;
          http.begin(String(sessionBaseURL) + "/extend");
          http.setTimeout(1500);
          http.addHeader("Content-Type", "application/json");
          http.POST("{\"extensionMinutes\":" + String(chosenMins) + "}");
          http.end();
          vTaskDelay(pdMS_TO_TICKS(1));
        }
        return;
      }
    }
    return;
  }

  // ===================================================
  // ALARM DISMISSAL (10 Min Grace)
  // ===================================================
  if (sessionState == SESSION_DYING) {
    // If the user touches the screen, we consider them back at the desk
    totalBreakMs += (millis() - breakStartMs);
    dailyBreakMs += (millis() - breakStartMs);
    preferences.putUInt("brkMs", dailyBreakMs);
    sessionStartMs = millis();
    sessionState = SESSION_ACTIVE;
    dyingAlarmActive = false;
    soundAlarmActive = false;
    alarmScreenDrawn = false;
    currentBreakCounted = false;
    Serial.println("[SESSION] Saved by TOUCH! Resumed after alarm.");
    drawHomePage(); // Immediate UI update

    // Tell backend
    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      http.begin(String(sessionBaseURL) + "/resume");
      http.setTimeout(1500);
      http.addHeader("Content-Type", "application/json");
      http.POST("{}");
      http.end();
      vTaskDelay(pdMS_TO_TICKS(1));
    }
    return;
  }

  // ===================================================
  // STATS PAGE TOGGLES
  // ===================================================
  if (currentPage == PAGE_STATS) {
    if (tY >= 30 && tY <= 70) {
      if (tX >= 80 && tX <= 145) {
        if (!showHourlyStats) {
          showHourlyStats = true;
          drawStatsPage();
        }
        return;
      } else if (tX >= 150 && tX <= 220) {
        if (showHourlyStats) {
          showHourlyStats = false;
          drawStatsPage();
        }
        return;
      }
    }
  }

  // ===================================================
  // HOME PAGE: ROW 1 TOUCH (Start Session Button)
  // ===================================================
  if (currentPage == PAGE_HOME && tY >= 5 && tY <= 65 && tX >= 5 && tX <= 195) {
    if (sessionState == SESSION_IDLE) {
      startSessionFromDevice();
      return;
    }
  }

  // ===================================================
  // HOME PAGE: BREAK BOX TOUCH (Toggle Session vs Daily)
  // ===================================================
  if (currentPage == PAGE_HOME && tY >= 5 && tY <= 65 && tX >= 195) {
    if (breakDisplayMode == "DAILY") {
      breakDisplayMode = "SESSION";
    } else {
      breakDisplayMode = "DAILY";
    }
    preferences.putString("brkMode", breakDisplayMode);
    Serial.printf("[DISPLAY] Toggled break mode to: %s\n", breakDisplayMode.c_str());
    drawHomePage();
    return;
  }

  // ===================================================
  // HOME PAGE: ALARMS TOUCH (Row 3, X: 160+)
  // ===================================================
  if (currentPage == PAGE_HOME && tY >= 145 && tY <= 210 && tX >= 150) {
    currentPage = PAGE_ALERTS;
    drawAlertsPage();
    return;
  }

  // ===================================================
  // HOME PAGE: SELF-RATING TOUCH (Row 2)
  // ===================================================
  if (currentPage == PAGE_HOME && tY >= 60 && tY <= 144) {
    int newRating = 0;
    // Expanded touch boxes for self rating (visually drawn at X: ~213, 233,
    // 253, 273, 293)
    if (tX >= 180 && tX <= 230)
      newRating = 1;
    else if (tX >= 231 && tX <= 250)
      newRating = 2;
    else if (tX >= 251 && tX <= 270)
      newRating = 3;
    else if (tX >= 271 && tX <= 290)
      newRating = 4;
    else if (tX >= 291 && tX <= 320)
      newRating = 5;

    if (newRating > 0) {
      selfRating = newRating;
      Serial.printf("[SESSION] Self rating set to %d\n", selfRating);

      // Trigger productivity spike based on rating
      productivitySpike = true;

      // Send to backend
      if (WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        http.begin(String(sessionBaseURL) + "/rate");
        http.addHeader("Content-Type", "application/json");
        http.POST("{\"rating\":" + String(selfRating) + "}");
        http.end();
      }

      drawHomePage(); // Redraw to show selected star
      return;
    }
  }

  // ===================================================
  // CAMERA BACK
  // ===================================================

  if (currentPage == PAGE_CAMERA && rawX >= 3400 && rawX <= 3800 &&
      rawY >= 3200 && rawY <= 3800) {
    Serial.println("CAMERA BACK");

    currentPage = PAGE_HOME;

    cameraFrameReady = false;

    drawHomePage();

    return;
  }

  // ===================================================
  // HOME
  // ===================================================

  if (rawY >= 550 && rawY <= 1150 && rawX >= 3250 && rawX <= 3800) {
    currentPage = PAGE_HOME;

    cameraFrameReady = false;

    drawHomePage();

    return;
  }

  // ===================================================
  // TASKS
  // ===================================================

  if (rawY >= 550 && rawY <= 1150 && rawX >= 2650 && rawX <= 3249) {
    currentPage = PAGE_TASKS;

    cameraFrameReady = false;

    drawTasksPage();

    return;
  }

  // ===================================================
  // STATS
  // ===================================================

  if (rawY >= 550 && rawY <= 1150 && rawX >= 2100 && rawX <= 2649) {
    currentPage = PAGE_STATS;

    cameraFrameReady = false;

    drawStatsPage();

    return;
  }

  // ===================================================
  // CAMERA
  // ===================================================

  if (rawY >= 550 && rawY <= 1150 && rawX >= 1600 && rawX <= 2099) {
    Serial.println("CAMERA PAGE");

    currentPage = PAGE_CAMERA;

    cameraFrameReady = false;

    drawCameraPage();

    return;
  }

  // ===================================================
  // ALERTS
  // ===================================================

  if (rawY >= 550 && rawY <= 1150 && rawX >= 1000 && rawX <= 1599) {
    currentPage = PAGE_ALERTS;

    cameraFrameReady = false;

    drawAlertsPage();

    return;
  }

  // ===================================================
  // MM-WAVE RADAR
  // ===================================================

  if (rawY >= 550 && rawY <= 1150 && rawX >= 300 && rawX <= 999) {
    Serial.println("SETTINGS PAGE");
    currentPage = PAGE_SETTINGS;
    cameraFrameReady = false;
    drawSettingsPage();
    return;
  }
}

// =====================================================
// CAMERA FREE RTOS TASK
// =====================================================

void cameraTask(void *parameter) {
  Serial.println("Camera task started.");

  while (true) {
    // =================================================
    // CAMERA PAGE NOT ACTIVE
    // =================================================

    if (currentPage != PAGE_CAMERA) {
      vTaskDelay(pdMS_TO_TICKS(20));

      continue;
    }

    // =================================================
    // PREVIOUS FRAME NOT YET CONSUMED
    // =================================================

    if (cameraFrameReady) {
      vTaskDelay(pdMS_TO_TICKS(5));

      continue;
    }

    // =================================================
    // RECEIVE FRAME
    // =================================================

    bool success = receiveFrame();

    // =================================================
    // CHECK PAGE AGAIN
    // =================================================

    if (success && currentPage == PAGE_CAMERA) {
      cameraFrameReady = true;
    } else {
      cameraFrameReady = false;
    }
  }
}

// =====================================================
// SEND RADAR DATA TO NODE.JS BACKEND
// =====================================================
void sendRadarDataToBackend() {
  if (WiFi.status() == WL_CONNECTED) {
    static HTTPClient http;
    http.setReuse(true); // Keep SSL connection alive to stop UI lag!
    http.begin(serverName);
    http.addHeader("Content-Type", "application/json");

    // Set a moderate timeout
    http.setTimeout(3000);

    String jsonPayload = "{";
    jsonPayload += "\"state\":\"" + String(getRadarStateText()) + "\",";
    jsonPayload += "\"targetState\":" + String(radar.targetState) + ",";
    jsonPayload += "\"movingDistance\":" + String(radar.movingDistance) + ",";
    jsonPayload += "\"stationaryDistance\":" + String(radar.stationaryDistance);
    jsonPayload += "}";

    int httpResponseCode = http.POST(jsonPayload);

    if (httpResponseCode > 0) {
      Serial.print("[HTTP] Radar payload sent. Response code: ");
      Serial.println(httpResponseCode);
    } else {
      Serial.print("[HTTP] Error sending payload: ");
      Serial.println(http.errorToString(httpResponseCode).c_str());
    }

    http.end();
  } else {
    Serial.println("[WIFI] Disconnected, unable to send telemetry.");
  }
}

// =====================================================
// SETUP
// =====================================================
// VOICE AGENT POLLING
// =====================================================
void pollVoiceAgent() {
  if (isDeviceLockedOut || sessionState == SESSION_LOCKED_OUT) return;
  if (WiFi.status() == WL_CONNECTED &&
      (millis() - lastVoicePollMs >= VOICE_POLL_INTERVAL)) {
    lastVoicePollMs = millis();
    HTTPClient http;
    // URL matching your backend setup
    http.begin("https://backend-kwid.onrender.com/api/voice/ESP32-S3-01/next");
    http.setTimeout(1500);
    int httpCode = http.GET();

    if (httpCode == 200) {
      String payload = http.getString();
      DynamicJsonDocument doc(1024);
      DeserializationError error = deserializeJson(doc, payload);

      if (!error && doc["hasMessage"] == true) {
        String url = doc["audioUrl"].as<String>();
        Serial.println("[VOICE] Playing new message...");
        audio.connecttohost(url.c_str());
      }
    }
    http.end();
    vTaskDelay(pdMS_TO_TICKS(1));
  }
}

// =====================================================
// DAILY DATE & BREAK TOTALS TRACKING
// =====================================================
void checkDailyReset() {
  struct tm timeinfo;
  if (getLocalTime(&timeinfo, 100)) {
    int currentDayOfYear = timeinfo.tm_yday; // 0 - 365
    int savedDay = preferences.getInt("savedDay", -1);
    if (savedDay != currentDayOfYear) {
      Serial.printf("[DAILY RESET] New date detected (Day %d vs Saved %d). "
                    "Resetting today's break totals to 0.\n",
                    currentDayOfYear, savedDay);
      dailyBreakMs = 0;
      dailyBreakCount = 0;
      preferences.putUInt("brkMs", 0);
      preferences.putInt("brkCnt", 0);
      preferences.putInt("savedDay", currentDayOfYear);
    }
  }
}

// =====================================================
// FETCH DISPLAY CONFIGURATION FROM BACKEND
// =====================================================
void fetchDisplayConfig() {
  if (isDeviceLockedOut || sessionState == SESSION_LOCKED_OUT) return;
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(displayConfigURL);
  http.setTimeout(2000);
  int code = http.GET();
  if (code == 200) {
    String payload = http.getString();
    JsonDocument doc;
    if (!deserializeJson(doc, payload)) {
      JsonObject cfg = doc["data"];
      if (!cfg.isNull()) {
        String newMode = cfg["breakDisplayMode"].as<String>();
        if (newMode.length() == 0) newMode = breakDisplayMode;

        bool sTimer  = cfg["showSessionTimer"] | true;
        bool sBreaks = cfg["showBreaks"]       | true;
        bool sScore  = cfg["showProdScore"]    | true;
        bool sSpike  = cfg["showProdSpike"]    | true;
        bool sRating = cfg["showSelfRating"]   | true;
        bool sMod    = cfg["showModerator"]    | true;

        bool changed = (newMode != breakDisplayMode || sTimer != showSessionTimer ||
                        sBreaks != showBreaks || sScore != showProdScore ||
                        sSpike != showProdSpike || sRating != showSelfRating ||
                        sMod != showModerator);

        breakDisplayMode = newMode;
        showSessionTimer = sTimer;
        showBreaks       = sBreaks;
        showProdScore    = sScore;
        showProdSpike    = sSpike;
        showSelfRating   = sRating;
        showModerator    = sMod;

        preferences.putString("brkMode", breakDisplayMode);
        preferences.putBool("shTimer",  showSessionTimer);
        preferences.putBool("shBrk",    showBreaks);
        preferences.putBool("shScore",  showProdScore);
        preferences.putBool("shSpike",  showProdSpike);
        preferences.putBool("shRating", showSelfRating);
        preferences.putBool("shMod",    showModerator);

        Serial.printf("[DISPLAY CONFIG] Synced from backend. Mode: %s, Breaks: %d, Timer: %d\n",
                      breakDisplayMode.c_str(), showBreaks, showSessionTimer);

        if (changed && currentPage == PAGE_HOME && !soundAlarmActive) {
          drawHomePage();
        }
      }
    }
  }
  http.end();
  vTaskDelay(pdMS_TO_TICKS(1));
}

// =====================================================

void setup() {
  preferences.begin("sdw", false);
  sessionTotalMs   = preferences.getUInt("sessMs", 0);
  if (sessionTotalMs > 86400000UL) {
    sessionTotalMs = 0; // Fix any previous corrupt underflow
    preferences.putUInt("sessMs", 0);
  }
  dailyBreakMs     = preferences.getUInt("brkMs", 0);
  dailyBreakCount  = preferences.getInt("brkCnt", 0);
  breakDisplayMode = preferences.getString("brkMode", "SESSION");
  showSessionTimer = preferences.getBool("shTimer",  true);
  showBreaks       = preferences.getBool("shBrk",    true);
  showProdScore    = preferences.getBool("shScore",  true);
  showProdSpike    = preferences.getBool("shSpike",  true);
  showSelfRating   = preferences.getBool("shRating", true);
  showModerator    = preferences.getBool("shMod",    true);

  // 48-Hour Hard Lockout Check
  lockoutRemainingSec = preferences.getUInt("lockSec", 0);
  if (lockoutRemainingSec > 0) {
    isDeviceLockedOut = true;
    sessionState = SESSION_LOCKED_OUT;
    Serial.printf("[LOCKOUT] Booted in HARD LOCKOUT state! Remaining: %u sec\n", lockoutRemainingSec);
  }

  Serial.begin(115200);

  // Init Audio
  audio.setPinout(I2S_BCLK, I2S_LRC, I2S_DOUT);
  audio.setVolume(15); // 0-21

  // ===================================================
  // TFT SPI & TOUCH — INITIALIZE IMMEDIATELY
  // Prevents any uninitialized white screen flash on boot
  // ===================================================
  SPI.begin(TFT_SCK, TFT_MISO, TFT_MOSI);
  tft.begin(40000000);
  tft.setRotation(1);
  tft.fillScreen(COLOR_BG);

  tft.setTextColor(COLOR_ACCENT);
  tft.setTextSize(2);
  tft.setCursor(35, 80);
  tft.print("SMART DESK S3");
  tft.setTextColor(COLOR_MUTED);
  tft.setTextSize(1);
  tft.setCursor(35, 115);
  tft.print("Starting up & connecting to WiFi...");

  if (touch.begin()) {
    Serial.println("Touch initialized!");
  } else {
    Serial.println("Touch initialization failed!");
  }
  touch.setRotation(1);

  delay(200);

  Serial.println();

  Serial.println("================================");

  Serial.println("ESP32-S3 SMART UI");

  Serial.println("================================");

  // 1. CONNECT TO WIFI
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);

  // Print exact hardware events & disconnect reasons
  WiFi.onEvent([](WiFiEvent_t event, WiFiEventInfo_t info) {
    if (event == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
      Serial.printf("\n[WIFI EVENT] Disconnected! Reason code: %d ", info.wifi_sta_disconnected.reason);
      uint8_t r = info.wifi_sta_disconnected.reason;
      if (r == 2 || r == 202) Serial.println("(AUTH_FAIL: Wrong password!)");
      else if (r == 15) Serial.println("(4WAY_HANDSHAKE_TIMEOUT: Wrong password or WPA incompatibility)");
      else if (r == 201) Serial.println("(NO_AP_FOUND)");
      else if (r == 204) Serial.println("(HANDSHAKE_TIMEOUT)");
      else Serial.println();
    } else if (event == ARDUINO_EVENT_WIFI_STA_CONNECTED) {
      Serial.println("\n[WIFI EVENT] Associated with AP!");
    } else if (event == ARDUINO_EVENT_WIFI_STA_GOT_IP) {
      Serial.println("[WIFI EVENT] IP Obtained successfully!");
    }
  });

  Serial.printf("[WIFI] Connecting to '%s'...\n", ssid);
  WiFi.begin(ssid, password);

  int retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < 25) {
    delay(500);
    Serial.print(".");
    retries++;
  }

  // If still not connected and there are multiple APs, scan and connect directly to strongest AP
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\n[WIFI] Scanning to connect directly to strongest 'smmart' AP...");
    int n = WiFi.scanNetworks();
    int bestIdx = -1;
    int bestRSSI = -999;
    for (int i = 0; i < n; ++i) {
      if (WiFi.SSID(i) == ssid && WiFi.RSSI(i) > bestRSSI) {
        bestRSSI = WiFi.RSSI(i);
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      Serial.printf("[WIFI] Found '%s' on channel %d (BSSID: %s, RSSI: %d dBm). Connecting directly...\n",
                    ssid, WiFi.channel(bestIdx), WiFi.BSSIDstr(bestIdx).c_str(), WiFi.RSSI(bestIdx));
      WiFi.begin(ssid, password, WiFi.channel(bestIdx), WiFi.BSSID(bestIdx));
      int directRetries = 0;
      while (WiFi.status() != WL_CONNECTED && directRetries < 20) {
        delay(500);
        Serial.print(".");
        directRetries++;
      }
    }
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WIFI] Connected!");
    Serial.print("[WIFI] IP Address: ");
    Serial.println(WiFi.localIP());

    // Configure NTP time (IST: UTC+5:30 -> 19800 sec offset)
    configTime(19800, 0, "pool.ntp.org", "time.google.com");
    delay(200);
    checkDailyReset();
    fetchDisplayConfig();
  } else {
    Serial.println("\n[WIFI] FAILED to connect!");
    Serial.printf(
        "[WIFI] Status code: %d (0=IDLE, 1=SSID NOT FOUND, 4=WRONG PASSWORD)\n",
        WiFi.status());

    // Quick scan to see what networks the ESP32 can actually detect
    Serial.println("[WIFI] Scanning available 2.4GHz networks nearby...");
    int n = WiFi.scanNetworks();
    if (n == 0) {
      Serial.println(
          "[WIFI] No networks found. (Check 2.4GHz radio or antenna)");
    } else {
      Serial.printf("[WIFI] Found %d networks:\n", n);
      for (int i = 0; i < n && i < 8; ++i) {
        Serial.printf("  %d: '%s' (RSSI: %d dBm)\n", i + 1,
                      WiFi.SSID(i).c_str(), WiFi.RSSI(i));
      }
    }
    Serial.println("[WIFI] Continuing boot in offline mode...");
  }

  // ===================================================
  // JPEG DECODER
  // ===================================================

  TJpgDec.setCallback(jpegCallback);

  // ===================================================
  // SCALE 2
  // ===================================================

  TJpgDec.setJpgScale(2);

  TJpgDec.setSwapBytes(false);

  // ===================================================
  // READY PIN
  // ===================================================

  pinMode(CAM_READY_PIN, OUTPUT);

  digitalWrite(CAM_READY_PIN, LOW);

  // ===================================================
  // CAMERA SPI
  // ===================================================

  initCameraSPI();

  // ===================================================
  // RADAR
  // ===================================================

  initRadar();

  // ===================================================
  // MEMORY INFORMATION
  // ===================================================

  if (psramFound()) {
    Serial.println("PSRAM detected!");
  } else {
    Serial.println("PSRAM NOT detected!");
  }

  Serial.print("Free heap: ");

  Serial.println(ESP.getFreeHeap());

  // ===================================================
  // START HOME PAGE
  // ===================================================

  currentPage = PAGE_HOME;

  if (isDeviceLockedOut || sessionState == SESSION_LOCKED_OUT) {
    drawLockoutScreen();
  } else {
    drawHomePage();
  }

  // ===================================================
  // START CAMERA TASK
  // ===================================================

  BaseType_t result = xTaskCreate(cameraTask, "CameraTask", 8192, nullptr, 1,
                                  &cameraTaskHandle);

  if (result != pdPASS) {
    Serial.println("ERROR: Camera task creation FAILED!");
  } else {
    Serial.println("Camera task created successfully.");
  }

  // ===================================================
  // READY
  // ===================================================

  Serial.println();

  Serial.println("================================");

  Serial.println("S3 READY");

  Serial.println("LD2410C READY");

  Serial.println("================================");
}

// =====================================================
// MAIN LOOP
// =====================================================

void loop() {
  // Feed the audio buffer
  audio.loop();

  // Poll for voice messages from backend
  pollVoiceAgent();
  // ===================================================
  // READ RADAR FIRST
  // ===================================================

  readRadar();

  // ===================================================
  // HANDLE TOUCH
  // ===================================================

  handleTouch();

  // ===================================================
  // UPDATE RADAR SCREEN
  // ===================================================

  static uint32_t lastMMRefresh = 0;

  if (currentPage == PAGE_SETTINGS && millis() - lastMMRefresh >= 5000) {
    lastMMRefresh = millis();
    drawSettingsPage();
  }

  // ===================================================
  // PROCESS CAMERA FRAME
  // ===================================================

  if (cameraFrameReady) {
    // -------------------------------------------------
    // ONLY DISPLAY IF STILL ON CAMERA PAGE
    // -------------------------------------------------

    if (currentPage == PAGE_CAMERA) {
      uint32_t frameStart = millis();

      // =================================================
      // DECODE JPEG
      // =================================================

      JRESULT result = TJpgDec.drawJpg(0, 32, jpegBuffer, jpegLength);

      if (result != JDR_OK) {
        Serial.print("JPEG decode error: ");

        Serial.println(result);
      } else {
        uint32_t frameTime = millis() - frameStart;

        Serial.print("Frame displayed | JPEG: ");

        Serial.print(jpegLength);

        Serial.print(" bytes | Processing: ");

        Serial.print(frameTime);

        Serial.println(" ms");

        // =================================================
        // REDRAW CAMERA HEADER
        // =================================================

        tft.fillRect(0, 0, 320, 32, COLOR_PANEL2);

        // Back button

        tft.fillRoundRect(5, 5, 70, 22, 5, COLOR_ACCENT);

        tft.setTextColor(COLOR_BG);

        tft.setTextSize(1);

        tft.setCursor(13, 12);

        tft.print("< BACK");

        // Title

        tft.setTextColor(COLOR_TEXT);

        tft.setCursor(105, 12);

        tft.print("LIVE CAMERA");
      }
    }

    // =================================================
    // RELEASE FRAME BUFFER
    // =================================================

    cameraFrameReady = false;
  }

  // ===================================================
  // SEND TELEMETRY TO NODE.JS BACKEND
  // ===================================================
  static uint32_t lastBackendUpdate = 0;

  if (millis() - lastBackendUpdate >= 10000) {
    lastBackendUpdate = millis();

    // Only send data if the radar has returned valid information recently
    if (radar.valid) {
      sendRadarDataToBackend();
    }
  }

  // ===================================================
  // POLL TASKS FROM BACKEND (every 15 seconds)
  // ===================================================
  static uint32_t lastTaskFetch = 0;

  if (millis() - lastTaskFetch >= 15000) {
    lastTaskFetch = millis();
    bool hadUnread = hasUnreadAlerts;

    fetchTasksFromBackend();

    // If a new task just triggered an alert, refresh the UI instantly to show
    // the red dot!
    if (hasUnreadAlerts && !hadUnread) {
      if (currentPage == PAGE_HOME && !soundAlarmActive)
        drawHomePage();
      else if (currentPage == PAGE_TASKS)
        drawTasksPage();
      else if (currentPage == PAGE_STATS)
        drawStatsPage();
      else
        drawNavigation(); // for other pages, just redraw the bottom bar
    }
    // Otherwise, if we are on the tasks page, just refresh it normally
    else if (currentPage == PAGE_TASKS) {
      drawTasksPage();
    }
  }

  // ===================================================
  // POLL STATS FROM BACKEND (every 30 seconds)
  // ===================================================
  static uint32_t lastStatsFetch = 0;

  // Offset the stats fetch slightly so they don't fire at the exact same
  // millisecond
  if (millis() - lastStatsFetch >= 30000 && millis() > 5000) {
    lastStatsFetch = millis();
    fetchStatsFromBackend();

    // Redraw home page to show updated stats if active
    if (currentPage == PAGE_HOME && !soundAlarmActive) {
      drawHomePage();
    }
  }

// ===================================================
// SESSION STATE MACHINE — with 30s absence debounce
// ===================================================
#define ABSENCE_DEBOUNCE_MS 30000UL // 30 seconds of absence before away alert & sound
#define PRESENCE_DEBOUNCE_MS 3000UL // 3 seconds of sustained presence before resume

  static unsigned long absenceStartMs = 0;  // when person left
  static unsigned long presenceStartMs = 0; // when person returned

  bool rawPresent = (radar.valid && radar.targetState > 0);

  // Update debounce timers
  if (rawPresent) {
    absenceStartMs = 0; // reset absence timer
    if (presenceStartMs == 0)
      presenceStartMs = millis();
  } else {
    presenceStartMs = 0; // reset presence timer
    if (absenceStartMs == 0)
      absenceStartMs = millis();
  }

  // Debounced booleans
  bool personPresent =
      rawPresent && (millis() - presenceStartMs >= PRESENCE_DEBOUNCE_MS);
  bool personAbsent = !rawPresent && (absenceStartMs > 0) &&
                      (millis() - absenceStartMs >= ABSENCE_DEBOUNCE_MS);

  switch (sessionState) {

  case SESSION_IDLE:
    // User requested: Do NOT auto-start session on radar presence alone!
    // Device now waits for user to tap [START TIMER] on the screen OR click [START SESSION] on the Web.
    // Both device and web invoke the exact same API: POST /api/sessions/ESP32-S3-01/start
    break;

  case SESSION_ACTIVE:
    if (personAbsent) {
      // Person has been absent for 30 seconds — sound away alert, but do NOT count as a break yet!
      if (absenceStartMs >= sessionStartMs) {
        sessionTotalMs += (absenceStartMs - sessionStartMs); // accumulate focus time up to departure
      }
      if (sessionTotalMs > 86400000UL) sessionTotalMs = 0; // Sanity cap at 24h
      preferences.putUInt("sessMs", sessionTotalMs);
      breakStartMs = millis();
      currentBreakCounted = false; // NOT a break yet; only crosses 5 minutes counts as a break!
      absenceStartMs = 0;
      presenceStartMs = 0;

      // Start Away Alert & sound (30s)
      sessionState = SESSION_BREAK;
      soundAlarmActive = true;
      alarmTriggeredAtMs = millis();
      soundAlarmMessage = "AWAY ALERT: RETURN TO DESK!";
      isInvalidSession = false;
      moderatorAlarms++;
      Serial.println("[AWAY ALERT] Away for 30s. Alarm sounding. (Not a break yet; only >5m counts as a break).");

      drawAlarmScreen(); // Render screen IMMEDIATELY so display is responsive with zero lag!

      if (WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        http.begin(String(sessionBaseURL) + "/break");
        http.setTimeout(1500);
        http.addHeader("Content-Type", "application/json");
        unsigned long activeMins = sessionTotalMs / 60000;
        String body = "{\"activeMinutes\":" + String(activeMins) + "}";
        http.POST(body);
        http.end();
        vTaskDelay(pdMS_TO_TICKS(1));
      }
    }
    break;

  case SESSION_BREAK: {
    unsigned long breakDuration = millis() - breakStartMs;

    // RULE: Only count as a break once absence crosses 5 minutes (300,000 ms)
    if (!currentBreakCounted && breakDuration >= BREAK_COUNT_THRESHOLD_MS) {
      currentBreakCounted = true;
      sessionBreakCount++;
      dailyBreakCount++;
      preferences.putInt("brkCnt", dailyBreakCount);
      Serial.printf("[BREAK COUNTED] Absence crossed 5 minutes! Counted as Break #%d of 3.\n", sessionBreakCount);

      // Spike: 45+ min active with first 5m+ break
      if (sessionTotalMs >= 45UL * 60UL * 1000UL && sessionBreakCount == 1) {
        productivitySpike = true;
      }

      // Notify backend that this break crossed 5m and is an officially counted break
      if (WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        http.begin(String(sessionBaseURL) + "/break-counted");
        http.setTimeout(1500);
        http.addHeader("Content-Type", "application/json");
        http.POST("{\"breakCount\":" + String(sessionBreakCount) + "}");
        http.end();
        vTaskDelay(pdMS_TO_TICKS(1));
      }

      // RULE: More than 3 breaks (5m+ each) => SESSION BECOMES INVALID AND DIES
      if (sessionBreakCount > 3) {
        sessionState = SESSION_INVALID;
        soundAlarmActive = true;
        alarmTriggeredAtMs = millis();
        soundAlarmMessage = "SESSION INVALID: EXCEEDED 3 BREAKS (5M+)!";
        isInvalidSession = true;
        moderatorAlarms++;
        Serial.println("[ALARM BEEP] SESSION INVALID & DIED: Exceeded 3 breaks limit (5m+ each)!");

        drawAlarmScreen();

        if (WiFi.status() == WL_CONNECTED) {
          HTTPClient http;
          http.begin(String(sessionBaseURL) + "/alarm-trigger");
          http.setTimeout(1500);
          http.addHeader("Content-Type", "application/json");
          http.POST("{\"message\":\"SESSION INVALID: Exceeded 3 breaks limit (5m+)\",\"isInvalid\":true}");
          http.end();
          vTaskDelay(pdMS_TO_TICKS(1));
        }
      } else if (soundAlarmActive) {
        drawAlarmScreen(); // Update screen to reflect Break X of 3
      }
    }

    // Note: sound does NOT stop until user taps STOP SOUND (or stops it on Web).
    // Once sound is silenced, person present resumes the active study session:
    if (!soundAlarmActive && personPresent) {
      bool wasCounted = currentBreakCounted;
      if (wasCounted) {
        totalBreakMs += breakDuration;
        dailyBreakMs += breakDuration;
        preferences.putUInt("brkMs", dailyBreakMs);
      }
      sessionStartMs = millis(); // restart active timer
      sessionState = SESSION_ACTIVE;
      absenceStartMs = 0;
      presenceStartMs = 0;
      alarmScreenDrawn = false;
      currentBreakCounted = false;

      if (wasCounted) {
        Serial.printf("[SESSION] Resumed after 5m+ Break #%d (Duration: %lu mins).\n", sessionBreakCount, breakDuration / 60000);
      } else {
        Serial.printf("[SESSION] Resumed within 5 mins (%lu sec). NOT counted as a break. Total breaks: %d\n", breakDuration / 1000, sessionBreakCount);
      }

      drawHomePage(); // Immediate UI update!

      if (WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        http.begin(String(sessionBaseURL) + "/resume");
        http.setTimeout(1500);
        http.addHeader("Content-Type", "application/json");
        http.POST("{\"isCountedBreak\":" + String(wasCounted ? "true" : "false") + "}");
        http.end();
        vTaskDelay(pdMS_TO_TICKS(1));
      }

    } else if (breakDuration >= BREAK_DYING_THRESHOLD_MS) {
      // Break exceeded 10 minutes — trigger 10-min break alarm
      sessionState = SESSION_DYING;
      dyingAlarmMs = millis();
      dyingAlarmActive = true;
      soundAlarmActive = true;
      alarmTriggeredAtMs = millis();
      soundAlarmMessage = "10 MIN BREAK EXCEEDED!";
      isInvalidSession = false;
      Serial.println("[SESSION] DYING! 10-Min break exceeded.");
      drawAlarmScreen();
    }
    break;
  }

  case SESSION_DYING: {
    if (personPresent) {
      // Saved! Person came back within grace period
      totalBreakMs += (millis() - breakStartMs);
      dailyBreakMs += (millis() - breakStartMs);
      preferences.putUInt("brkMs", dailyBreakMs);
      sessionStartMs = millis();
      sessionState = SESSION_ACTIVE;
      dyingAlarmActive = false;
      soundAlarmActive = false;
      alarmScreenDrawn = false;
      currentBreakCounted = false;

      Serial.println("[SESSION] Saved! Resumed after dying.");
      drawHomePage(); // Immediate UI update!

      if (WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        http.begin(String(sessionBaseURL) + "/resume");
        http.setTimeout(1500);
        http.addHeader("Content-Type", "application/json");
        http.POST("{\"isCountedBreak\":true}");
        http.end();
        vTaskDelay(pdMS_TO_TICKS(1));
      }
    } else if (millis() - dyingAlarmMs >= DYING_GRACE_MS) {
      // Grace period expired — end session, reset
      unsigned long activeMins = sessionTotalMs / 60000;
      sessionState = SESSION_IDLE;
      soundAlarmActive = false;
      alarmScreenDrawn = false;
      dyingAlarmActive = false;
      currentBreakCounted = false;
      drawHomePage(); // Immediate UI update!

      if (WiFi.status() == WL_CONNECTED && activeMins > 0) {
        HTTPClient http;
        http.begin(String(sessionBaseURL) + "/end");
        http.setTimeout(1500);
        http.addHeader("Content-Type", "application/json");
        String body = "{\"activeMinutes\":" + String(activeMins) +
                      ",\"selfRating\":" + String(selfRating) + "}";
        http.POST(body);
        http.end();
        vTaskDelay(pdMS_TO_TICKS(1));
      }
      Serial.printf("[SESSION] Ended after dying. Active: %lum\n", activeMins);

      // Reset everything
      preferences.putUInt("sessMs", sessionTotalMs);
      preferences.putUInt("brkMs", dailyBreakMs);
      sessionTotalMs = 0;
      sessionBreakCount = 0;
      totalBreakMs = 0;
      sessionStartMs = 0;
      breakStartMs = 0;
      currentBreakCounted = false;
    }
    break;
  }

  case SESSION_INVALID: {
    // Session is invalid and dead due to exceeding 3 breaks.
    // Screen remains showing alarm with STOP SOUND button until pressed.
    break;
  }

  case SESSION_LOCKED_OUT: {
    // Exceeded 10 invalid sessions. Desk is locked out for 48 hours.
    // Reverse countdown ticks and screen is locked.
    break;
  }

  default:
    break;
  }

  // ===================================================
  // 48-HOUR HARD LOCKOUT LIVE COUNTDOWN TICK (every 1s)
  // ===================================================
  static uint32_t lastLockoutTick = 0;
  if (isDeviceLockedOut || sessionState == SESSION_LOCKED_OUT) {
    if (millis() - lastLockoutTick >= 1000) {
      lastLockoutTick = millis();
      if (lockoutRemainingSec > 0) {
        lockoutRemainingSec--;
        updateLockoutCountdown();

        static uint8_t nvsTick = 0;
        if (++nvsTick >= 10) {
          nvsTick = 0;
          preferences.putUInt("lockSec", lockoutRemainingSec);
        }
      } else {
        // Lockout expired!
        isDeviceLockedOut = false;
        sessionState = SESSION_IDLE;
        preferences.putUInt("lockSec", 0);
        lockoutScreenDrawn = false;
        Serial.println("[LOCKOUT] 48-Hour penalty expired! Device restored to normal.");
        drawHomePage();
      }
    }
  }

  // ===================================================
  // SOUND BEEP COMMAND/AUDIO SIMULATION (Prints every 1s while active)
  // ===================================================
  static uint32_t lastSoundBeepMs = 0;
  if (soundAlarmActive && millis() - lastSoundBeepMs >= 1000) {
    lastSoundBeepMs = millis();
    Serial.println("[SOUND BEEPING] >> ALERT: " + soundAlarmMessage + " -- Tap [STOP SOUND] on device or web to silence! <<");
  }

  // ===================================================
  // HOME PAGE LIVE TIMER UPDATE (every second)
  // ===================================================
  static uint32_t lastHomeRefresh = 0;
  if (!isDeviceLockedOut && currentPage == PAGE_HOME && millis() - lastHomeRefresh >= 1000) {
    lastHomeRefresh = millis();
    updateHomePageLiveValues();
  }

  // ===================================================
  // BIDIRECTIONAL SESSION SYNC WITH BACKEND (every 3-5 seconds)
  // Synchronizes session start, timer countdown, alarms, and ratings between Web and Device
  // ===================================================
  static uint32_t lastSessionSync = 0;
  uint32_t syncInterval = (sessionState == SESSION_IDLE) ? 3000 : 5000;
  if (millis() - lastSessionSync >= syncInterval && millis() > 4000) {
    lastSessionSync = millis();
    if (WiFi.status() == WL_CONNECTED && currentPage != PAGE_CAMERA) {
      HTTPClient http;
      http.begin(String(sessionBaseURL) + "/current");
      http.setTimeout(2000);
      int code = http.GET();
      if (code == 200) {
        String payload = http.getString();
        JsonDocument doc;
        if (!deserializeJson(doc, payload)) {
          // Synchronize Hard Lockout from server
          if (!doc["lockout"].isNull()) {
            bool beLocked = doc["lockout"]["lockedOut"] | false;
            bool beAdminUnlocked = doc["lockout"]["adminUnlocked"] | false;
            uint32_t beSec = doc["lockout"]["remainingSeconds"] | 0;

            if (beAdminUnlocked && isDeviceLockedOut) {
              // Admin explicitly clicked Unlock on Web!
              isDeviceLockedOut = false;
              sessionState = SESSION_IDLE;
              lockoutRemainingSec = 0;
              preferences.putUInt("lockSec", 0);
              lockoutScreenDrawn = false;
              currentPage = PAGE_HOME;
              Serial.println("[LOCKOUT] Admin explicitly unlocked device via Web!");
              drawHomePage();
            } else if (beLocked) {
              if (!isDeviceLockedOut) {
                isDeviceLockedOut = true;
                sessionState = SESSION_LOCKED_OUT;
                currentPage = PAGE_LOCKOUT;
                lockoutRemainingSec = beSec > 0 ? beSec : 172800UL;
                preferences.putUInt("lockSec", lockoutRemainingSec);
                soundAlarmActive = false;
                Serial.printf("[LOCKOUT] Server activated Lockout! Remaining: %u sec\n", lockoutRemainingSec);
                drawLockoutScreen();
              } else if (beSec > 0 && abs((long)lockoutRemainingSec - (long)beSec) > 5) {
                lockoutRemainingSec = beSec;
                preferences.putUInt("lockSec", lockoutRemainingSec);
                updateLockoutCountdown();
              }
            }
          }

          if (doc["data"].isNull() && !isDeviceLockedOut) {
            // Server has no active session — if device is running, reset to IDLE
            if (sessionState == SESSION_ACTIVE || sessionState == SESSION_BREAK) {
              sessionState = SESSION_IDLE;
              sessionStartMs = 0;
              sessionTotalMs = 0;
              totalBreakMs = 0;
              sessionBreakCount = 0;
              Serial.println("[SYNC] Server has no active session. Reset device to IDLE.");
              drawHomePage();
            }
          } else if (!doc["data"].isNull() && !isDeviceLockedOut) {
            int beTarget = doc["data"]["targetDurationMinutes"] | 120;
            if (beTarget > 0 && beTarget != targetDurationMinutes) {
              targetDurationMinutes = beTarget;
              Serial.printf("[SYNC] Target duration synced from web: %d mins\n", targetDurationMinutes);
            }

            String beStatus = doc["data"]["status"].as<String>();
            unsigned long beRemSec = doc["data"]["remainingSeconds"] | 0;

            // 1. Session started remotely from Web while device is IDLE
            if ((beStatus == "ACTIVE" || beStatus == "BREAK") && sessionState == SESSION_IDLE) {
              sessionState = (beStatus == "BREAK") ? SESSION_BREAK : SESSION_ACTIVE;
              targetDurationMinutes = beTarget;
              if (beRemSec > 0) {
                unsigned long targetSec = (unsigned long)targetDurationMinutes * 60UL;
                unsigned long serverActiveSec = (targetSec > beRemSec) ? (targetSec - beRemSec) : 0;
                sessionTotalMs = serverActiveSec * 1000UL;
                sessionStartMs = millis();
              } else {
                sessionTotalMs = 0;
                sessionStartMs = millis();
              }
              sessionBreakCount = doc["data"]["breakCount"] | 0;
              totalBreakMs = (doc["data"]["totalBreakMinutes"] | 0) * 60000UL;
              Serial.println("[SYNC] Session started remotely from Web! Synchronized device timer.");
              drawHomePage();
            }

            // 2. Session ended remotely from Web
            else if ((beStatus == "COMPLETED" || beStatus == "INVALID") && (sessionState == SESSION_ACTIVE || sessionState == SESSION_BREAK || sessionState == SESSION_DYING)) {
              if (beStatus == "INVALID") {
                sessionState = SESSION_INVALID;
                isInvalidSession = true;
                soundAlarmActive = true;
                alarmTriggeredAtMs = millis();
                soundAlarmMessage = "SESSION INVALID: EXCEEDED 3 BREAKS!";
                drawAlarmScreen();
              } else {
                sessionState = SESSION_IDLE;
                sessionStartMs = 0;
                sessionTotalMs = 0;
                totalBreakMs = 0;
                sessionBreakCount = 0;
                Serial.println("[SYNC] Session completed remotely from Web. Reset device to IDLE.");
                drawHomePage();
              }
            }

            // 3. Keep running timer tightly synchronized with server
            else if (sessionState == SESSION_ACTIVE && beStatus == "ACTIVE" && beRemSec > 0) {
              unsigned long targetSec = (unsigned long)targetDurationMinutes * 60UL;
              unsigned long serverActiveSec = (targetSec > beRemSec) ? (targetSec - beRemSec) : 0;
              unsigned long currentDevActiveSec = (sessionTotalMs / 1000) + ((sessionStartMs > 0) ? (millis() - sessionStartMs) / 1000 : 0);
              if (abs((long)currentDevActiveSec - (long)serverActiveSec) > 3) {
                sessionTotalMs = serverActiveSec * 1000UL;
                sessionStartMs = millis();
                Serial.printf("[SYNC] Auto-aligned device timer with server: activeSec=%lu remSec=%lu\n", serverActiveSec, beRemSec);
              }
            }

            bool beAlarm = doc["data"]["alarmActive"] | false;
            // Only dismiss if alarm was NOT triggered in the last 8 seconds to prevent race condition
            if (!beAlarm && soundAlarmActive && (millis() - alarmTriggeredAtMs > 8000)) {
              // STOP SOUND was tapped on the Web!
              soundAlarmActive = false;
              alarmScreenDrawn = false;
              soundAlarmMessage = "";
              Serial.println("[SYNC] Sound alarm stopped remotely via Web!");
              drawHomePage();
            } else if (beAlarm && !soundAlarmActive) {
              // Alarm was triggered from Web!
              soundAlarmActive = true;
              alarmTriggeredAtMs = millis();
              soundAlarmMessage = doc["data"]["alarmMessage"].as<String>();
              drawAlarmScreen();
            }

            int beRating = doc["data"]["selfRating"] | 0;
            if (beRating > 0 && beRating != selfRating) {
              selfRating = beRating;
            }
          }
        }
      } else if (code == 403) {
        String payload = http.getString();
        JsonDocument doc;
        if (!deserializeJson(doc, payload) && doc["data"]["lockedOut"] == true) {
          isDeviceLockedOut = true;
          sessionState = SESSION_LOCKED_OUT;
          currentPage = PAGE_LOCKOUT;
          lockoutRemainingSec = doc["data"]["remainingSeconds"] | 172800UL;
          preferences.putUInt("lockSec", lockoutRemainingSec);
          soundAlarmActive = false;
          drawLockoutScreen();
        }
      }
      http.end();
      vTaskDelay(pdMS_TO_TICKS(1));
    }
  }

  // ===================================================
  // DAILY MIDNIGHT ROLLOVER CHECK (every 30 seconds)
  // ===================================================
  static uint32_t lastDailyCheck = 0;
  if (millis() - lastDailyCheck >= 30000) {
    lastDailyCheck = millis();
    checkDailyReset();
  }

  // ===================================================
  // FETCH DISPLAY CONFIG (every 30 seconds)
  // ===================================================
  static uint32_t lastDisplayConfigFetch = 0;
  if (millis() - lastDisplayConfigFetch >= 30000 && millis() > 10000) {
    lastDisplayConfigFetch = millis();
    fetchDisplayConfig();
  }

  // ===================================================
  // FETCH SDW POINTS (every 60 seconds)
  // ===================================================
  static uint32_t lastSDWFetch = 0;
  if (millis() - lastSDWFetch >= 60000 && millis() > 8000) {
    lastSDWFetch = millis();
    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      http.begin(sdwPointsURL);
      http.setTimeout(2000);
      int code = http.GET();
      if (code == 200) {
        String payload = http.getString();
        JsonDocument doc;
        if (!deserializeJson(doc, payload)) {
          sdwWeeklyPts = doc["data"]["weekly"] | 0;
          sdwMonthlyPts = doc["data"]["monthly"] | 0;
          sdwFetched = true;
        }
      }
      http.end();
      vTaskDelay(pdMS_TO_TICKS(1));
    }
  }

  // ===================================================
  // SMALL DELAY
  // ===================================================

  delay(5);
}
