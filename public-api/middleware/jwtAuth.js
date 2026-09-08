const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

module.exports = async function (req, res, next) {
  const token = (req.headers.authorization || "").split(" ")[1];
  if (!token) return res.status(401).json({ msg: "Token required" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    const client = await pool.connect();
    // set_config() is the parameterised form of SET — the row-level security
    // policies read this, so it must not be built by string interpolation.
    await client.query("SELECT set_config('app.current_user_id', $1, false)", [
      String(decoded.id),
    ]);
    req.db = client;

    res.on("finish", () => client.release());
    next();
  } catch (err) {
    console.error("❌ JWT error:", err.message);
    res.status(401).json({ msg: "Invalid or expired token" });
  }
};
