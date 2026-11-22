# SmartDesk ESP32 Firmware

This directory contains the embedded C++/Arduino firmware for the smmart SmartDesk hardware module based on the **ESP32-S3**.

---

## 📁 Directory Structure

```
firmware/
└── SmartDesk_ESP32/
    └── SmartDesk_ESP32.ino   <-- Main Arduino sketch
```

> **Note**: In the Arduino IDE / PlatformIO ecosystem, the `.ino` sketch file must reside inside a directory matching its name (`SmartDesk_ESP32/SmartDesk_ESP32.ino`).

---

## 🛠️ Hardware Requirements

- **MCU**: ESP32-S3 Dev Module (or compatible ESP32-S3 board with OPI PSRAM)
- **Display**: ST7789 240x240 / 320x240 SPI TFT Display (or GC9A01 circular display)
- **Audio**: MAX98357A I2S DAC Audio Amplifier & 3W 4Ω Speaker
- **Sensors**: Ultrasonic distance sensor / ToF (VL53L0X) for posture & away-detection
- **Indicators**: WS2812B NeoPixel RGB LED Strip
- **Input**: Tactile buttons / Rotary encoder for Deep Work control

---

## 🔑 Wi-Fi Credentials (first-time setup)

Wi-Fi details are kept out of git. Before compiling:

1. Copy `SmartDesk_ESP32/secrets.example.h` to `SmartDesk_ESP32/secrets.h`.
2. Put your network name and password in `secrets.h`.
3. On the dashboard, open **Devices**, press **Generate key** on this desk (admins only), and paste the key into `DEVICE_KEY` in `secrets.h`. The key is shown once.

`secrets.h` is listed in `.gitignore`, so it is never committed.

Once a desk has a key, the backend only accepts requests for that desk from the device (with its key) or from signed-in users. Generating a new key locks out the old one, so re-flash the device afterwards.

---

## ⚙️ Arduino IDE Board Configuration

- **Board**: `ESP32S3 Dev Module`
- **USB CDC On Boot**: `Enabled`
- **Flash Size**: `16MB (128Mb)` or `8MB`
- **Partition Scheme**: `16M Flash (3MB APP/9.9MB FATFS)` or `Huge APP (3MB No OTA/1MB SPIFFS)`
- **PSRAM**: `OPI PSRAM`
- **Upload Speed**: `921600`
- **Core Debug Level**: `None` or `Info`

---

## 📦 Required Arduino Libraries

Install these via the Arduino Library Manager:
- `TFT_eSPI` by Bodmer
- `ArduinoJson` by Benoît Blanchon (v6 or v7)
- `Adafruit NeoPixel` by Adafruit
- `ESP32-audioI2S` by schreibfaul1
- `WebSockets` by Markus Sattler
- `WiFiClientSecure` & `HTTPClient` (bundled with ESP32 board package)
