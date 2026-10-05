const axios = require('axios');

async function run() {
  try {
    const res = await axios.get('http://localhost:5000/api/sessions/ESP32-S3-01/moderation-history?date=2026-10-05', {
      headers: {
        // Need admin token if protected. Let's just mock or bypass.
        // Or I can just check the db.
      }
    });
    console.log(res.data);
  } catch (err) {
    console.error(err.message);
  }
}
run();
