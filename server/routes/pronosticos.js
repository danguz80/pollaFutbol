// routes/pronosticos.js
import express from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { pool } from "../db/pool.js";
import fetch from "node-fetch";
import { generarPdfTestigoBuffer } from '../utils/pdfTestigo.js';

const router = express.Router();

// GUARDAR O ACTUALIZAR PRONÓSTICO (UPSERT) — bloquea si la jornada está cerrada
router.post("/", verifyToken, async (req, res) => {
  const usuarioId = req.usuario.id;
  const { jornada_id, partido_id, goles_local, goles_visita } = req.body;

  try {
    // 1. Verificar si el usuario está activo en Torneo Nacional
    const usuarioCheck = await pool.query(
      "SELECT activo_torneo_nacional FROM usuarios WHERE id = $1",
      [usuarioId]
    );
    // Solo permitir si está explícitamente en true
    if (usuarioCheck.rowCount === 0 || usuarioCheck.rows[0].activo_torneo_nacional !== true) {
      return res.status(403).json({ error: "No tienes acceso para ingresar pronósticos en el Torneo Nacional" });
    }

    // 2. Verificar si la jornada está cerrada
    const jornadaCheck = await pool.query(
      "SELECT cerrada FROM jornadas WHERE id = $1",
      [jornada_id]
    );
    if (jornadaCheck.rowCount === 0) {
      return res.status(404).json({ error: "Jornada no encontrada" });
    }
    if (jornadaCheck.rows[0].cerrada) {
      return res.status(403).json({ error: "Esta jornada está cerrada. No se pueden modificar los pronósticos." });
    }

    // 3. Guardar o actualizar el pronóstico
    const result = await pool.query(
      `
      INSERT INTO pronosticos (usuario_id, jornada_id, partido_id, goles_local, goles_visita)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (usuario_id, jornada_id, partido_id)
      DO UPDATE SET goles_local = EXCLUDED.goles_local, goles_visita = EXCLUDED.goles_visita
      RETURNING id
      `,
      [usuarioId, jornada_id, partido_id, goles_local, goles_visita]
    );

    res.status(201).json({
      mensaje: "Pronóstico guardado/actualizado correctamente",
      id: result.rows[0].id,
    });
  } catch (error) {
    console.error("Error al guardar/actualizar pronóstico:", error);
    res.status(500).json({ error: "No se pudo guardar/actualizar el pronóstico" });
  }
});

// CALCULAR PUNTAJES con BONUS y generar PDF con resultados
router.post("/calcular/:jornada", async (req, res) => {
  const { jornada } = req.params;

  try {
    const pronosticos = await pool.query(
      `SELECT p.id, p.usuario_id, p.partido_id, p.goles_local, p.goles_visita,
              pa.goles_local AS real_local, pa.goles_visita AS real_visita,
              COALESCE(pa.bonus, 1) AS bonus
       FROM pronosticos p
       JOIN partidos pa ON p.partido_id = pa.id
       JOIN jornadas j ON pa.jornada_id = j.id
       WHERE j.numero = $1`,
      [jornada]
    );

    if (pronosticos.rowCount === 0) {
      return res.status(404).json({ error: "No hay pronósticos para esta jornada" });
    }

    let actualizados = 0;

    for (const p of pronosticos.rows) {
      let goles_local = p.real_local;
      let goles_visita = p.real_visita;
      const bonus = parseInt(p.bonus) || 1;

      // Si faltan resultados, saltar este partido (no actualizar desde API)
      if (goles_local === null || goles_visita === null) {
        console.warn(`Partido ${p.partido_id} no tiene resultados, saltando cálculo de puntaje`);
        continue;
      }

      // Calcular puntaje base
      let puntosBase = 0;
      const pred_dif = p.goles_local - p.goles_visita;
      const real_dif = goles_local - goles_visita;
      const pred_signo = Math.sign(pred_dif);
      const real_signo = Math.sign(real_dif);

      if (p.goles_local === goles_local && p.goles_visita === goles_visita) {
        puntosBase = 5;
      } else if (pred_dif === real_dif) {
        puntosBase = 3;
      } else if (pred_signo === real_signo) {
        puntosBase = 1;
      }

      // Multiplicar por bonus
      const puntos = puntosBase * bonus;

      await pool.query(
        `UPDATE pronosticos SET puntos = $1 WHERE id = $2`,
        [puntos, p.id]
      );

      actualizados++;
    }

    res.json({
      mensaje: '✅ Puntajes calculados correctamente (con bonus)',
      pronosticos: pronosticos.rowCount,
      actualizados
    });

  } catch (error) {
    console.error("Error al calcular puntajes:", error);
    res.status(500).json({ error: "Error interno al calcular los puntajes" });
  }
});

