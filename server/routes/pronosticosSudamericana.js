import express from "express";
import { pool } from "../db/pool.js";
import { reemplazarSiglasPorNombres, calcularAvanceSiglas } from '../utils/sudamericanaSiglas.js';
import { verifyToken } from "../middleware/verifyToken.js";
import { definirClasificadosPlayoffs } from '../services/clasificacionSudamericana.js';

const router = express.Router();

// POST /api/sudamericana/guardar-pronosticos-elim
router.post("/guardar-pronosticos-elim", verifyToken, async (req, res) => {
  const { usuario_id, pronosticos } = req.body;
  
  // Verificar que el usuario_id del body coincida con el usuario autenticado
  if (req.usuario.id !== parseInt(usuario_id)) {
    return res.status(403).json({ error: "No autorizado: usuario_id no coincide con el usuario autenticado" });
  }

  // Verificar que el usuario tenga activo_sudamericana = true
  if (!req.usuario.activo_sudamericana) {
    return res.status(403).json({ 
      error: "No tienes autorización para realizar pronósticos de Sudamericana. Contacta al administrador." 
    });
  }

  if (!usuario_id || !pronosticos || !Array.isArray(pronosticos)) {
    return res.status(400).json({ error: "Faltan datos obligatorios" });
  }
  if (pronosticos.length === 0) {
  } else {
    pronosticos.forEach((p, i) => {
    });
  }
  let exitos = 0;
  let errores = [];
  try {
    for (const p of pronosticos) {
      try {
        await pool.query(
          `INSERT INTO pronosticos_sudamericana (usuario_id, fixture_id, ronda, equipo_local, equipo_visita, ganador, goles_local, goles_visita, penales_local, penales_visita)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (usuario_id, fixture_id) DO UPDATE SET
             ronda = EXCLUDED.ronda,
             equipo_local = EXCLUDED.equipo_local,
             equipo_visita = EXCLUDED.equipo_visita,
             ganador = EXCLUDED.ganador,
             goles_local = EXCLUDED.goles_local,
             goles_visita = EXCLUDED.goles_visita,
             penales_local = EXCLUDED.penales_local,
             penales_visita = EXCLUDED.penales_visita
          `,
          [
            usuario_id,
            p.fixture_id,
            p.ronda,
            p.equipo_local,
            p.equipo_visita,
            p.ganador,
            p.goles_local,
            p.goles_visita,
            p.penales_local,
            p.penales_visita
          ]
        );
        exitos++;
      } catch (err) {
        console.error("[ERROR][INSERT/UPDATE]", err, p);
        errores.push({ fixture_id: p.fixture_id, error: err.message });
      }
    }
    if (errores.length > 0) {
      res.status(207).json({ ok: false, exitos, errores, message: "Algunos pronósticos no se guardaron. Revisa los logs del backend." });
    } else {
      // 🔥 FUNCIONALIDAD DESHABILITADA: No actualizar cruces automáticamente para preservar estructura de siglas
      try {
        console.log('🔧 Actualización automática de cruces deshabilitada para preservar siglas');
        // await definirClasificadosPlayoffs();
        console.log('✅ Pronósticos guardados sin modificar estructura de fixture');
        res.json({ ok: true, exitos, message: `${exitos} pronósticos guardados correctamente` });
      } catch (updateError) {
        console.error('❌ Error actualizando cruces:', updateError);
        // Los pronósticos se guardaron, pero hubo error al actualizar cruces
        res.json({ ok: true, exitos, warning: 'Pronósticos guardados pero error actualizando cruces: ' + updateError.message });
      }
    }
  } catch (error) {
    console.error("Error guardando pronósticos eliminación directa:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/sudamericana/pronosticos-elim/:usuarioId
router.get("/pronosticos-elim/:usuarioId", verifyToken, async (req, res) => {
  const { usuarioId } = req.params;
  
  // Verificar que el usuarioId de la URL coincida con el usuario autenticado
  if (req.usuario.id !== parseInt(usuarioId)) {
    return res.status(403).json({ error: "No autorizado: solo puedes consultar tus propios pronósticos" });
  }

  // Verificar que el usuario tenga activo_sudamericana = true
  if (!req.usuario.activo_sudamericana) {
    return res.status(403).json({ 
      error: "No tienes autorización para consultar pronósticos de Sudamericana. Contacta al administrador." 
    });
  }
  try {
    // 1. Obtener todos los pronósticos del usuario
    const result = await pool.query(
      `SELECT * FROM pronosticos_sudamericana WHERE usuario_id = $1`,
      [usuarioId]
    );
    const pronos = result.rows;
    // 2. Obtener fixture completo
    const fixtureRes = await pool.query('SELECT * FROM sudamericana_fixtures');
    const fixture = fixtureRes.rows;
    // 3. Calcular avance de cruces con pronósticos (como en el frontend)
    const dicSiglas = calcularAvanceSiglas(fixture, pronos);
    // 4. Reemplazar siglas por nombres reales
    const pronosConNombres = reemplazarSiglasPorNombres(pronos, dicSiglas);
        
    res.json(pronosConNombres);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/sudamericana/pronosticos/calcular/:ronda - Calcular puntajes para una ronda específica
router.post("/pronosticos/calcular/:ronda", async (req, res) => {
  const { ronda } = req.params;

  try {

    // Obtener todos los pronósticos de la ronda específica
    const pronosticos = await pool.query(
      `SELECT ps.id, ps.usuario_id, ps.fixture_id, ps.goles_local AS pred_local, ps.goles_visita AS pred_visita, ps.ganador AS pred_ganador,
              ps.penales_local AS pred_penales_local, ps.penales_visita AS pred_penales_visita,
              sf.goles_local AS real_local, sf.goles_visita AS real_visita, sf.ganador AS real_ganador,
              sf.penales_local AS real_penales_local, sf.penales_visita AS real_penales_visita,
              COALESCE(sf.bonus, 1) AS bonus, sf.ronda
       FROM pronosticos_sudamericana ps
       JOIN sudamericana_fixtures sf ON ps.fixture_id = sf.fixture_id
       WHERE sf.ronda = $1`,
      [ronda]
    );

    if (pronosticos.rowCount === 0) {
      return res.status(404).json({ error: "No hay pronósticos para esta ronda" });
    }

    let actualizados = 0;

    for (const p of pronosticos.rows) {
      const realLocal = p.real_local;
      const realVisita = p.real_visita;
      const realGanador = p.real_ganador;
      const bonus = parseInt(p.bonus) || 1;

      // Solo calcular si tenemos resultados reales
      if (realLocal === null || realVisita === null || !realGanador) {
        console.warn(`⚠️ Saltando partido ${p.fixture_id} - faltan resultados reales`);
        continue;
      }

      // Calcular puntaje base según las reglas de Sudamericana
      let puntosBase = 0;

      // Primero verificar si acertó el resultado exacto
      if (p.pred_local === realLocal && p.pred_visita === realVisita) {
        puntosBase = 5; // Resultado exacto
      }
      // Si no, verificar si acertó el ganador
      else if (p.pred_ganador === realGanador) {
        puntosBase = 3; // Ganador correcto
      }
      // Si no acertó nada, verificar la diferencia de goles
      else {
        const predDif = p.pred_local - p.pred_visita;
        const realDif = realLocal - realVisita;
        
        if (predDif === realDif) {
          puntosBase = 2; // Diferencia exacta pero ganador equivocado
        } else {
          const predSigno = Math.sign(predDif);
          const realSigno = Math.sign(realDif);
          
          if (predSigno === realSigno) {
            puntosBase = 1; // Al menos el signo (empate, victoria local/visita)
          }
        }
      }

      // Multiplicar por bonus
      const puntos = puntosBase * bonus;

      // Actualizar los puntos en la base de datos
      await pool.query(
        `UPDATE pronosticos_sudamericana SET puntos = $1 WHERE id = $2`,
        [puntos, p.id]
      );

      actualizados++;
    }

    res.json({
      mensaje: `✅ Puntajes recalculados correctamente para la ronda ${ronda}`,
      pronosticos: pronosticos.rowCount,
      actualizados
    });

  } catch (error) {
    console.error("Error al calcular puntajes Sudamericana:", error);
    res.status(500).json({ error: "Error interno al calcular los puntajes" });
  }
});

export default router;
