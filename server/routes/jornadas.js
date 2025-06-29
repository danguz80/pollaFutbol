import express from "express";
import { pool } from "../db/pool.js";
import { importarFixtureSudamericana } from '../services/importarSudamericana.js';
import { definirClasificadosPlayoffs } from '../services/clasificacionSudamericana.js';
import ganadoresRouter from "./ganadores.js";

const router = express.Router();

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

// POST /api/sudamericana/importar-fixture
router.post('/sudamericana/importar-fixture', async (req, res) => {
  const result = await importarFixtureSudamericana();
  if (result.ok) {
    res.json({ ok: true, total: result.total, insertados: result.insertados, detalles: result.detalles });
  } else {
    res.status(500).json({ ok: false, error: result.error });
  }
});

// GET /api/sudamericana/fixture
router.get('/sudamericana/fixture', async (req, res) => {
  try {
    const result = await pool.query('SELECT fixture_id, fecha, equipo_local, equipo_visita, goles_local, goles_visita, penales_local, penales_visita, ronda, clasificado FROM sudamericana_fixtures ORDER BY clasificado ASC, fecha ASC, fixture_id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener el fixture' });
  }
});

// Endpoint para actualizar clasificados de Playoffs y avanzar cruces
router.post('/sudamericana/actualizar-clasificados', async (req, res) => {
  try {
    await definirClasificadosPlayoffs();
    res.json({ ok: true, message: 'Clasificados actualizados y cruces avanzados.' });
  } catch (error) {
    console.error('Error al actualizar clasificados:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Guardar pronósticos y penales para Sudamericana
router.post('/sudamericana/guardar-pronosticos', async (req, res) => {
  const { pronosticos, penales } = req.body;
  try {
    // Guardar goles
    for (const fixtureId in pronosticos) {
      const goles = pronosticos[fixtureId];
      await pool.query(
        `UPDATE sudamericana_fixtures SET goles_local = $1, goles_visita = $2 WHERE fixture_id = $3`,
        [goles.local ?? null, goles.visita ?? null, fixtureId]
      );
    }
    // Guardar penales
    for (const sigla in penales) {
      const p = penales[sigla];
      // Buscar los dos partidos de ese cruce
      const { rows: partidos } = await pool.query(
        `SELECT fixture_id, equipo_local, equipo_visita FROM sudamericana_fixtures WHERE clasificado = $1`,
        [sigla]
      );
      for (const partido of partidos) {
        await pool.query(
          `UPDATE sudamericana_fixtures SET penales_local = $1, penales_visita = $2 WHERE fixture_id = $3`,
          [p[partido.equipo_local] ?? null, p[partido.equipo_visita] ?? null, partido.fixture_id]
        );
      }
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Error al guardar pronósticos:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// PATCH para actualizar ganadores de la jornada seleccionada
const actualizarGanadores = async () => {
  if (!jornadaSeleccionada) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/jornadas/${jornadaSeleccionada}/ganadores`, {
      method: "PATCH"
    });
    const data = await res.json();
    if (res.ok) {
      alert("✅ Ganadores recalculados y guardados correctamente");
    } else {
      alert(data.error || "❌ Error al actualizar ganadores");
    }
  } catch (error) {
    alert("❌ Error de conexión al actualizar ganadores");
    console.error(error);
  }
};

router.use("/ganadores", ganadoresRouter);

export default router;
