/**
 * Inserta pronósticos con marcador aleatorio (0-3 cada equipo, sin 3-3)
 * para usuarios activos que no ingresaron pronósticos al cerrarse una jornada.
 * Aplica a todas las competencias.
 */

import { pool } from '../db/pool.js';

/**
 * Torneo Nacional: inserta pronósticos aleatorios faltantes para usuarios activos.
 * @param {number} jornadaId - ID de la jornada cerrada
 * @returns {number} cantidad de filas insertadas
 */
export async function insertarPronosticosAusentesNacional(jornadaId) {
  const result = await pool.query(`
    WITH candidatos AS (
      SELECT
        u.id AS usuario_id,
        p.id AS partido_id,
        p.jornada_id,
        floor(random() * 4)::int AS gl,
        floor(random() * 4)::int AS gv
      FROM usuarios u
      CROSS JOIN partidos p
      WHERE u.activo_torneo_nacional = true
        AND u.rol != 'admin'
        AND p.jornada_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM pronosticos pr
          WHERE pr.usuario_id = u.id
            AND pr.partido_id = p.id
            AND pr.jornada_id = p.jornada_id
        )
    )
    INSERT INTO pronosticos (usuario_id, jornada_id, partido_id, goles_local, goles_visita)
    SELECT
      usuario_id, jornada_id, partido_id,
      gl,
      CASE WHEN gl = 3 AND gv = 3 THEN floor(random() * 3)::int ELSE gv END
    FROM candidatos
  `, [jornadaId]);
  return result.rowCount;
}

/**
 * Copa Libertadores: inserta pronósticos aleatorios faltantes para usuarios activos.
 * @param {number} jornadaId - ID de la jornada cerrada (libertadores_jornadas.id)
 * @returns {number} cantidad de filas insertadas
 */
export async function insertarPronosticosAusentesLibertadores(jornadaId) {
  const result = await pool.query(`
    WITH candidatos AS (
      SELECT
        u.id AS usuario_id,
        p.id AS partido_id,
        p.jornada_id,
        floor(random() * 4)::int AS gl,
        floor(random() * 4)::int AS gv
      FROM usuarios u
      CROSS JOIN libertadores_partidos p
      WHERE u.activo_libertadores = true
        AND u.rol != 'admin'
        AND p.jornada_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM libertadores_pronosticos lp
          WHERE lp.usuario_id = u.id
            AND lp.partido_id = p.id
            AND lp.jornada_id = p.jornada_id
        )
    )
    INSERT INTO libertadores_pronosticos (usuario_id, partido_id, jornada_id, goles_local, goles_visita, puntos)
    SELECT
      usuario_id, partido_id, jornada_id,
      gl,
      CASE WHEN gl = 3 AND gv = 3 THEN floor(random() * 3)::int ELSE gv END,
      0
    FROM candidatos
  `, [jornadaId]);
  return result.rowCount;
}

/**
 * Copa Sudamericana: inserta pronósticos aleatorios faltantes para usuarios activos.
 * Nota: sudamericana_pronosticos no almacena jornada_id; la jornada se obtiene
 * a través de sudamericana_partidos.jornada_id.
 * @param {number} jornadaId - ID de la jornada cerrada (sudamericana_jornadas.id)
 * @returns {number} cantidad de filas insertadas
 */
export async function insertarPronosticosAusentesSudamericana(jornadaId) {
  const result = await pool.query(`
    WITH candidatos AS (
      SELECT
        u.id AS usuario_id,
        p.id AS partido_id,
        floor(random() * 4)::int AS gl,
        floor(random() * 4)::int AS gv
      FROM usuarios u
      CROSS JOIN sudamericana_partidos p
      WHERE u.activo_sudamericana = true
        AND u.rol != 'admin'
        AND p.jornada_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM sudamericana_pronosticos sp
          WHERE sp.usuario_id = u.id
            AND sp.partido_id = p.id
        )
    )
    INSERT INTO sudamericana_pronosticos (usuario_id, partido_id, goles_local, goles_visita, puntos)
    SELECT
      usuario_id, partido_id,
      gl,
      CASE WHEN gl = 3 AND gv = 3 THEN floor(random() * 3)::int ELSE gv END,
      0
    FROM candidatos
  `, [jornadaId]);
  return result.rowCount;
}

/**
 * Mundial: inserta pronósticos aleatorios faltantes para usuarios activos.
 * @param {number} jornadaId - ID de la jornada cerrada (mundial_jornadas.id)
 * @returns {number} cantidad de filas insertadas
 */
export async function insertarPronosticosAusentesMundial(jornadaId) {
  const result = await pool.query(`
    WITH candidatos AS (
      SELECT
        u.id AS usuario_id,
        p.id AS partido_id,
        p.jornada_id,
        floor(random() * 4)::int AS gl,
        floor(random() * 4)::int AS gv
      FROM usuarios u
      CROSS JOIN mundial_partidos p
      WHERE u.activo_mundial = true
        AND u.rol != 'admin'
        AND p.jornada_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM mundial_pronosticos mp
          WHERE mp.usuario_id = u.id
            AND mp.partido_id = p.id
        )
    )
    INSERT INTO mundial_pronosticos (usuario_id, jornada_id, partido_id, resultado_local, resultado_visitante, puntos)
    SELECT
      usuario_id, jornada_id, partido_id,
      gl,
      CASE WHEN gl = 3 AND gv = 3 THEN floor(random() * 3)::int ELSE gv END,
      0
    FROM candidatos
  `, [jornadaId]);
  return result.rowCount;
}
