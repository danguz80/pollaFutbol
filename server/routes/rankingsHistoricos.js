import express from "express";
import { pool } from "../db/pool.js";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";

const router = express.Router();

// 📊 GET - Obtener todos los rankings históricos agrupados por año y tipo
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        rh.*,
        u.nombre as usuario_nombre,
        u.foto_perfil
      FROM rankings_historicos rh
      LEFT JOIN usuarios u ON rh.usuario_id = u.id
      ORDER BY rh.anio DESC, rh.competencia, rh.posicion ASC, rh.categoria
    `);

    // Agrupar por año y tipo
    const rankings = {
      2024: { mayor: [], estandar: [] },
      2025: { mayor: [], estandar: [] }
    };

    result.rows.forEach(row => {
      if (!rankings[row.anio]) {
        rankings[row.anio] = { mayor: [], estandar: [] };
      }
      rankings[row.anio][row.tipo].push(row);
    });

    res.json(rankings);
  } catch (err) {
    console.error("Error al obtener rankings históricos:", err);
    res.status(500).json({ error: "Error al obtener rankings históricos" });
  }
});

// 📊 GET - Obtener rankings de una competencia específica
router.get("/:anio/:competencia", async (req, res) => {
  const { anio, competencia } = req.params;
  
  try {
    const result = await pool.query(`
      SELECT 
        rh.*,
        u.nombre as usuario_nombre,
        u.foto_perfil
      FROM rankings_historicos rh
      LEFT JOIN usuarios u ON rh.usuario_id = u.id
      WHERE rh.anio = $1 AND rh.competencia = $2
      ORDER BY rh.posicion ASC, rh.categoria
    `, [anio, competencia]);

    res.json(result.rows);
  } catch (err) {
    console.error("Error al obtener ranking de competencia:", err);
    res.status(500).json({ error: "Error al obtener ranking" });
  }
});

// 📝 POST - Crear/Actualizar ranking (ADMIN)
router.post("/", verifyToken, authorizeRoles("admin"), async (req, res) => {
  const { anio, competencia, tipo, categoria, usuario_id, nombre_manual, posicion, puntos } = req.body;

  try {
    // Validaciones
    if (!anio || !competencia || !tipo) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }

    if (!usuario_id && !nombre_manual) {
      return res.status(400).json({ error: "Debe especificar usuario_id o nombre_manual" });
    }

    const result = await pool.query(`
      INSERT INTO rankings_historicos 
        (anio, competencia, tipo, categoria, usuario_id, nombre_manual, posicion, puntos)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (anio, competencia, categoria, usuario_id, nombre_manual, posicion)
      DO UPDATE SET 
        puntos = EXCLUDED.puntos,
        actualizado_en = CURRENT_TIMESTAMP
      RETURNING *
    `, [anio, competencia, tipo, categoria, usuario_id, nombre_manual, posicion, puntos]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error al guardar ranking:", err);
    res.status(500).json({ error: "Error al guardar ranking" });
  }
});

// 🗑️ DELETE - Eliminar un ranking (ADMIN)
router.delete("/:id", verifyToken, authorizeRoles("admin"), async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(`
      DELETE FROM rankings_historicos WHERE id = $1 RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Ranking no encontrado" });
    }

    res.json({ message: "Ranking eliminado exitosamente", ranking: result.rows[0] });
  } catch (err) {
    console.error("Error al eliminar ranking:", err);
    res.status(500).json({ error: "Error al eliminar ranking" });
  }
});

// 📊 GET - Obtener estadísticas por usuario (cuántos títulos ha ganado cada uno)
router.get("/estadisticas/usuarios", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COALESCE(u.nombre, rh.nombre_manual) as nombre,
        u.foto_perfil,
        COUNT(*) as total_titulos,
        COUNT(*) FILTER (WHERE rh.tipo = 'mayor') as titulos_mayor,
        COUNT(*) FILTER (WHERE rh.tipo = 'estandar') as titulos_estandar,
        COUNT(*) FILTER (WHERE rh.posicion = 1) as primeros_lugares
      FROM rankings_historicos rh
      LEFT JOIN usuarios u ON rh.usuario_id = u.id
      GROUP BY u.id, u.nombre, u.foto_perfil, rh.nombre_manual
      ORDER BY titulos_mayor DESC, primeros_lugares DESC, total_titulos DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("Error al obtener estadísticas:", err);
    res.status(500).json({ error: "Error al obtener estadísticas" });
  }
});

