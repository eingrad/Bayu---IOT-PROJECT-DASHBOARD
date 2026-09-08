require("dotenv").config();
const express = require("express");
const bcrypt = require("bcrypt");
const router = express.Router();
const { Pool } = require("pg");
const { generateToken } = require("../utils/jwt");

// Auth needs to read + insert into the RLS-protected `users` table, which the
// app_user role is not allowed to do. Use the admin role for register/login.
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_ADMIN_USER,
  password: process.env.DB_ADMIN_PASS,
});

// 🟢 REGISTER
router.post("/register", async (req, res) => {
  const { username, password, device_id } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10); // bcrypt hashing

    const result = await pool.query(
      `INSERT INTO users (username, password_hash)
       VALUES ($1, $2)
       RETURNING id, username`,
      [username, hashedPassword]
    );

    const user = result.rows[0];

    await pool.query(
      `INSERT INTO devices (device_id, user_id)
       VALUES ($1, $2)`,
      [device_id, user.id]
    );

    const token = generateToken(user);
    res.json({ token });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({ msg: "Registration failed" });
  }
});

// 🔐 LOGIN
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query(
      `SELECT id, username, password_hash FROM users WHERE username = $1`,
      [username]
    );

    if (!result.rows.length) {
      console.log("❌ No user found for:", username);
      return res.status(401).json({ msg: "Invalid username or password" });
    }

    const user = result.rows[0];
    console.log("🟢 DB hash:", user.password_hash); // ✅ Add this
    console.log("🔒 Input password:", password);

    const isMatch = await bcrypt.compare(password, user.password_hash);
    console.log("✅ Password match:", isMatch);

    if (!isMatch) {
      return res.status(401).json({ msg: "Invalid username or password" });
    }

    const token = generateToken(user);
    res.json({ token });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ msg: "Login failed" });
  }
});

module.exports = router;
