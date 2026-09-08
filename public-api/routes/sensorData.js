const express = require("express");
const router = express.Router();
const jwtAuth = require("../middleware/jwtAuth");

router.use(jwtAuth);

// 📦 All parameters — latest reading from every source in one call
// GET /api/sensor-data/all
router.get("/all", async (req, res) => {
  const owned = `device_id IN (
    SELECT id FROM devices
    WHERE user_id = current_setting('app.current_user_id')::uuid
  )`;
  try {
    const particle = await req.db.query(
      `SELECT * FROM particle_data WHERE ${owned} ORDER BY measured_at DESC LIMIT 1`
    );
    const wind = await req.db.query(
      `SELECT * FROM wind_data WHERE ${owned} ORDER BY measured_at DESC LIMIT 1`
    );
    const gas = await req.db.query(
      `SELECT * FROM gas_data WHERE ${owned} ORDER BY measured_at DESC LIMIT 1`
    );
    res.json({
      particle: particle.rows[0] || null,
      wind: wind.rows[0] || null,
      gas: gas.rows[0] || null,
    });
  } catch (err) {
    console.error("❌ Combined data error:", err);
    res.status(500).json({ msg: "Failed to fetch sensor data" });
  }
});

// 🌫️ Particle Data (RLS enforced)

// GET /api/sensor-data
router.get("/", async (req, res) => {
  try {
    const result = await req.db.query(
      `SELECT * FROM particle_data
       WHERE device_id IN (
         SELECT id FROM devices
         WHERE user_id = current_setting('app.current_user_id')::uuid
       )
       ORDER BY measured_at DESC
       LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Particle data fetch error:", err);
    res.status(500).json({ msg: "Failed to fetch particle data" });
  }
});

// GET /api/sensor-data/recent/:n
router.get("/recent/:n", async (req, res) => {
  const n = parseInt(req.params.n, 10);
  if (isNaN(n) || n <= 0) {
    return res.status(400).json({ msg: "Invalid number of records requested" });
  }

  try {
    const result = await req.db.query(
      `SELECT * FROM particle_data
       WHERE device_id IN (
         SELECT id FROM devices
         WHERE user_id = current_setting('app.current_user_id')::uuid
       )
       ORDER BY measured_at DESC
       LIMIT $1`,
      [n]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Particle data recent error:", err);
    res.status(500).json({ msg: "Failed to fetch particle data" });
  }
});

// 💨 Wind Data (also with RLS)

// GET /api/sensor-data/wind
router.get("/wind", async (req, res) => {
  try {
    const result = await req.db.query(
      `SELECT * FROM wind_data
       WHERE device_id IN (
         SELECT id FROM devices
         WHERE user_id = current_setting('app.current_user_id')::uuid
       )
       ORDER BY measured_at DESC
       LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Wind data fetch error:", err);
    res.status(500).json({ msg: "Failed to fetch wind data" });
  }
});

// GET /api/sensor-data/wind/recent/:n
router.get("/wind/recent/:n", async (req, res) => {
  const n = parseInt(req.params.n, 10);
  if (isNaN(n) || n <= 0) {
    return res.status(400).json({ msg: "Invalid number of records requested" });
  }

  try {
    const result = await req.db.query(
      `SELECT * FROM wind_data
       WHERE device_id IN (
         SELECT id FROM devices
         WHERE user_id = current_setting('app.current_user_id')::uuid
       )
       ORDER BY measured_at DESC
       LIMIT $1`,
      [n]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Wind data recent error:", err);
    res.status(500).json({ msg: "Failed to fetch wind data" });
  }
});

// 🧪 Gas Data (CO, SO2, O3, NO2) — with RLS

// GET /api/sensor-data/gas
router.get("/gas", async (req, res) => {
  try {
    const result = await req.db.query(
      `SELECT * FROM gas_data
       WHERE device_id IN (
         SELECT id FROM devices
         WHERE user_id = current_setting('app.current_user_id')::uuid
       )
       ORDER BY measured_at DESC
       LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Gas data fetch error:", err);
    res.status(500).json({ msg: "Failed to fetch gas data" });
  }
});

// GET /api/sensor-data/gas/recent/:n
router.get("/gas/recent/:n", async (req, res) => {
  const n = parseInt(req.params.n, 10);
  if (isNaN(n) || n <= 0) {
    return res.status(400).json({ msg: "Invalid number of records requested" });
  }

  try {
    const result = await req.db.query(
      `SELECT * FROM gas_data
       WHERE device_id IN (
         SELECT id FROM devices
         WHERE user_id = current_setting('app.current_user_id')::uuid
       )
       ORDER BY measured_at DESC
       LIMIT $1`,
      [n]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Gas data recent error:", err);
    res.status(500).json({ msg: "Failed to fetch gas data" });
  }
});

module.exports = router;