// GET /api/pronosticos/mis (tus pronósticos)
router.get("/mis", verifyToken, async (req, res) => {
  const usuarioId = req.usuario.id;
  try {
    const result = await pool.query(`
      SELECT 
        p.id AS pronostico_id,
        j.numero AS jornada,
        pa.nombre_local,
        pa.nombre_visita,
        p.goles_local,
        p.goles_visita,
        p.signo,
        pa.goles_local AS real_local,
        pa.goles_visita AS real_visita,
        pa.bonus,
        p.puntos
      FROM pronosticos p
      JOIN partidos pa ON p.partido_id = pa.id
      JOIN jornadas j ON pa.jornada_id = j.id
      WHERE p.usuario_id = $1
      ORDER BY j.numero, pa.fecha
    `, [usuarioId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "No se pudieron obtener tus pronósticos" });
  }
});

// GET /api/pronosticos/:jornada (tus pronósticos para una jornada)
router.get("/:jornada", verifyToken, async (req, res) => {
  const usuarioId = req.usuario.id;
  const { jornada } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT 
        p.id AS pronostico_id,
        p.partido_id,
        p.goles_local,
        p.goles_visita,
        p.signo,
        pa.nombre_local,
        pa.nombre_visita,
        pa.fecha
      FROM pronosticos p
      JOIN partidos pa ON p.partido_id = pa.id
      JOIN jornadas j ON pa.jornada_id = j.id
      WHERE p.usuario_id = $1 AND j.numero = $2
      ORDER BY pa.fecha ASC
      `,
      [usuarioId, jornada]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error al obtener pronósticos:", error);
    res.status(500).json({ error: "No se pudieron obtener los pronósticos" });
  }
});

// Pronósticos de todos los usuarios en una jornada
router.get("/jornada/:jornada", async (req, res) => {
  const { jornada } = req.params;
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (u.id, pa.id)
        u.id as usuario_id,
        u.nombre as usuario,
        u.foto_perfil as usuario_foto_perfil,
        p.id AS pronostico_id,
        p.partido_id,
        pa.nombre_local,
        pa.nombre_visita,
        pa.fecha,
        p.goles_local,
        p.goles_visita,
        p.signo,
        pa.goles_local AS real_local,
        pa.goles_visita AS real_visita,
        pa.bonus,
        p.puntos
      FROM pronosticos p
      JOIN usuarios u ON p.usuario_id = u.id
      JOIN partidos pa ON p.partido_id = pa.id
      JOIN jornadas j ON pa.jornada_id = j.id
      WHERE j.numero = $1
      ORDER BY u.id, pa.id, p.id DESC
      `,
      [jornada]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "No se pudieron obtener los pronósticos" });
  }
});

// Ranking jornada
router.get("/ranking/jornada/:jornada", async (req, res) => {
  const { jornada } = req.params;
  try {
    // Primero obtener el ID de la jornada
    const jornadaResult = await pool.query(
      'SELECT id FROM jornadas WHERE numero = $1',
      [jornada]
    );
    
    if (jornadaResult.rows.length === 0) {
      return res.status(404).json({ error: "Jornada no encontrada" });
    }
    
    const jornadaId = jornadaResult.rows[0].id;
    
    console.log(`📊 Consultando ranking para jornada ${jornada} (ID: ${jornadaId})`);
    
    const result = await pool.query(
      `SELECT 
        u.id as usuario_id,
        u.nombre as usuario,
        u.foto_perfil,
        COALESCE(SUM(p.puntos), 0) as puntos_jornada
      FROM usuarios u
      LEFT JOIN pronosticos p ON u.id = p.usuario_id
      LEFT JOIN partidos pa ON p.partido_id = pa.id
      WHERE (pa.jornada_id = $1 OR pa.jornada_id IS NULL)
        AND u.activo_torneo_nacional = true
        AND u.rol != 'admin'
      GROUP BY u.id, u.nombre, u.foto_perfil
      ORDER BY puntos_jornada DESC, usuario ASC`,
      [jornadaId]
    );
    
    console.log(`✅ Ranking calculado: ${result.rows.length} usuarios, máximo ${result.rows[0]?.puntos_jornada || 0} pts`);
    
    res.json(result.rows);
  } catch (error) {
    console.error("Error en ranking de jornada:", error);
    res.status(500).json({ error: "No se pudo obtener el ranking de la jornada" });
  }
});

