import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

export const poolUser = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_USER_PASS,
  database: process.env.DB_NAME,
});

/// USE when you want to connect to the database
/// if your app growing and you want modularize your code
