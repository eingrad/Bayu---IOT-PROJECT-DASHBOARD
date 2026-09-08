require("dotenv").config();

const express = require("express");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const { Pool } = require("pg");

const { format } = require("@fast-csv/format");
const { convert, unitFor } = require("./units");

const bodyParser = require("body-parser");
const mqtt = require("mqtt");
const WebSocket = require("ws");
const http = require("http");

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.json());

// Create HTTP server and attach to Express
const server = http.createServer(app);

// Database connection pools
const poolAdmin = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  database: process.env.DB_NAME,
  user: process.env.DB_ADMIN_USER,
  password: process.env.DB_ADMIN_PASS,
});

const poolUser = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_USER_PASS,
});

// JWT authentication middleware

/*function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ msg: "Token Needed" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ msg: "Unverified Token" });
  }
}*/

function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ msg: "Token Needed" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    console.log("✅ Verified token payload:", req.user);
    next();
  } catch (err) {
    console.error("❌ JWT error:", err.message);
    res.status(401).json({ msg: "Unverified Token" });
  }
}

// Admin authorization middleware
function authorizeAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ msg: "Admin Only" });
  }
  next();
}

// -----------------------------------------------------------------
// 1) GET /companies  — list all companies (admin only)
// -----------------------------------------------------------------
app.get("/companies", authenticateJWT, authorizeAdmin, async (req, res) => {
  try {
    const { rows } = await poolAdmin.query(
      `SELECT id, name
           FROM companies
       ORDER BY name`
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /companies error:", err);
    res.status(500).json({ msg: "Server Error" });
  }
});

// -----------------------------------------------------------------
// 2) POST /users  — create a new user (admin only)
// -----------------------------------------------------------------
app.post("/users", authenticateJWT, authorizeAdmin, async (req, res) => {
  const { username, password, role, company_id } = req.body;
  if (!company_id) {
    return res.status(400).json({ msg: "company_id is required" });
  }

  const { rows: comps } = await poolAdmin.query(
    `SELECT email_domain
         FROM companies
        WHERE id = $1`,
    [company_id]
  );
  if (comps.length === 0) {
    return res.status(400).json({ msg: "Invalid company_id" });
  }
  const { email_domain } = comps[0];

  if (!username.endsWith("@" + email_domain)) {
    return res.status(400).json({
      msg: `Username must end with @${email_domain}`,
    });
  }

  try {
    const { rows } = await poolAdmin.query(
      `INSERT INTO users
             (username, password_hash, role, company_id)
           VALUES
             ($1, crypt($2, gen_salt('bf')), $3, $4)
           RETURNING id, username, role, created_at, company_id`,
      [username, password, role, company_id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("POST /users error:", err.message);
    res.status(500).json({ msg: "Server Error" });
  }
});

// -----------------------------------------------------------------
// 3) GET /users  — list all users (admin only)
// -----------------------------------------------------------------
app.get("/users", authenticateJWT, authorizeAdmin, async (req, res) => {
  try {
    const { rows } = await poolAdmin.query(
      `SELECT id, username, role, created_at, company_id
           FROM users
        ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /users error:", err);
    res.status(500).json({ msg: "Server Error" });
  }
});

// -----------------------------------------------------------------
// GET /me — the logged-in user's profile + saved location
// -----------------------------------------------------------------
app.get("/me", authenticateJWT, async (req, res) => {
  try {
    const { rows } = await poolAdmin.query(
      `SELECT id, username, role, company_id
           FROM users
          WHERE id = $1`,
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ msg: "User not found" });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error("GET /me error:", err);
    res.status(500).json({ msg: "Server Error" });
  }
});

// -----------------------------------------------------------------
// Per-user preferences (display units chosen in Sensor Settings)
// -----------------------------------------------------------------
async function getUserPrefs(userId) {
  try {
    const { rows } = await poolAdmin.query(
      `SELECT preferences FROM users WHERE id = $1`,
      [userId]
    );
    return rows[0]?.preferences || {};
  } catch (err) {
    console.error("getUserPrefs error:", err);
    return {};
  }
}

app.get("/me/preferences", authenticateJWT, async (req, res) => {
  res.json(await getUserPrefs(req.user.id));
});

app.put("/me/preferences", authenticateJWT, async (req, res) => {
  const prefs =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? req.body
      : {};
  try {
    const { rows } = await poolAdmin.query(
      `UPDATE users SET preferences = $1 WHERE id = $2 RETURNING preferences`,
      [JSON.stringify(prefs), req.user.id]
    );
    res.json(rows[0]?.preferences || {});
  } catch (err) {
    console.error("PUT /me/preferences error:", err);
    res.status(500).json({ msg: "Server Error" });
  }
});

// -----------------------------------------------------------------
// PUT /users/:id — update a user (admin only)
// -----------------------------------------------------------------
app.put("/users/:id", authenticateJWT, authorizeAdmin, async (req, res) => {
  const { username, role, company_id, password } = req.body;
  if (!company_id) {
    return res.status(400).json({ msg: "company_id is required" });
  }
  const { rows: comps } = await poolAdmin.query(
    `SELECT email_domain FROM companies WHERE id = $1`,
    [company_id]
  );
  if (comps.length === 0) {
    return res.status(400).json({ msg: "Invalid company_id" });
  }
  const { email_domain } = comps[0];
  if (username && !username.endsWith("@" + email_domain)) {
    return res
      .status(400)
      .json({ msg: `Username must end with @${email_domain}` });
  }
  try {
    const params = password
      ? [username, role, company_id, password, req.params.id]
      : [username, role, company_id, req.params.id];
    const query = password
      ? `UPDATE users
              SET username = $1, role = $2, company_id = $3,
                  password_hash = crypt($4, gen_salt('bf'))
            WHERE id = $5
        RETURNING id, username, role, created_at, company_id`
      : `UPDATE users
              SET username = $1, role = $2, company_id = $3
            WHERE id = $4
        RETURNING id, username, role, created_at, company_id`;
    const { rows } = await poolAdmin.query(query, params);
    if (rows.length === 0) {
      return res.status(404).json({ msg: "User not found" });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error("PUT /users error:", err.message);
    res.status(500).json({ msg: err.message });
  }
});

// -----------------------------------------------------------------
// DELETE /users/:id — remove a user (admin only)
// -----------------------------------------------------------------
app.delete("/users/:id", authenticateJWT, authorizeAdmin, async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ msg: "You cannot delete your own account" });
  }
  try {
    const result = await poolAdmin.query(
      `DELETE FROM users WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ msg: "User not found" });
    }
    res.json({ msg: "User deleted" });
  } catch (err) {
    console.error("DELETE /users error:", err.message);
    res.status(500).json({ msg: err.message });
  }
});

// -----------------------------------------------------------------
// 4) POST /login — user login
// -----------------------------------------------------------------
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const { rows } = await poolAdmin.query(
      `SELECT id, role
         FROM users
        WHERE username = $1
          AND password_hash = crypt($2, password_hash)`,
      [username, password]
    );
    if (!rows.length) {
      return res.status(401).json({ msg: "Wrong Email or Password!" });
    }
    const { id, role } = rows[0];
    const token = jwt.sign({ id, role }, process.env.JWT_SECRET, {
      expiresIn: "12h",
    });
    res.json({ token });
  } catch (err) {
    console.error("POST /login error:", err);
    res.status(500).json({ msg: "Server Error" });
  }
});