// Ranking general
router.get("/ranking/general", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        u.id as usuario_id,
        u.nombre as usuario,
        u.foto_perfil,
        COALESCE(SUM(p.puntos),0) as puntaje_total
      FROM usuarios u
      LEFT JOIN pronosticos p ON p.usuario_id = u.id
      WHERE u.activo_torneo_nacional = true
        AND u.rol != 'admin'
      GROUP BY u.id, u.nombre, u.foto_perfil
      ORDER BY puntaje_total DESC, usuario ASC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "No se pudo obtener el ranking general" });
  }
});

// Ranking acumulado hasta una jornada específica (para simulador)
router.get("/ranking/acumulado-hasta/:jornadaNumero", async (req, res) => {
  try {
    const { jornadaNumero } = req.params;
    
    const result = await pool.query(
      `SELECT 
        u.id as usuario_id,
        u.nombre as usuario,
        u.foto_perfil,
        COALESCE(SUM(p.puntos),0) as puntaje_total
      FROM usuarios u
      LEFT JOIN pronosticos p ON p.usuario_id = u.id
      LEFT JOIN jornadas j ON j.id = p.jornada_id
      WHERE u.activo_torneo_nacional = true
        AND u.rol != 'admin'
        AND (j.numero IS NULL OR j.numero <= $1)
      GROUP BY u.id, u.nombre, u.foto_perfil
      ORDER BY puntaje_total DESC, usuario ASC`,
      [jornadaNumero]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error en ranking acumulado hasta jornada:", error);
    res.status(500).json({ error: "No se pudo obtener el ranking acumulado" });
  }
});

// Generar PDF con pronósticos de una jornada
router.post('/generar-pdf/:jornada', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { jornada } = req.params;

    console.log(`📄 Generando PDF para jornada ${jornada}...`);

    // Obtener todos los pronósticos de la jornada
    const pronosticosResult = await pool.query(`
      SELECT 
        u.nombre as usuario,
        pa.nombre_local,
        pa.nombre_visita,
        pa.fecha,
        p.goles_local,
        p.goles_visita,
        pa.goles_local as real_local,
        pa.goles_visita as real_visita,
        p.puntos
      FROM pronosticos p
      JOIN usuarios u ON p.usuario_id = u.id
      JOIN partidos pa ON p.partido_id = pa.id
      JOIN jornadas j ON pa.jornada_id = j.id
      WHERE j.numero = $1
      ORDER BY u.nombre, pa.fecha
    `, [jornada]);

    if (pronosticosResult.rows.length === 0) {
      return res.status(404).json({ error: 'No hay pronósticos para esta jornada' });
    }

    const pronosticos = pronosticosResult.rows;

    // Obtener lista única de partidos ordenados por fecha
    const partidosUnicos = [];
    const partidosVistos = new Set();
    pronosticos.forEach(p => {
      const key = `${p.nombre_local}|${p.nombre_visita}|${p.fecha}`;
      if (!partidosVistos.has(key)) {
        partidosVistos.add(key);
        partidosUnicos.push({
          nombre_local: p.nombre_local,
          nombre_visita: p.nombre_visita,
          fecha: p.fecha
        });
      }
    });

    // Ordenar partidos por fecha
    partidosUnicos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    // Agrupar pronósticos por usuario
    const pronosticosPorUsuario = {};
    pronosticos.forEach(p => {
      if (!pronosticosPorUsuario[p.usuario]) {
        pronosticosPorUsuario[p.usuario] = { pronosticos: {} };
      }
      const key = `${p.nombre_local}|${p.nombre_visita}`;
      pronosticosPorUsuario[p.usuario].pronosticos[key] = p;
    });

    const pdfBuffer = await generarPdfTestigoBuffer({
      competencia: 'Torneo Nacional',
      jornadaNumero: jornada,
      partidosUnicos,
      pronosticosPorUsuario
    });

    const nombreArchivo = `TorneoNacional_Jornada_${jornada}_${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Error generando PDF:', error);
    res.status(500).json({
      error: 'Error generando PDF',
      detalles: error.message
    });
  }
});

// GET /api/pronosticos/resumen/jornada/:jornada - Resumen agrupado de pronósticos por jornada
router.get("/resumen/jornada/:jornada", async (req, res) => {
  const { jornada } = req.params;

  try {
    // Obtener todos los pronósticos de la jornada con información del partido y usuarios
    const result = await pool.query(
      `SELECT 
        p.partido_id,
        pa.nombre_local,
        pa.nombre_visita,
        pa.fecha,
        p.goles_local,
        p.goles_visita,
        u.id as usuario_id,
        u.nombre as usuario_nombre,
        u.foto_perfil
      FROM pronosticos p
      JOIN partidos pa ON p.partido_id = pa.id
      JOIN jornadas j ON pa.jornada_id = j.id
      JOIN usuarios u ON p.usuario_id = u.id
      WHERE j.numero = $1
        AND u.activo_torneo_nacional = true
        AND u.rol != 'admin'
      ORDER BY pa.fecha ASC, pa.id ASC, p.goles_local, p.goles_visita`,
      [jornada]
    );

    if (result.rows.length === 0) {
      return res.json({ partidos: [], totalPronosticos: 0 });
    }

    // Agrupar pronósticos por partido
    const partidosMap = new Map();

    result.rows.forEach(row => {
      const partidoKey = row.partido_id;
      
      if (!partidosMap.has(partidoKey)) {
        partidosMap.set(partidoKey, {
          partido_id: row.partido_id,
          nombre_local: row.nombre_local,
          nombre_visita: row.nombre_visita,
          fecha: row.fecha,
          pronosticos: []
        });
      }

      partidosMap.get(partidoKey).pronosticos.push({
        goles_local: row.goles_local,
        goles_visita: row.goles_visita,
        usuario_id: row.usuario_id,
        usuario_nombre: row.usuario_nombre,
        foto_perfil: row.foto_perfil
      });
    });

    // Para cada partido, agrupar pronósticos por resultado
    const partidosAgrupados = Array.from(partidosMap.values()).map(partido => {
      const pronosticosAgrupados = new Map();
      const totalPronosticosPartido = partido.pronosticos.length;

      partido.pronosticos.forEach(pron => {
        const key = `${pron.goles_local}-${pron.goles_visita}`;
        
        if (!pronosticosAgrupados.has(key)) {
          pronosticosAgrupados.set(key, {
            resultado: key,
            goles_local: pron.goles_local,
            goles_visita: pron.goles_visita,
            cantidad: 0,
            porcentaje: 0,
            usuarios: []
          });
        }

        const grupo = pronosticosAgrupados.get(key);
        grupo.cantidad++;
        grupo.usuarios.push({
          id: pron.usuario_id,
          nombre: pron.usuario_nombre,
          foto_perfil: pron.foto_perfil
        });
      });

      // Calcular porcentajes
      pronosticosAgrupados.forEach(grupo => {
        grupo.porcentaje = ((grupo.cantidad / totalPronosticosPartido) * 100).toFixed(1);
      });

      // Convertir a array y ordenar por cantidad descendente
      const gruposArray = Array.from(pronosticosAgrupados.values())
        .sort((a, b) => b.cantidad - a.cantidad);

      return {
        partido_id: partido.partido_id,
        nombre_local: partido.nombre_local,
        nombre_visita: partido.nombre_visita,
        fecha: partido.fecha,
        total_pronosticos: totalPronosticosPartido,
        grupos: gruposArray
      };
    });

    res.json({
      jornada: parseInt(jornada),
      partidos: partidosAgrupados,
      totalPronosticos: result.rows.length
    });

  } catch (error) {
    console.error("Error obteniendo resumen de pronósticos:", error);
    res.status(500).json({ 
      error: "No se pudo obtener el resumen de pronósticos",
      detalles: error.message
    });
  }
});

export default router;
