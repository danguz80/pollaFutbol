import pkg from "pg";
const { Pool } = pkg;
import dotenv from "dotenv";
dotenv.config();

const url = new URL(process.env.DATABASE_URL);

const pool = new Pool({
  user: url.username,
  password: url.password,
  host: url.hostname,
  port: url.port || 5432,
  database: url.pathname.replace(/^\//, ""),
  ssl: process.env.USE_SSL === "true" ? { rejectUnauthorized: false } : undefined
});

export { pool };
