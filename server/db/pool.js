import pkg from "pg";
const { Pool } = pkg;

// Si usas variables de entorno, así:
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

export { pool };