// -----------------------------------------------------------------
// 5) GET /wind-data — latest wind readings (any authenticated user)
// -----------------------------------------------------------------
app.get("/wind-data", authenticateJWT, async (req, res) => {
  try {
    const { rows } = await poolUser.query(
      `SELECT * FROM wind_data ORDER BY measured_at DESC LIMIT 100`
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /wind-data error:", err);
    res.status(500).json({ msg: "Server Error" });
  }
});

// -----------------------------------------------------------------
// 6) GET /particle-data — latest particle readings (any authenticated user)
// -----------------------------------------------------------------
app.get("/particle-data", authenticateJWT, async (req, res) => {
  try {
    const { rows } = await poolUser.query(
      `SELECT * FROM particle_data ORDER BY measured_at DESC LIMIT 100`
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /particle-data error:", err);
    res.status(500).json({ msg: "Server Error" });
  }
});

//-- ------------------------------
// Licenses
// ------------------------------

app.get("/license", authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await poolUser.query(
      `SELECT license_key, company, issued_at, expires_at, 
              CASE 
                WHEN expires_at < NOW() THEN 'expired'
                ELSE 'active'
              END AS status
       FROM licenses
       WHERE user_id = $1
       ORDER BY issued_at DESC
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No license found for user." });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("GET /license error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ------------------------------
// Sensor Info Cards
// ------------------------------

app.get("/device/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await poolUser.query("SELECT * FROM devices WHERE id = $1", [
      id,
    ]);
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Device not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------
// Device Info Cards & Latest Data With Particle and Wind Data
// ------------------------------

app.get("/device-info/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Device Info
    const deviceResult = await poolUser.query(
      `SELECT id, location, battery, status FROM devices WHERE id = $1`,
      [id]
    );
    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ error: "Device not found" });
    }
    const device = deviceResult.rows[0];

    // 2. Latest Particle Data
    const particleResult = await poolUser.query(
      `SELECT pm25, pm10, tsp, measured_at FROM particle_data 
       WHERE device_id = $1 
       ORDER BY measured_at DESC 
       LIMIT 1`,
      [id]
    );
    const particle = particleResult.rows[0] || {};

    // 3. Latest Wind Data
    const windResult = await poolUser.query(
      `SELECT humidity, pressure, humidity, temperature, measured_at FROM wind_data 
       WHERE device_id = $1 
       ORDER BY measured_at DESC 
       LIMIT 1`,
      [id]
    );
    const wind = windResult.rows[0] || {};

    // 3b. Latest Gas Data
    const gasResult = await poolUser.query(
      `SELECT co, so2, o3, no2, measured_at FROM gas_data
       WHERE device_id = $1
       ORDER BY measured_at DESC
       LIMIT 1`,
      [id]
    );
    const gas = gasResult.rows[0] || {};

    // 4. Combine all into one response
    res.json({
      ...device,
      ...particle,
      ...wind,
      ...gas,
      last_updated:
        particle.measured_at || wind.measured_at || gas.measured_at || null,
    });
  } catch (err) {
    console.error("❌ GET /device-info/:id failed:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ------------------------------
// My Devices Endpoint
// ------------------------------

app.get("/my-devices", authenticateJWT, async (req, res) => {
  try {
    // Admins see every station; regular users only see their own.
    const result =
      req.user.role === "admin"
        ? await poolAdmin.query(
            `SELECT id, device_name, location, latitude, longitude
               FROM devices
              ORDER BY created_at`
          )
        : await poolAdmin.query(
            `SELECT id, device_name, location, latitude, longitude
               FROM devices
              WHERE user_id = $1`,
            [req.user.id]
          );
    res.json(result.rows);
  } catch (err) {
    console.error("GET /my-devices error:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

// ------------------------------
// Stations (devices) — admin management
// ------------------------------
app.get("/devices", authenticateJWT, authorizeAdmin, async (req, res) => {
  try {
    const { rows } = await poolAdmin.query(
      `SELECT d.id, d.device_id, d.device_name, d.location,
              d.latitude, d.longitude, d.status, d.battery,
              d.user_id, u.username AS owner
         FROM devices d
         LEFT JOIN users u ON u.id = d.user_id
        ORDER BY d.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /devices error:", err);
    res.status(500).json({ msg: "Server Error" });
  }
});

app.post("/devices", authenticateJWT, authorizeAdmin, async (req, res) => {
  const { device_id, device_name, location, latitude, longitude, status, user_id } =
    req.body;
  if (!device_name) {
    return res.status(400).json({ msg: "device_name is required" });
  }
  try {
    const { rows } = await poolAdmin.query(
      `INSERT INTO devices
             (device_id, device_name, location, latitude, longitude, status, user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, device_id, device_name, location, latitude, longitude, status, battery, user_id`,
      [
        device_id || null,
        device_name,
        location || null,
        latitude === "" || latitude == null ? null : Number(latitude),
        longitude === "" || longitude == null ? null : Number(longitude),
        status || "offline",
        user_id || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("POST /devices error:", err.message);
    res.status(500).json({ msg: err.message });
  }
});

app.put("/devices/:id", authenticateJWT, authorizeAdmin, async (req, res) => {
  const { device_id, device_name, location, latitude, longitude, status, user_id } =
    req.body;
  if (!device_name) {
    return res.status(400).json({ msg: "device_name is required" });
  }
  try {
    const { rows } = await poolAdmin.query(
      `UPDATE devices SET
              device_id = $1, device_name = $2, location = $3,
              latitude = $4, longitude = $5, status = $6, user_id = $7,
              updated_at = NOW()
            WHERE id = $8
        RETURNING id, device_id, device_name, location, latitude, longitude, status, battery, user_id`,
      [
        device_id || null,
        device_name,
        location || null,
        latitude === "" || latitude == null ? null : Number(latitude),
        longitude === "" || longitude == null ? null : Number(longitude),
        status || "offline",
        user_id || null,
        req.params.id,
      ]
    );
    if (rows.length === 0) {
      return res.status(404).json({ msg: "Device not found" });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error("PUT /devices error:", err.message);
    res.status(500).json({ msg: err.message });
  }
});

app.delete("/devices/:id", authenticateJWT, authorizeAdmin, async (req, res) => {
  try {
    const result = await poolAdmin.query(
      `DELETE FROM devices WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ msg: "Device not found" });
    }
    res.json({ msg: "Device deleted" });
  } catch (err) {
    console.error("DELETE /devices error:", err.message);
    res.status(500).json({ msg: err.message });
  }
});

// ------------------------------
// MQTT to WebSocket Bridge
// ------------------------------
const MQTT_BROKER =
  process.env.MQTT_BROKER_URL ||
  "mqtts://02376c7baed24520a4341dc75f965cb2.s1.eu.hivemq.cloud:8883";
const MQTT_TOPICS = [
  "v1/device/demo/gasTelemetry", // CO, SO2, NO2, O3 (nested)
  "v1/device/demo/particulateTelemetry", // pm25, pm10, tsp
  "v1/device/demo/weatherStation", // temp, humidity, pressure, wind
];

const mqttClient = mqtt.connect(MQTT_BROKER, {
  username: process.env.MQTT_USERNAME || undefined,
  password: process.env.MQTT_PASSWORD || undefined,
  reconnectPeriod: 3000,
  connectTimeout: 30 * 1000,
  // mqtts:// enables TLS; HiveMQ Cloud uses a public CA (system trust store).
});

mqttClient.on("error", (err) => console.error("❌ MQTT error:", err.message));
mqttClient.on("offline", () => console.warn("📴 MQTT offline"));
mqttClient.on("reconnect", () => console.log("🔄 MQTT reconnecting..."));

// WebSocket server
const wss = new WebSocket.Server({ server });
const clients = new Set();

// Last message broadcast per topic, so a newly connected dashboard gets the
// most recent 1-minute average immediately instead of waiting for the next flush.
const lastMessages = new Map();

function broadcast(topic, dataObj) {
  const wsMessage = JSON.stringify({ topic, data: JSON.stringify(dataObj) });
  lastMessages.set(topic, wsMessage);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) client.send(wsMessage);
  }
}

wss.on("connection", (ws) => {
  console.log("🔌 WebSocket client connected");
  clients.add(ws);
  // Replay the latest value on each topic so widgets populate right away.
  for (const msg of lastMessages.values()) ws.send(msg);
  ws.on("close", () => clients.delete(ws));
});

// MQTT connection and topic subscription
mqttClient.on("connect", () => {
  console.log("✅ Connected to MQTT broker");

  mqttClient.subscribe(MQTT_TOPICS, (err) => {
    if (err) {
      console.error("❌ MQTT subscribe error:", err);
    } else {
      console.log(`📡 Subscribed to topics: ${MQTT_TOPICS.join(", ")}`);
    }
  });
  MQTT_TOPICS.forEach((topic) => {
    mqttClient.subscribe(topic, (err) => {
      if (err) {
        console.error(`❌ MQTT subscribe error for ${topic}:`, err);
      } else {
        console.log(`📡 Subscribed to topic: ${topic}`);
      }
    });
  });
});

// Device that owns the demo telemetry (used when persisting gas readings).
const DEVICE_ID =
  process.env.DEVICE_ID || "d6fb0a5d-2311-44fd-9657-2f9003e52602";

// Pick the first numeric value found under any of the candidate keys.
function pickNum(obj, keys) {
  for (const k of keys) {
    const val = obj?.[k];
    if (val !== undefined && val !== null && !isNaN(parseFloat(val))) {
      return parseFloat(val);
    }
  }
  return undefined;
}

async function persistParticle(n) {
  if (n.pm25 == null || n.pm10 == null || n.tsp == null) return;
  try {
    await poolUser.query(
      `INSERT INTO particle_data (pm25, pm10, tsp) VALUES ($1, $2, $3)`,
      [n.pm25, n.pm10, n.tsp]
    );
  } catch (e) {
    console.error("❌ particle_data insert:", e.message);
  }
}

async function persistGas(n) {
  try {
    await poolUser.query(
      `INSERT INTO gas_data (co, so2, o3, no2, device_id) VALUES ($1, $2, $3, $4, $5)`,
      [n.co ?? null, n.so2 ?? null, n.o3 ?? null, n.no2 ?? null, DEVICE_ID]
    );
  } catch (e) {
    console.error("❌ gas_data insert:", e.message);
  }
}

async function persistWind(n) {
  // wind_data columns are NOT NULL; require the core env fields.
  if (n.Temperature == null || n.Humidity == null || n.Pressure == null) return;
  try {
    await poolUser.query(
      `INSERT INTO wind_data (temperature, humidity, pressure, wind_speed, wind_direction)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        n.Temperature,
        n.Humidity,
        n.Pressure,
        n.Wind_Speed ?? 0,
        n.Wind_Direction ?? 0,
      ]
    );
  } catch (e) {
    console.error("❌ wind_data insert:", e.message);
  }
}

// ---- Averaging windows --------------------------------------------
// Raw device messages (~20 s) feed two paths:
//   • live → a rolling LIVE_WINDOW_MS average, recomputed and broadcast on
//            every message so the dashboard updates promptly while still
//            showing a smoothed 1-minute average.
//   • db   → a tumbling AGG_INTERVAL_MS average, written as one DB row
//            (5-minute average, used by reports / downloads / history).
const LIVE_WINDOW_MS = Number(process.env.LIVE_WINDOW_MS) || 60 * 1000;
const AGG_INTERVAL_MS = Number(process.env.AGG_INTERVAL_MS) || 5 * 60 * 1000;

let liveWindow = emptyWindow();
let dbBuffers = emptyBuffers();

function emptyBuffers() {
  return {
    gas: { co: [], so2: [], o3: [], no2: [] },
    particle: { pm25: [], pm10: [], tsp: [] },
    wind: {
      temperature: [],
      humidity: [],
      pressure: [],
      wind_speed: [],
      wind_direction: [],
    },
  };
}

// Push each numeric field of `obj` into the matching bucket array.
function pushSample(bucket, obj) {
  for (const k of Object.keys(bucket)) {
    const v = obj[k];
    if (v !== undefined && v !== null && !isNaN(v)) bucket[k].push(Number(v));
  }
}

function mean(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// Circular mean for wind direction (degrees) — a plain average is wrong near 0°/360°.
function meanDirection(arr) {
  if (!arr.length) return null;
  let s = 0;
  let c = 0;
  for (const d of arr) {
    const r = (d * Math.PI) / 180;
    s += Math.sin(r);
    c += Math.cos(r);
  }
  let deg = (Math.atan2(s / arr.length, c / arr.length) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

// Timestamped rolling buffers for the live 1-minute average.
function emptyWindow() {
  return {
    gas: { co: [], so2: [], o3: [], no2: [] },
    particle: { pm25: [], pm10: [], tsp: [] },
    wind: {
      temperature: [],
      humidity: [],
      pressure: [],
      wind_speed: [],
      wind_direction: [],
    },
  };
}

// Add a sample to the rolling live window; drop anything older than the window.
function addLiveSample(group, obj) {
  const now = Date.now();
  const cutoff = now - LIVE_WINDOW_MS;
  const w = liveWindow[group];
  for (const k of Object.keys(w)) {
    const v = obj[k];
    if (v !== undefined && v !== null && !isNaN(v)) {
      w[k].push({ t: now, v: Number(v) });
    }
    while (w[k].length && w[k][0].t < cutoff) w[k].shift();
  }
}

function windowMean(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, s) => a + s.v, 0) / arr.length;
}

function windowMeanDirection(arr) {
  if (!arr.length) return null;
  let s = 0;
  let c = 0;
  for (const x of arr) {
    const r = (x.v * Math.PI) / 180;
    s += Math.sin(r);
    c += Math.cos(r);
  }
  let deg = (Math.atan2(s / arr.length, c / arr.length) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

// Broadcast the current rolling 1-minute average for one group.
function broadcastLive(group) {
  const w = liveWindow[group];
  if (group === "gas") {
    broadcast("v1/devices/me/gas", {
      co: windowMean(w.co),
      so2: windowMean(w.so2),
      o3: windowMean(w.o3),
      no2: windowMean(w.no2),
    });
  } else if (group === "particle") {
    broadcast("v1/devices/me/telemetry2", {
      pm25: windowMean(w.pm25),
      pm10: windowMean(w.pm10),
      tsp: windowMean(w.tsp),
    });
  } else if (group === "wind") {
    broadcast("v1/devices/me/telemetry", {
      Temperature: windowMean(w.temperature),
      Humidity: windowMean(w.humidity),
      Pressure: windowMean(w.pressure),
      Wind_Speed: windowMean(w.wind_speed),
      Wind_Direction: windowMeanDirection(w.wind_direction),
    });
  }
}

// One incoming reading: update the live rolling average (broadcast now) and
// accumulate into the 5-minute DB window.
function ingest(group, obj) {
  addLiveSample(group, obj);
  pushSample(dbBuffers[group], obj);
  broadcastLive(group);
}

async function flushAggregates() {
  // Snapshot then reset immediately so samples arriving mid-flush aren't lost.
  const b = dbBuffers;
  dbBuffers = emptyBuffers();

  const g = b.gas;
  const gasN = g.co.length + g.so2.length + g.o3.length + g.no2.length;
  if (gasN > 0) {
    await persistGas({
      co: mean(g.co),
      so2: mean(g.so2),
      o3: mean(g.o3),
      no2: mean(g.no2),
    });
  }

  const p = b.particle;
  if (p.pm25.length || p.pm10.length || p.tsp.length) {
    await persistParticle({
      pm25: mean(p.pm25),
      pm10: mean(p.pm10),
      tsp: mean(p.tsp),
    });
  }

  const w = b.wind;
  if (w.temperature.length || w.humidity.length || w.pressure.length) {
    await persistWind({
      Temperature: mean(w.temperature),
      Humidity: mean(w.humidity),
      Pressure: mean(w.pressure),
      Wind_Speed: mean(w.wind_speed),
      Wind_Direction: meanDirection(w.wind_direction),
    });
  }

  if (gasN || p.pm25.length || w.temperature.length) {
    console.log(
      `💾 5-min averages saved (samples — gas:${g.co.length} particle:${p.pm25.length} wind:${w.temperature.length})`
    );
  }
}

setInterval(flushAggregates, AGG_INTERVAL_MS);

// Normalise each MQTT message into the flat shape the frontend consumes, then
// ingest() it (rolling live broadcast + 5-minute DB accumulation).
mqttClient.on("message", (topic, message) => {
  let parsed;
  try {
    parsed = JSON.parse(message.toString());
  } catch {
    return; // ignore non-JSON payloads
  }

  if (topic.endsWith("gasTelemetry")) {
    ingest("gas", {
      co: parsed?.CO?.CO_ppm,
      so2: parsed?.SO2?.SO2_ppb,
      o3: parsed?.O3?.O3_ppb,
      no2: parsed?.NO2?.NO2_ppb,
    });
  } else if (topic.endsWith("particulateTelemetry")) {
    ingest("particle", {
      pm25: pickNum(parsed, ["PM2.5", "pm25", "PM25"]),
      pm10: pickNum(parsed, ["PM10", "pm10"]),
      tsp: pickNum(parsed, ["TSP", "tsp"]),
    });
  } else if (topic.endsWith("weatherStation")) {
    ingest("wind", {
      temperature: pickNum(parsed, ["Temperature", "temperature", "temp", "Temp"]),
      humidity: pickNum(parsed, ["Humidity", "humidity", "hum", "RH", "rh"]),
      pressure: pickNum(parsed, ["Pressure", "pressure", "press", "hPa"]),
      wind_speed: pickNum(parsed, [
        "Wind_Speed",
        "wind_speed",
        "windSpeed",
        "WindSpeed",
        "speed",
      ]),
      wind_direction: pickNum(parsed, [
        "Wind_Direction",
        "wind_direction",
        "windDir",
        "WindDirection",
        "direction",
        "deg",
      ]),
    });
  }
});

// Start the combined server
server.listen(PORT, () => {
  console.log(`🚀 Server (HTTP + WS) listening on http://localhost:${PORT}`);
});

// ------------------------------
// CSV Download Endpoints
// ------------------------------

//Particle Data
app.get("/download/particle-data", authenticateJWT, async (req, res) => {
  const { fields, start, end } = req.query;

  const allowedFields = ["pm25", "pm10", "tsp"];
  const selected = fields
    ? fields.split(",").filter((f) => allowedFields.includes(f))
    : allowedFields;

  if (selected.length === 0) {
    return res.status(400).json({ msg: "No valid fields selected" });
  }

  const conditions = [];
  const params = [];

  if (start) {
    const paramIndex = params.length + 1;
    conditions.push(`measured_at >= $${paramIndex}`);
    params.push(start);
  }

  if (end) {
    const paramIndex = params.length + 1;
    conditions.push(`measured_at <= $${paramIndex}`);
    params.push(end);
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const query = `SELECT ${selected.join(
    ", "
  )}, measured_at FROM particle_data ${whereClause} ORDER BY measured_at DESC`;

  try {
    const { rows } = await poolUser.query(query, params);
    const prefs = await getUserPrefs(req.user.id);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=particle_data.csv"
    );

    const csvStream = format({ headers: true });
    csvStream.pipe(res);
    rows.forEach((row) => {
      const out = {};
      selected.forEach((f) => {
        const u = unitFor(prefs, f);
        out[`${f} (${u})`] = convert(f, row[f], u, {
          temperature: row.temperature,
        });
      });
      out["measured_at"] = row.measured_at;
      csvStream.write(out);
    });
    csvStream.end();
  } catch (err) {
    console.error("❌ Query Error:", err);
    res.status(500).json({ msg: "Server Error" });
  }
});

//Wind Data

app.get("/download/wind-data", authenticateJWT, async (req, res) => {
  const { fields, start, end } = req.query;

  const allowedFields = [
    "temperature",
    "humidity",
    "pressure",
    "wind_speed",
    "wind_direction",
  ];
  const selected = fields
    ? fields.split(",").filter((f) => allowedFields.includes(f))
    : allowedFields;

  if (selected.length === 0) {
    return res.status(400).json({ msg: "No valid fields selected" });
  }

  const conditions = [];
  const params = [];

  if (start) {
    const paramIndex = params.length + 1;
    conditions.push(`measured_at >= $${paramIndex}`);
    params.push(start);
  }

  if (end) {
    const paramIndex = params.length + 1;
    conditions.push(`measured_at <= $${paramIndex}`);
    params.push(end);
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const query = `SELECT ${selected.join(
    ", "
  )}, measured_at FROM wind_data ${whereClause} ORDER BY measured_at DESC`;

  try {
    const { rows } = await poolUser.query(query, params);
    const prefs = await getUserPrefs(req.user.id);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=wind_data.csv");

    const csvStream = format({ headers: true });
    csvStream.pipe(res);
    rows.forEach((row) => {
      const out = {};
      selected.forEach((f) => {
        const u = unitFor(prefs, f);
        out[`${f} (${u})`] = convert(f, row[f], u, {
          temperature: row.temperature,
        });
      });
      out["measured_at"] = row.measured_at;
      csvStream.write(out);
    });
    csvStream.end();
  } catch (err) {
    console.error("❌ Wind data query error:", err);
    res.status(500).json({ msg: "Server Error" });
  }
});

// ------------------------------
// Excel Download Endpoint
// ------------------------------
const ExcelJS = require("exceljs");

app.get("/download/excel", authenticateJWT, async (req, res) => {
  const { dataType, fields, start, end } = req.query;

  const tables = {
    wind: {
      name: "wind_data",
      allowed: [
        "temperature",
        "humidity",
        "pressure",
        "wind_speed",
        "wind_direction",
      ],
      sheet: "Environment Data",
    },
    particle: {
      name: "particle_data",
      allowed: ["pm25", "pm10", "tsp"],
      sheet: "Particle Data",
    },
  };

  const table = tables[dataType];
  if (!table) return res.status(400).json({ msg: "Invalid dataType" });

  const selected = fields
    ? String(fields)
        .split(",")
        .filter((f) => table.allowed.includes(f))
    : table.allowed;

  if (selected.length === 0) {
    return res.status(400).json({ msg: "No valid fields selected" });
  }

  const conditions = [];
  const params = [];
  if (start) {
    params.push(start);
    conditions.push(`measured_at >= $${params.length}`);
  }
  if (end) {
    params.push(end);
    conditions.push(`measured_at <= $${params.length}`);
  }
  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";
  const query = `SELECT ${selected.join(", ")}, measured_at FROM ${
    table.name
  } ${whereClause} ORDER BY measured_at DESC`;

  try {
    const { rows } = await poolUser.query(query, params);
    const prefs = await getUserPrefs(req.user.id);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(table.sheet);
    sheet.columns = [
      ...selected.map((f) => ({
        header: `${f} (${unitFor(prefs, f)})`,
        key: f,
        width: 20,
      })),
      { header: "measured_at", key: "measured_at", width: 24 },
    ];
    rows.forEach((row) => {
      const out = { measured_at: row.measured_at };
      selected.forEach((f) => {
        out[f] = convert(f, row[f], unitFor(prefs, f), {
          temperature: row.temperature,
        });
      });
      sheet.addRow(out);
    });
    sheet.getRow(1).font = { bold: true };

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${dataType}_data.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("❌ Excel export error:", err);
    res.status(500).json({ msg: "Server Error" });
  }
});

// ------------------------------
// PDF Download Endpoints
// ------------------------------

const ejs = require("ejs");
const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");

app.get("/report/pdf", authenticateJWT, async (req, res) => {
  const { dataType, start, end, fields } = req.query;

  const tables = {
    wind: {
      name: "wind_data",
      allowed: [
        "temperature",
        "humidity",
        "pressure",
        "wind_speed",
        "wind_direction",
      ],
    },
    particle: {
      name: "particle_data",
      allowed: ["pm25", "pm10", "tsp"],
    },
  };

  if (!tables[dataType]) return res.status(400).send("Invalid dataType");

  const selected = fields
    ? fields.split(",").filter((f) => tables[dataType].allowed.includes(f))
    : tables[dataType].allowed;

  if (selected.length === 0) {
    return res.status(400).json({ msg: "No valid fields selected" });
  }

  const conditions = [];
  const params = [];

  if (start) {
    const idx = params.length + 1;
    conditions.push(`measured_at >= $${idx}`);
    params.push(start);
  }
  if (end) {
    const idx = params.length + 1;
    conditions.push(`measured_at <= $${idx}`);
    params.push(end);
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const query = `SELECT ${selected.join(", ")}, measured_at FROM ${
    tables[dataType].name
  } ${whereClause} ORDER BY measured_at ASC`;

  try {
    const { rows } = await poolUser.query(query, params);

    const prefs = await getUserPrefs(req.user.id);

    // Header label (with unit) for each selected field.
    const fieldLabels = {};
    selected.forEach((f) => {
      fieldLabels[f] = `${f} (${unitFor(prefs, f)})`;
    });

    // Convert each row's values into the chosen display units.
    const data = rows.map((row) => {
      const out = { measured_at: row.measured_at };
      selected.forEach((f) => {
        out[f] = convert(f, row[f], unitFor(prefs, f), {
          temperature: row.temperature,
        });
      });
      return out;
    });

    const tempUnit = unitFor(prefs, "temperature");
    const withTemp = rows.filter((r) => r.temperature != null);
    const avgTempC =
      withTemp.length > 0
        ? withTemp.reduce((acc, r) => acc + Number(r.temperature), 0) /
          withTemp.length
        : null;

    const stats = {
      total: rows.length,
      averageTemperature:
        dataType === "wind" && avgTempC != null
          ? convert("temperature", avgTempC, tempUnit)
          : undefined,
      temperatureUnit: tempUnit,
    };

    const templatePath = path.join(
      __dirname,
      "reports",
      "templates",
      "report-template.ejs"
    );
    const html = await ejs.renderFile(templatePath, {
      dataType,
      startDate: start,
      endDate: end,
      generatedAt: new Date().toLocaleString(),
      fields: selected,
      fieldLabels,
      data,
      stats,
      chartUrl: null,
    });

    const browser = await puppeteer.launch({
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${dataType}_report.pdf`
    );
    res.send(pdfBuffer);
  } catch (err) {
    console.error("PDF generation error:", err);
    res.status(500).send("Failed to generate report");
  }
});

// ------------------------------
// Alert Rules
// ------------------------------

app.post("/alert-rule", authenticateJWT, async (req, res) => {
  const { parameter, threshold, telegram_username, enabled } = req.body;
  const userId = req.user.id;

  if (!parameter || !threshold || !telegram_username) {
    return res.status(400).json({ msg: "Missing fields" });
  }

  try {
    const lookup = await poolUser.query(
      `SELECT chat_id FROM telegram_users WHERE username = $1`,
      [telegram_username.replace("@", "")]
    );

    if (lookup.rows.length === 0) {
      return res.status(400).json({
        msg: "Telegram username not registered. Please start the bot first.",
      });
    }

    const chatId = lookup.rows[0].chat_id;

    const result = await poolUser.query(
      `INSERT INTO alert_rules (user_id, parameter, threshold, telegram_chat_id, username, enabled)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, parameter, threshold, chatId, telegram_username, enabled]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error inserting alert rule:", err);
    res.status(500).json({ msg: "Database error" });
  }
});

app.get("/alert-rules", authenticateJWT, async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await poolUser.query(
      `SELECT * FROM alert_rules WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching alert rules:", err);
    res.status(500).json({ msg: "Database error" });
  }
});

// ------------------------------
// Check Alert Rules
// ------------------------------

const axios = require("axios");

async function checkAlertRules() {
  try {
    const { rows: rules } = await poolUser.query(
      `SELECT * FROM alert_rules WHERE enabled = true`
    );

    console.log(`🔍 Found ${rules.length} active alert rules`);

    for (const rule of rules) {
      const { id, parameter, threshold, username } = rule;

      if (!username) {
        console.warn(`⚠️ Rule ${id} has no telegram username`);
        continue;
      }

      console.log(`---\nEvaluating rule for ${parameter} > ${threshold}`);
      console.log(`Looking up chat_id for @${username}`);

      // Lookup chat_id by username
      const tg = await poolUser.query(
        `SELECT chat_id FROM telegram_users WHERE username = $1`,
        [username.replace(/^@/, "")]
      );

      if (!tg.rows.length) {
        console.warn(`⚠️ No chat_id found for Telegram user: @${username}`);
        continue;
      }

      const chat_id = tg.rows[0].chat_id;

      // Fetch latest sensor value
      const sensorQuery = `SELECT ${parameter} FROM particle_data ORDER BY measured_at DESC LIMIT 1`;
      const { rows: sensorData } = await poolUser.query(sensorQuery);

      if (sensorData.length && sensorData[0][parameter] > threshold) {
        const value = sensorData[0][parameter];
        const message = `🚨 Alert: *${parameter.toUpperCase()}* exceeded threshold!\nCurrent value: *${value}* µg/m³\nThreshold: *${threshold}* µg/m³`;

        await axios.post(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            chat_id,
            text: message,
            parse_mode: "Markdown",
          }
        );

        console.log(`✅ Sent alert to ${chat_id} (@${username})`);
      }
    }
  } catch (err) {
    console.error("❌ Alert check error:", err.message);
  }
}
setInterval(checkAlertRules, 60000); // Check every minute

// ------------------------------
// Telegram Webhook
// ------------------------------
app.post("/telegram/webhook", express.json(), async (req, res) => {
  const message = req.body?.message;
  if (!message) return res.sendStatus(200);

  const chatId = message.chat.id;
  const from = message.from;

  // Fallback: use a pseudo-username if real one is missing
  const username = from.username || `${from.first_name || "user"}_${from.id}`;

  try {
    await poolUser.query(
      `INSERT INTO telegram_users (username, chat_id)
       VALUES ($1, $2)
       ON CONFLICT (username) DO UPDATE SET chat_id = $2`,
      [username, chatId]
    );

    await axios.post(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: chatId,
        text: `✅ You are now connected to Bayu Alerts as @${username}`,
      }
    );

    console.log(`✅ Registered Telegram user: @${username}`);
  } catch (err) {
    console.error("❌ Failed to register Telegram user:", err.message);
  }

  res.sendStatus(200);
});

// -----------------------------------------------------------------
// GET /licenses — list all licenses (admin only)
// -----------------------------------------------------------------
app.get("/licenses", authenticateJWT, authorizeAdmin, async (req, res) => {
  try {
    const result = await poolAdmin.query(
      `SELECT licenses.*, users.username 
       FROM licenses
       LEFT JOIN users ON licenses.user_id = users.id
       ORDER BY issued_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching licenses:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// -----------------------------------------------------------------
// POST /licenses/assign — assign a license to a user (admin only)
// -----------------------------------------------------------------
app.post(
  "/licenses/assign",
  authenticateJWT,
  authorizeAdmin,
  async (req, res) => {
    const { license_id, user_id } = req.body;

    if (!license_id) {
      return res.status(400).json({ msg: "license_id is required" });
    }

    try {
      await poolAdmin.query(`UPDATE licenses SET user_id = $1 WHERE id = $2`, [
        user_id || null,
        license_id,
      ]);

      res.status(200).json({ msg: "License assignment updated" });
    } catch (err) {
      console.error("Error assigning license:", err);
      res.status(500).json({ msg: "Server Error" });
    }
  }
);

// -----------------------------------------------------------------
// POST /licenses — create a new license (admin only)
// -----------------------------------------------------------------

app.post("/licenses", authenticateJWT, authorizeAdmin, async (req, res) => {
  const { license_key, company, issued_at, expires_at, status } = req.body;

  if (!license_key || !issued_at || !expires_at || !status) {
    return res.status(400).json({ msg: "Missing required fields" });
  }

  try {
    const result = await poolAdmin.query(
      `INSERT INTO licenses (license_key, company, issued_at, expires_at, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [license_key, company || null, issued_at, expires_at, status]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error creating license:", err);
    res.status(500).json({ msg: "Server Error" });
  }
});

// -----------------------------------------------------------------
// DELETE - Delete a license by ID (admin only)
// -----------------------------------------------------------------

app.delete(
  "/licenses/:id",
  authenticateJWT,
  authorizeAdmin,
  async (req, res) => {
    const { id } = req.params;

    try {
      const result = await poolAdmin.query(
        `DELETE FROM licenses WHERE id = $1 RETURNING *`,
        [id]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ msg: "License not found" });
      }

      res.status(200).json({ msg: "License deleted successfully" });
    } catch (err) {
      console.error("Error deleting license:", err);
      res.status(500).json({ msg: "Server Error" });
    }
  }
);
