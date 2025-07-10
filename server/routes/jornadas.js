import express from "express";
import { pool } from "../db/pool.js";
import { importarFixtureSudamericana } from '../services/importarSudamericana.js';
import { definirClasificadosPlayoffs } from '../services/clasificacionSudamericana.js';
import ganadoresRouter from "./ganadores.js";
import pronosticosSudamericanaRouter from "./pronosticosSudamericana.js";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";

const router = express.Router();

// 🔹 Obtener todas las jornadas de la Sudamericana (para admin panel Sudamericana)
router.get("/sudamericana", async (req, res) => {
  try {
    // Si tienes una tabla sudamericana_jornadas, usa esa. Si no, retorna un array dummy con una sola jornada para que el panel funcione.
    // Ejemplo con una sola jornada global:
    // const { rows } = await pool.query("SELECT id, numero, cerrada FROM sudamericana_jornadas ORDER BY numero ASC");
    // res.json(rows);
    res.json([{ id: 1, numero: 1, cerrada: false }]);
  } catch (err) {
    console.error("Error al obtener jornadas Sudamericana:", err);
    // Devuelve un array dummy para que el frontend no falle
    res.json([{ id: 1, numero: 1, cerrada: false }]);
  }
});

// 🔹 Obtener todas las jornadas
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, numero, ganadores, cerrada FROM jornadas ORDER BY numero ASC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error al obtener jornadas:", err);
    res.status(500).json({ error: "Error al obtener jornadas" });
  }
});

// 🔹 PATCH /api/jornadas/proxima/fecha-cierre (antes de rutas dinámicas)
router.patch("/proxima/fecha-cierre", async (req, res) => {
  const { fecha_cierre } = req.body;
  if (!fecha_cierre) {
    return res.status(400).json({ error: "Se requiere fecha_cierre" });
  }
  try {
    // Busca la próxima jornada abierta (no cerrada, menor número)
    const result = await pool.query(
      "SELECT id FROM jornadas WHERE cerrada = false ORDER BY numero ASC LIMIT 1"
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "No hay jornadas abiertas" });
    }
    const jornadaId = result.rows[0].id;
    await pool.query(
      "UPDATE jornadas SET fecha_cierre = $1 WHERE id = $2",
      [fecha_cierre, jornadaId]
    );
    res.json({ ok: true, message: "Fecha de cierre actualizada", jornadaId });
  } catch (err) {
    console.error("Error al actualizar fecha de cierre:", err);
    res.status(500).json({ error: "Error al actualizar fecha de cierre" });
  }
});

// 🔹 GET /api/jornadas/proxima-abierta (antes de rutas dinámicas)
router.get("/proxima-abierta", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, numero, fecha_cierre FROM jornadas WHERE cerrada = false ORDER BY numero ASC LIMIT 1"
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "No hay jornadas abiertas" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error al obtener próxima jornada abierta:", err);
    res.status(500).json({ error: "Error al obtener próxima jornada abierta" });
  }
});

// 🔹 Obtener una jornada específica con su estado (cerrada)
router.get("/:numero", async (req, res) => {
  const { numero } = req.params;
  try {
    const result = await pool.query(
      "SELECT id, numero, cerrada FROM jornadas WHERE numero = $1",
      [numero]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Jornada no encontrada" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error al obtener jornada:", error);
    res.status(500).json({ error: "Error al obtener jornada" });
  }
});