// 📊 GET - Obtener ganadores de jornadas del Torneo Nacional 2025 (J11-J30 + Cuadro Final)
router.get("/torneo-nacional-2025", async (req, res) => {
  try {
    // Ganadores por jornada (J11 a J30)
    const ganadoresJornadas = await pool.query(`
      SELECT 
        j.numero as jornada_numero,
        u.id as usuario_id,
        u.nombre,
        u.foto_perfil
      FROM ganadores_jornada gj
      JOIN jornadas j ON gj.jornada_id = j.id
      JOIN usuarios u ON gj.jugador_id = u.id
      WHERE j.numero BETWEEN 11 AND 30
      ORDER BY j.numero, u.nombre
    `);

    // Ganadores del cuadro final (los que tienen el puntaje máximo)
    const ganadoresCuadroFinal = await pool.query(`
      SELECT 
        u.id as usuario_id,
        u.nombre,
        u.foto_perfil,
        pf.puntos
      FROM predicciones_finales pf
      JOIN usuarios u ON pf.jugador_id = u.id
      WHERE pf.puntos IS NOT NULL
        AND pf.puntos = (
          SELECT MAX(puntos) 
          FROM predicciones_finales 
          WHERE puntos IS NOT NULL
        )
      ORDER BY u.nombre
    `);

    // Top 3 del ranking general acumulado (suma de puntos de todas las jornadas)
    const rankingAcumulado = await pool.query(`
      SELECT 
        u.id as usuario_id,
        u.nombre,
        u.foto_perfil,
        COALESCE(SUM(p.puntos), 0) as puntos
      FROM usuarios u
      LEFT JOIN pronosticos p ON u.id = p.usuario_id
      LEFT JOIN jornadas j ON p.jornada_id = j.id
      WHERE j.cerrada = true OR j.cerrada IS NULL
      GROUP BY u.id, u.nombre, u.foto_perfil
      HAVING SUM(p.puntos) > 0
      ORDER BY puntos DESC
      LIMIT 3
    `);

    res.json({
      jornadas: ganadoresJornadas.rows,
      cuadroFinal: ganadoresCuadroFinal.rows,
      rankingAcumulado: rankingAcumulado.rows
    });
  } catch (err) {
    console.error("Error al obtener ganadores torneo nacional:", err);
    res.status(500).json({ error: "Error al obtener ganadores del torneo nacional", details: err.message });
  }
});

