import { pool } from "../db/pool.js";

export async function getJornadasActivas() {
  const now = new Date().toISOString();

  const res = await pool.query(`
    SELECT DISTINCT j.numero
    FROM partidos p
    JOIN jornadas j ON p.jornada_id = j.id
    WHERE p.fecha <= $1 AND p.status != 'FT'
  `, [now]);

  return res.rows.map(r => r.numero);
}
