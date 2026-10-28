import re

with open("SmartDesk_ESP32.ino", "r") as f:
    content = f.read()

# Add Preferences include
if "<Preferences.h>" not in content:
    content = content.replace("#include <Arduino.h>", "#include <Arduino.h>\n#include <Preferences.h>\nPreferences preferences;")

# Add Preferences initialization in setup()
if "preferences.begin" not in content:
    content = content.replace("void setup()\n{", "void setup()\n{\n  preferences.begin(\"sdw\", false);\n  sessionTotalMs = preferences.getUInt(\"sessMs\", 0);\n  dailyBreakMs = preferences.getUInt(\"brkMs\", 0);\n")

# Save Preferences in state changes
save_logic = """
        preferences.putUInt("sessMs", sessionTotalMs);
        preferences.putUInt("brkMs", dailyBreakMs);
"""

# Replace sessionState = SESSION_IDLE reset block
content = content.replace("sessionState      = SESSION_IDLE;", "sessionState      = SESSION_IDLE;\n" + save_logic)

# Replace sessionState = SESSION_BREAK block (where active time is added)
content = content.replace("sessionTotalMs  += (millis() - sessionStartMs); // accumulate active time", 
                          "sessionTotalMs  += (millis() - sessionStartMs); // accumulate active time\n        preferences.putUInt(\"sessMs\", sessionTotalMs);")

with open("SmartDesk_ESP32.ino", "w") as f:
    f.write(content)