// 🔹 Obtener partidos de una jornada específica
router.get("/:numero/partidos", async (req, res) => {
  const { numero } = req.params;
  try {
    const result = await pool.query(
      `
      SELECT p.id, p.nombre_local AS local, p.nombre_visita AS visita,
        p.fecha, p.status, p.goles_local, p.goles_visita, p.bonus,
        j.numero AS jornada
      FROM partidos p
      JOIN jornadas j ON p.jornada_id = j.id
      WHERE j.numero = $1
      ORDER BY p.fecha;
      `,
      [numero]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error al obtener partidos de la jornada:", error);
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/jornadas/:numero/resultados → obtiene resultados reales y los guarda
router.patch("/:numero/resultados", async (req, res) => {
  const { numero } = req.params;
  try {
    // 1. Obtener partidos de esa jornada desde tu base de datos
    const partidos = await pool.query(
      `SELECT p.id
       FROM partidos p
       JOIN jornadas j ON p.jornada_id = j.id
       WHERE j.numero = $1`,
      [numero]
    );
    if (partidos.rowCount === 0) {
      return res.status(404).json({ error: "No hay partidos para esta jornada" });
    }

    let actualizados = 0;
    // 2. Por cada partido, consultar la API y actualizar
    for (const p of partidos.rows) {
      const fixtureId = p.id;
      const response = await fetch(`https://api-football-v1.p.rapidapi.com/v3/fixtures?id=${fixtureId}`, {
        headers: {
          "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
          "X-RapidAPI-Host": "api-football-v1.p.rapidapi.com"
        }
      });
      const data = await response.json();
      const fixture = data.response[0];
      if (!fixture || fixture.goals.home === null || fixture.goals.away === null) continue;
      // 3. Actualizar en base de datos
      await pool.query(
        `UPDATE partidos
         SET goles_local = $1, goles_visita = $2, status = $3
         WHERE id = $4`,
        [fixture.goals.home, fixture.goals.away, fixture.fixture.status.short, fixtureId]
      );
      actualizados++;
    }
    res.json({
      mensaje: "Resultados actualizados desde API",
      actualizados,
      total: partidos.rowCount
    });
  } catch (err) {
    console.error("Error al actualizar resultados:", err);
    res.status(500).json({ error: "No se pudieron actualizar los resultados" });
  }
});

// PATCH /api/jornadas/:numero/partidos
router.patch("/:numero/partidos", async (req, res) => {
  const { numero } = req.params;
  const { partidos } = req.body;
  if (!Array.isArray(partidos) || partidos.length === 0) {
    return res.status(400).json({ error: "No se recibieron partidos para actualizar" });
  }
  let actualizados = 0;
  try {
    for (const partido of partidos) {
      // Actualizar goles y bonus
      await pool.query(
        `UPDATE partidos
         SET goles_local = $1, goles_visita = $2, bonus = $3
         WHERE id = $4`,
        [
          partido.golesLocal !== "" ? partido.golesLocal : null,
          partido.golesVisita !== "" ? partido.golesVisita : null,
          partido.bonus ?? 1,
          partido.id
        ]
      );
      actualizados++;
    }
    res.json({ mensaje: "Resultados y bonus guardados en la base de datos", actualizados });
  } catch (error) {
    console.error("Error al actualizar partidos:", error);
    res.status(500).json({ error: "Error al actualizar partidos" });
  }
});

// PATCH /api/jornadas/:id/cerrar → cambia el estado 'cerrada'
router.patch("/:id/cerrar", async (req, res) => {
  const { id } = req.params;
  const { cerrada } = req.body; // true o false
  try {
    const result = await pool.query(
      "UPDATE jornadas SET cerrada = $1 WHERE id = $2 RETURNING id, numero, cerrada",
      [cerrada, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Jornada no encontrada" });
    }
    res.json({ mensaje: `Jornada actualizada`, jornada: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "No se pudo actualizar el estado de la jornada" });
  }
});

// PATCH /api/jornadas/:numero/ganadores
router.patch("/:numero/ganadores", async (req, res) => {
  const { numero } = req.params;
  try {
    // 1. Verifica si todos los resultados están cargados
    const incompletos = await pool.query(`
      SELECT COUNT(*) AS faltantes
      FROM partidos p
      JOIN jornadas j ON p.jornada_id = j.id
      WHERE j.numero = $1
      AND (p.goles_local IS NULL OR p.goles_visita IS NULL)
    `, [numero]);
    if (parseInt(incompletos.rows[0].faltantes) > 0) {
      return res.status(400).json({ error: "La jornada aún tiene partidos sin resultado" });
    }

    // 2. Calcula y guarda ganadores
    await pool.query(`
      WITH ranking AS (
        SELECT u.id, u.nombre, SUM(p.puntos) AS puntos
        FROM pronosticos p
        JOIN usuarios u ON p.usuario_id = u.id
        JOIN partidos pa ON p.partido_id = pa.id
        JOIN jornadas j ON pa.jornada_id = j.id
        WHERE j.numero = $1
        GROUP BY u.id
      ),
      ganadores AS (
        SELECT array_agg(nombre) AS nombres
        FROM ranking
        WHERE puntos = (SELECT MAX(puntos) FROM ranking)
      )
      UPDATE jornadas
      SET ganadores = (SELECT nombres FROM ganadores)
      WHERE numero = $1
    `, [numero]);

    // 3. Guardar en ganadores_jornada
    // Obtener id de la jornada
    const jornadaRes = await pool.query(
      "SELECT id FROM jornadas WHERE numero = $1",
      [numero]
    );
    const jornadaId = jornadaRes.rows[0]?.id;
    console.log('JORNADA PATCH GANADORES:', { numero, jornadaId });
    if (!jornadaId) {
      return res.status(404).json({ error: "Jornada no encontrada para guardar ganadores" });
    }

    // Obtener los ids de los ganadores
    const ganadoresIdsRes = await pool.query(`
      WITH ranking AS (
        SELECT u.id, SUM(p.puntos) AS puntos
        FROM pronosticos p
        JOIN usuarios u ON p.usuario_id = u.id
        JOIN partidos pa ON p.partido_id = pa.id
        JOIN jornadas j ON pa.jornada_id = j.id
        WHERE j.numero = $1
        GROUP BY u.id
      )
      SELECT id FROM ranking WHERE puntos = (SELECT MAX(puntos) FROM ranking)
    `, [numero]);
    const ganadoresIds = ganadoresIdsRes.rows.map(r => r.id);
    console.log('GANADORES PATCH GANADORES:', ganadoresIds);

    // Insertar los nuevos ganadores acumulando títulos (sin eliminar los anteriores)
    for (const jugadorId of ganadoresIds) {
      console.log('INSERTANDO GANADOR:', { jornadaId, jugadorId });
      await pool.query(
        `INSERT INTO ganadores_jornada (jornada_id, jugador_id, acierto)
         VALUES ($1, $2, true)
         ON CONFLICT (jornada_id, jugador_id) DO NOTHING`,
        [jornadaId, jugadorId]
      );
    }

    res.json({ ok: true, message: "Ganadores guardados para la jornada" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error calculando ganadores" });
  }
});

// === SUDAMERICANA: Gestión de usuarios activos ===
// GET /api/sudamericana/usuarios - Listar todos los usuarios y su estado en Sudamericana
router.get('/sudamericana/usuarios', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, nombre, email, activo_sudamericana
      FROM usuarios
      ORDER BY nombre ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener usuarios Sudamericana' });
  }
});

// PATCH /api/sudamericana/usuarios/:id - Activar/desactivar usuario para Sudamericana
router.patch('/sudamericana/usuarios/:id', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const { id } = req.params;
  const { activo } = req.body;
  try {
    await pool.query(`
      UPDATE usuarios SET activo_sudamericana = $2 WHERE id = $1
    `, [id, !!activo]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar usuario Sudamericana' });
  }
});

// 🔹 ENDPOINTS SUDAMERICANA (SOLO ADMIN, NO USUARIOS NORMALES)
// Los siguientes endpoints solo deben ser accesibles por administradores. Se protege con verifyToken y authorizeRoles('admin').

// POST /api/sudamericana/importar-fixture (solo admin)
router.post('/sudamericana/importar-fixture', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const result = await importarFixtureSudamericana();
  if (result.ok) {
    res.json({ ok: true, total: result.total, insertados: result.insertados, detalles: result.detalles });
  } else {
    res.status(500).json({ ok: false, error: result.error });
  }
});

// GET /api/sudamericana/fixture/:ronda - Obtener partidos de una ronda específica
router.get('/sudamericana/fixture/:ronda', async (req, res) => {
  try {
    const { ronda } = req.params;
    console.log('--- DEBUG SUDAMERICANA FIXTURE ---');
    console.log('Ronda recibida:', ronda);
    const result = await pool.query(
      'SELECT fixture_id, fecha, equipo_local, equipo_visita, goles_local, goles_visita, penales_local, penales_visita, ronda, clasificado, bonus FROM sudamericana_fixtures WHERE ronda = $1 ORDER BY clasificado ASC, fecha ASC, fixture_id ASC',
      [ronda]
    );
    console.log('Cantidad de partidos encontrados:', result.rows.length);
    if (result.rows.length === 0) {
      console.log('No se encontraron partidos para la ronda:', ronda);
    } else {
      console.log('Primer partido:', result.rows[0]);
    }
    // Siempre devolver un array, aunque esté vacío
    res.json(Array.isArray(result.rows) ? result.rows : []);
  } catch (err) {
    console.error('Error al obtener el fixture de la ronda seleccionada:', err);
    res.status(500).json({ error: 'Error al obtener el fixture de la ronda seleccionada.' });
  }
});

// PATCH /api/sudamericana/fixture/:ronda - Actualizar goles/bonus/penales de los partidos de una ronda
router.patch('/sudamericana/fixture/:ronda', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const { ronda } = req.params;
  const { partidos } = req.body;
  if (!Array.isArray(partidos) || partidos.length === 0) {
    return res.status(400).json({ error: 'No se recibieron partidos para actualizar' });
  }
  let actualizados = 0;
  try {
    for (const partido of partidos) {
      await pool.query(
        `UPDATE sudamericana_fixtures
         SET goles_local = $1, goles_visita = $2, bonus = $3, penales_local = $4, penales_visita = $5
         WHERE fixture_id = $6 AND ronda = $7`,
        [
          partido.golesLocal !== '' ? partido.golesLocal : null,
          partido.golesVisita !== '' ? partido.golesVisita : null,
          partido.bonus ?? 1,
          partido.penalesLocal !== undefined && partido.penalesLocal !== '' ? partido.penalesLocal : null,
          partido.penalesVisita !== undefined && partido.penalesVisita !== '' ? partido.penalesVisita : null,
          partido.id,
          ronda
        ]
      );
      actualizados++;
    }
    res.json({ mensaje: 'Resultados, bonus y penales guardados en la base de datos', actualizados });
  } catch (error) {
    console.error('Error al actualizar partidos Sudamericana:', error);
    res.status(500).json({ error: 'Error al actualizar partidos Sudamericana' });
  }
});

// GET /api/sudamericana/fixture (puede ser público, acepta ?ronda=...)
router.get('/sudamericana/fixture', async (req, res) => {
  try {
    const { ronda } = req.query;
    let result;
    if (ronda) {
      result = await pool.query(
        'SELECT fixture_id, fecha, equipo_local, equipo_visita, goles_local, goles_visita, penales_local, penales_visita, ronda, clasificado FROM sudamericana_fixtures WHERE ronda = $1 ORDER BY clasificado ASC, fecha ASC, fixture_id ASC',
        [ronda]
      );
    } else {
      result = await pool.query('SELECT fixture_id, fecha, equipo_local, equipo_visita, goles_local, goles_visita, penales_local, penales_visita, ronda, clasificado FROM sudamericana_fixtures ORDER BY clasificado ASC, fecha ASC, fixture_id ASC');
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener el fixture de la Copa Sudamericana. Por favor, revisa la base de datos o la lógica de avance de cruces.' });
  }
});

// POST /api/sudamericana/actualizar-clasificados (solo admin)
router.post('/sudamericana/actualizar-clasificados', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    await definirClasificadosPlayoffs();
    res.json({ ok: true, message: 'Clasificados actualizados y cruces avanzados.' });
  } catch (error) {
    console.error('Error al actualizar clasificados:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// 🔹 Obtener todas las rondas únicas de la Sudamericana (para el selector)
router.get('/sudamericana/rondas', async (req, res) => {
  try {
    const result = await pool.query('SELECT DISTINCT ronda FROM sudamericana_fixtures ORDER BY ronda ASC');
    res.json(result.rows.map(r => r.ronda));
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener las rondas de la Sudamericana' });
  }
});

// Endpoint para avanzar ganadores de Sudamericana (fixture de eliminación directa) SOLO ADMIN
router.post('/sudamericana/avanzar-ganadores', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { avanzarGanadoresSudamericana } = await import('../services/clasificacionSudamericana.js');
    await avanzarGanadoresSudamericana();
    res.json({ ok: true, message: 'Ganadores avanzados correctamente en el fixture.' });
  } catch (error) {
    console.error('Error al avanzar ganadores:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Endpoint para obtener el estado de edicion de Sudamericana
router.get('/sudamericana/config', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT edicion_cerrada FROM sudamericana_config LIMIT 1');
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener la configuración' });
  }
});

// MOVER ESTOS AL FINAL DEL ARCHIVO PARA NO ROMPER LAS RUTAS ESPECÍFICAS
router.use("/ganadores", ganadoresRouter);
router.use("/sudamericana", pronosticosSudamericanaRouter);

// Alias directo para compatibilidad con frontend antiguo o rutas directas
router.get('/fixture/:ronda', async (req, res, next) => {
  // Si la ruta ya fue respondida por /sudamericana/fixture/:ronda, no hacer nada
  // Si no, replicar la lógica
  try {
    const { ronda } = req.params;
    console.log('--- ALIAS /api/sudamericana/fixture/:ronda ---');
    console.log('Ronda recibida (alias):', ronda);
    const result = await pool.query(
      'SELECT fixture_id, fecha, equipo_local, equipo_visita, goles_local, goles_visita, penales_local, penales_visita, ronda, clasificado, bonus FROM sudamericana_fixtures WHERE ronda = $1 ORDER BY clasificado ASC, fecha ASC, fixture_id ASC',
      [ronda]
    );
    res.json(Array.isArray(result.rows) ? result.rows : []);
  } catch (err) {
    console.error('Error en alias /api/sudamericana/fixture/:ronda:', err);
    res.status(500).json({ error: 'Error al obtener el fixture de la ronda seleccionada (alias).' });
  }
});

export default router;