// 🔄 POST - Detectar y actualizar nuevos ganadores automáticamente (ADMIN)
router.post("/actualizar", verifyToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const nuevosRegistros = [];
    
    // ============================================
    // 1. CAMPEONATO NACIONAL - Ganadores de Jornadas (Estándar)
    // ============================================
    const ganadoresJornadasNacional = await pool.query(`
      SELECT DISTINCT
        2025 as anio,
        'Campeonato Nacional' as competencia,
        'estandar' as tipo,
        j.numero as categoria,
        u.id as usuario_id,
        NULL as nombre_manual,
        ROW_NUMBER() OVER (PARTITION BY j.numero ORDER BY u.nombre) as posicion,
        0 as puntos
      FROM ganadores_jornada gj
      JOIN jornadas j ON gj.jornada_id = j.id
      JOIN usuarios u ON gj.jugador_id = u.id
      WHERE NOT EXISTS (
        SELECT 1 FROM rankings_historicos rh
        WHERE rh.anio = 2025
          AND rh.competencia = 'Campeonato Nacional'
          AND rh.tipo = 'estandar'
          AND rh.categoria = j.numero::text
          AND rh.usuario_id = u.id
      )
    `);
    
    // ============================================
    // 2. CAMPEONATO NACIONAL - Ganador Acumulado (Mayor)
    // ============================================
    const ganadorAcumuladoNacional = await pool.query(`
      SELECT 
        2025 as anio,
        'Campeonato Nacional' as competencia,
        'mayor' as tipo,
        NULL as categoria,
        u.id as usuario_id,
        NULL as nombre_manual,
        ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(p.puntos), 0) DESC, u.nombre) as posicion,
        COALESCE(SUM(p.puntos), 0) as puntos
      FROM usuarios u
      LEFT JOIN pronosticos p ON u.id = p.usuario_id
      LEFT JOIN jornadas j ON p.jornada_id = j.id
      WHERE j.cerrada = true
      GROUP BY u.id
      HAVING COALESCE(SUM(p.puntos), 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM rankings_historicos rh
          WHERE rh.anio = 2025
            AND rh.competencia = 'Campeonato Nacional'
            AND rh.tipo = 'mayor'
            AND rh.usuario_id = u.id
        )
      ORDER BY puntos DESC, u.nombre
      LIMIT 3
    `);

    // ============================================
    // 3. LIBERTADORES - Ganadores de Jornadas (Estándar)
    // ============================================
    const ganadoresJornadasLibertadores = await pool.query(`
      SELECT DISTINCT
        2025 as anio,
        'Copa Libertadores' as competencia,
        'estandar' as tipo,
        lgj.jornada_numero::text as categoria,
        u.id as usuario_id,
        NULL as nombre_manual,
        ROW_NUMBER() OVER (PARTITION BY lgj.jornada_numero ORDER BY u.nombre) as posicion,
        lgj.puntaje as puntos
      FROM libertadores_ganadores_jornada lgj
      JOIN usuarios u ON lgj.usuario_id = u.id
      WHERE NOT EXISTS (
        SELECT 1 FROM rankings_historicos rh
        WHERE rh.anio = 2025
          AND rh.competencia = 'Copa Libertadores'
          AND rh.tipo = 'estandar'
          AND rh.categoria = lgj.jornada_numero::text
          AND rh.usuario_id = u.id
      )
    `);

    // ============================================
    // 4. LIBERTADORES - Ganador Acumulado (Mayor)
    // ============================================
    const ganadorAcumuladoLibertadores = await pool.query(`
      SELECT DISTINCT
        2025 as anio,
        'Copa Libertadores' as competencia,
        'mayor' as tipo,
        NULL as categoria,
        lga.usuario_id,
        NULL as nombre_manual,
        ROW_NUMBER() OVER (ORDER BY lga.puntaje DESC, u.nombre) as posicion,
        lga.puntaje as puntos
      FROM libertadores_ganadores_acumulado lga
      JOIN usuarios u ON lga.usuario_id = u.id
      WHERE NOT EXISTS (
        SELECT 1 FROM rankings_historicos rh
        WHERE rh.anio = 2025
          AND rh.competencia = 'Copa Libertadores'
          AND rh.tipo = 'mayor'
          AND rh.usuario_id = lga.usuario_id
      )
      ORDER BY puntos DESC, u.nombre
      LIMIT 3
    `);

    // Combinar todos los resultados
    const todosLosNuevos = [
      ...ganadoresJornadasNacional.rows,
      ...ganadorAcumuladoNacional.rows,
      ...ganadoresJornadasLibertadores.rows,
      ...ganadorAcumuladoLibertadores.rows
    ];

    // Insertar los nuevos registros
    for (const registro of todosLosNuevos) {
      try {
        await pool.query(`
          INSERT INTO rankings_historicos 
            (anio, competencia, tipo, categoria, usuario_id, nombre_manual, posicion, puntos)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (anio, competencia, categoria, usuario_id, nombre_manual, posicion)
          DO UPDATE SET 
            puntos = EXCLUDED.puntos,
            actualizado_en = CURRENT_TIMESTAMP
        `, [
          registro.anio,
          registro.competencia,
          registro.tipo,
          registro.categoria,
          registro.usuario_id,
          registro.nombre_manual,
          registro.posicion,
          registro.puntos
        ]);
        nuevosRegistros.push(registro);
      } catch (insertErr) {
        console.error('Error insertando registro:', insertErr);
      }
    }

    res.json({
      mensaje: `Se detectaron y agregaron ${nuevosRegistros.length} nuevos registros`,
      cantidad: nuevosRegistros.length,
      registros: nuevosRegistros.map(r => ({
        competencia: r.competencia,
        tipo: r.tipo === 'mayor' ? 'Cuadro de Honor Mayor' : 'Cuadro de Honor Estándar',
        categoria: r.categoria ? `Jornada ${r.categoria}` : 'Ranking Acumulado'
      }))
    });
    
  } catch (err) {
    console.error("Error al actualizar rankings históricos:", err);
    res.status(500).json({ error: "Error al actualizar rankings históricos", details: err.message });
  }
});

