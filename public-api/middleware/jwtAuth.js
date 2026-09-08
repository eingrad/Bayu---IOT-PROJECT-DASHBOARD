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
    console.log("🔐 Authorization Header:", req.headers.authorization);
    console.log("🔐 Token Extracted:", token);
    console.log("✅ JWT Verified:", decoded);
    req.user = decoded;

    const client = await pool.connect();
    await client.query(`SET app.current_user_id = '${decoded.id}'`);
    console.log("🔗 DB connection established for user:", decoded.id);
    req.db = client;

    res.on("finish", () => client.release());
    next();
  } catch (err) {
    console.error("❌ JWT error:", err.message);
    res.status(401).json({ msg: "Invalid or expired token" });
  }
};
