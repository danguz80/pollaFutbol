import express from "express";
import { pool } from "../db/pool.js";

const router = express.Router();

const API_BASE_URL = import.meta.env.VITE_RENDER_BACKEND_URL || "http://localhost:3001";

// 🔹 Obtener todas las jornadas
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, numero, ganadores FROM jornadas ORDER BY numero ASC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error al obtener jornadas:", err);
    res.status(500).json({ error: "Error al obtener jornadas" });
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

    res.json({ ok: true, message: "Ganadores guardados para la jornada" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error calculando ganadores" });
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


export default router;
