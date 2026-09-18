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
    RETURNING usuario_id, partido_id
  `, [jornadaId]);

  // En J8, J9 y J10 (eliminación directa), si alguno de los pronósticos que
  // se acaban de rellenar al azar deja un cruce con el marcador global
  // empatado, hay que sortear también los penales de esa vuelta — si no,
  // ese cruce queda "sin definir" para siempre en la tabla de Equipos
  // Clasificados, porque el relleno al azar nunca contempló el empate.
  //
  // Solo se tocan las filas insertadas en ESTE llamado (las que vienen en
  // result.rows): un pronóstico que un usuario cargó de verdad y dejó sin
  // penales es una decisión del admin (¿se le permite completarlo después o
  // se deja "sin definir"?), no algo para autocompletar en silencio.
  if (result.rows.length > 0) {
    await completarPenalesAzarLibertadores(jornadaId, result.rows);
  }

  return result.rowCount;
}

async function completarPenalesAzarLibertadores(jornadaId, filasInsertadas) {
  const jornadaResult = await pool.query(
    'SELECT numero FROM libertadores_jornadas WHERE id = $1',
    [jornadaId]
  );
  const numero = jornadaResult.rows[0]?.numero;
  if (![8, 9, 10].includes(numero)) return;

  const insertadas = new Set(filasInsertadas.map(f => `${f.usuario_id}:${f.partido_id}`));

  const partidosResult = await pool.query(
    `SELECT id, nombre_local, nombre_visita, tipo_partido
     FROM libertadores_partidos
     WHERE jornada_id = $1`,
    [jornadaId]
  );

  for (const partido of partidosResult.rows) {
    if (partido.tipo_partido === 'FINAL') continue; // partido único, sin ida/vuelta

    // Ida del cruce: para J8, el resultado REAL de la ida (J7) -- misma
    // base que usa calcularPuntosLibertadores.js y el recuadro de penales
    // al cargar el pronóstico. Para J9/J10, el partido complementario de
    // la MISMA jornada (con menor id); si este "partido" tiene el id
    // mayor del cruce, es la vuelta y se procesa; si tiene el menor, es la
    // ida y se salta (se procesa desde la vuelta).
    let idaGlobalLocalPorUsuario = null; // función (usuario_id) => {local, visita} | null
    if (numero === 8) {
      const idaResult = await pool.query(
        `SELECT p.goles_local, p.goles_visita
         FROM libertadores_partidos p
         INNER JOIN libertadores_jornadas lj ON p.jornada_id = lj.id
         WHERE lj.numero = 7
           AND p.nombre_local = $1
           AND p.nombre_visita = $2`,
        [partido.nombre_visita, partido.nombre_local]
      );
      if (idaResult.rows.length === 0) continue;
      const ida = idaResult.rows[0];
      if (ida.goles_local === null || ida.goles_visita === null) continue; // ida real aún no jugada
      idaGlobalLocalPorUsuario = () => ({ local: ida.goles_local, visita: ida.goles_visita });
    } else {
      const idaPartidoResult = await pool.query(
        `SELECT id FROM libertadores_partidos
         WHERE jornada_id = $1 AND nombre_local = $2 AND nombre_visita = $3`,
        [jornadaId, partido.nombre_visita, partido.nombre_local]
      );
      if (idaPartidoResult.rows.length === 0) continue;
      const idaPartidoId = idaPartidoResult.rows[0].id;
      if (idaPartidoId > partido.id) continue; // este partido es la ida, no la vuelta

      const idaPronPorUsuario = {};
      const idaPronResult = await pool.query(
        `SELECT usuario_id, goles_local, goles_visita FROM libertadores_pronosticos
         WHERE partido_id = $1`,
        [idaPartidoId]
      );
      idaPronResult.rows.forEach(r => {
        idaPronPorUsuario[r.usuario_id] = { local: r.goles_local, visita: r.goles_visita };
      });
      idaGlobalLocalPorUsuario = (usuarioId) => idaPronPorUsuario[usuarioId] || null;
    }

    const vueltaPronResult = await pool.query(
      `SELECT id, usuario_id, goles_local, goles_visita, penales_local, penales_visita
       FROM libertadores_pronosticos
       WHERE partido_id = $1`,
      [partido.id]
    );

    for (const vuelta of vueltaPronResult.rows) {
      if (!insertadas.has(`${vuelta.usuario_id}:${partido.id}`)) continue; // no es una fila recién rellenada al azar
      if (vuelta.penales_local !== null && vuelta.penales_visita !== null) continue; // ya tiene penales
      if (vuelta.goles_local === null || vuelta.goles_visita === null) continue;

      const ida = idaGlobalLocalPorUsuario(vuelta.usuario_id);
      if (!ida || ida.local === null || ida.visita === null) continue;

      // Equipo LOCAL de la vuelta: sus goles de vuelta + los suyos en la
      // ida (ahí jugó de visita, entonces son los "goles_visita" de la ida).
      const globalLocal = vuelta.goles_local + ida.visita;
      const globalVisita = vuelta.goles_visita + ida.local;
      if (globalLocal !== globalVisita) continue; // no hay empate

      let penalesLocal = Math.floor(Math.random() * 5);
      let penalesVisita = Math.floor(Math.random() * 5);
      while (penalesVisita === penalesLocal) {
        penalesVisita = Math.floor(Math.random() * 5);
      }

      await pool.query(
        'UPDATE libertadores_pronosticos SET penales_local = $1, penales_visita = $2 WHERE id = $3',
        [penalesLocal, penalesVisita, vuelta.id]
      );
    }
  }
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
