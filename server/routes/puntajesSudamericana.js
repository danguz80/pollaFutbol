import express from 'express';
import { pool } from '../db/pool.js';
import { calcularPuntajesSudamericana } from '../services/puntajesSudamericana.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';

const router = express.Router();

router.post('/guardar-clasificados', verifyToken, async function guardarClasificados(req, res) {
  // Espera body: { clasificadosPorRonda: { "ronda1": ["equipo1", "equipo2"], "ronda2": [...] } }
  // O formato legacy: { ronda: string, clasificados: array }
  const { clasificadosPorRonda, ronda, clasificados } = req.body;
  const usuarioId = req.usuario.id;
  
  try {
    // Soporte para formato nuevo (todas las rondas de una vez)
    if (clasificadosPorRonda && typeof clasificadosPorRonda === 'object') {
      // TRANSACCIÓN: eliminar todos los pronósticos del usuario y insertar los nuevos
      await pool.query('BEGIN');
      
      try {
        // Eliminar TODOS los pronósticos existentes del usuario
        await pool.query(
          'DELETE FROM clasif_sud_pron WHERE usuario_id = $1',
          [usuarioId]
        );

        let totalInsertados = 0;
        // Insertar todos los clasificados por ronda
        for (const [rondaNombre, equipos] of Object.entries(clasificadosPorRonda)) {
          if (Array.isArray(equipos)) {
            for (const equipo of equipos) {
              if (equipo && equipo.trim()) {
                await pool.query(
                  `INSERT INTO clasif_sud_pron (usuario_id, ronda, clasificados)
                   VALUES ($1, $2, $3)`,
                  [usuarioId, rondaNombre, equipo.trim()]
                );
                totalInsertados++;
              }
            }
          }
        }

        await pool.query('COMMIT');
        
        res.json({ 
          ok: true, 
          message: `${totalInsertados} clasificados guardados para todas las rondas`, 
          totalInsertados
        });
      } catch (err) {
        await pool.query('ROLLBACK');
        throw err;
      }
      
    } else if (ronda && Array.isArray(clasificados)) {
      // Formato legacy (una ronda a la vez) - mantener compatibilidad
      if (!ronda || !Array.isArray(clasificados)) {
        res.status(400).json({ error: 'Faltan datos: ronda o clasificados' });
        return;
      }
      
      // Eliminar los pronósticos existentes para esta ronda y usuario
      await pool.query(
        'DELETE FROM clasif_sud_pron WHERE usuario_id = $1 AND ronda = $2',
        [usuarioId, ronda]
      );

      // Insertar cada equipo clasificado como una fila separada
      for (const equipo of clasificados) {
        if (equipo && equipo.trim()) {
          await pool.query(
            `INSERT INTO clasif_sud_pron (usuario_id, ronda, clasificados)
             VALUES ($1, $2, $3)`,
            [usuarioId, ronda, equipo.trim()]
          );
        }
      }
      
      res.json({ 
        ok: true, 
        message: `${clasificados.length} clasificados guardados para ${ronda}`, 
        ronda, 
        clasificados 
      });
    } else {
      res.status(400).json({ error: 'Formato inválido: se requiere clasificadosPorRonda o (ronda + clasificados)' });
    }
    
  } catch (err) {
    console.error('Error guardando pronóstico de clasificados:', err);
    res.status(500).json({ error: 'Error guardando pronóstico de clasificados' });
  }
});

// POST /api/sudamericana/guardar-clasificados-reales (admin guarda los clasificados reales)
router.post('/guardar-clasificados-reales', verifyToken, authorizeRoles('admin'), async (req, res) => {
  // Espera body: { ronda: string, clasificados: array de nombres }
  const { ronda, clasificados } = req.body;
  if (!ronda || !Array.isArray(clasificados)) {
    return res.status(400).json({ error: 'Faltan datos: ronda o clasificados' });
  }
  
  try {
    // Eliminar clasificados existentes para esta ronda
    await pool.query(
      'DELETE FROM clasif_sud WHERE ronda = $1',
      [ronda]
    );

    // Insertar cada equipo clasificado como una fila separada
    for (const equipo of clasificados) {
      if (equipo && equipo.trim()) {
        await pool.query(
          `INSERT INTO clasif_sud (ronda, clasificados)
           VALUES ($1, $2)`,
          [ronda, equipo.trim()]
        );
      }
    }
    
    res.json({ 
      ok: true, 
      message: `${clasificados.length} clasificados reales guardados para ${ronda}`, 
      ronda, 
      clasificados 
    });
  } catch (err) {
    console.error('Error guardando clasificados reales:', err);
    res.status(500).json({ error: 'Error guardando clasificados reales' });
  }
});

// GET /api/sudamericana/puntajes/:usuarioId
router.get('/puntajes/:usuarioId', verifyToken, async (req, res) => {
  const { usuarioId } = req.params;

  // Verificar que el usuarioId de la URL coincida con el usuario autenticado
  if (req.usuario.id !== parseInt(usuarioId)) {
    return res.status(403).json({ error: "No autorizado: solo puedes consultar tus propios puntajes" });
  }

  // Verificar que el usuario tenga activo_sudamericana = true
  if (!req.usuario.activo_sudamericana) {
    return res.status(403).json({ 
      error: "No tienes autorización para consultar puntajes de Sudamericana. Contacta al administrador." 
    });
  }
  try {
    // Obtener fixture (partidos)
    const fixtureRes = await pool.query('SELECT * FROM sudamericana_fixtures');
    // Obtener pronósticos del usuario
    const pronosRes = await pool.query('SELECT * FROM pronosticos_sudamericana WHERE usuario_id = $1', [usuarioId]);

    // Obtener puntos por partidos (lógica existente)
    const resultados = fixtureRes.rows.map(f => ({
      fixture_id: f.fixture_id,
      goles_local: f.goles_local,
      goles_visita: f.goles_visita,
      ganador: f.clasificado, // CORREGIDO: usar 'clasificado' en lugar de 'ganador'
      equipo_local: f.equipo_local,
      equipo_visita: f.equipo_visita,
      ronda: f.ronda
    }));
    const puntajePartidos = calcularPuntajesSudamericana(fixtureRes.rows, pronosRes.rows, resultados);

    // === CLASIFICADOS ===
    // 1. Obtener todas las rondas únicas
    const rondasRes = await pool.query('SELECT DISTINCT ronda FROM sudamericana_fixtures ORDER BY ronda ASC');
    const rondas = rondasRes.rows.map(r => r.ronda);

    // 2. Obtener pronósticos de clasificados del usuario (desde clasif_sud_pron)
    const pronClasifRes = await pool.query(
      'SELECT ronda, clasificados FROM clasif_sud_pron WHERE usuario_id = $1',
      [usuarioId]
    );
    const pronMap = {};
    for (const row of pronClasifRes.rows) {
      if (!pronMap[row.ronda]) pronMap[row.ronda] = [];
      if (row.clasificados && row.clasificados.trim()) {
        pronMap[row.ronda].push(row.clasificados.trim());
      }
    }

    // 3. Obtener clasificados reales (desde clasif_sud)
    const realClasifRes = await pool.query(
      'SELECT ronda, clasificados FROM clasif_sud'
    );
    const realMap = {};
    for (const row of realClasifRes.rows) {
      if (!realMap[row.ronda]) realMap[row.ronda] = [];
      if (row.clasificados && row.clasificados.trim()) {
        realMap[row.ronda].push(row.clasificados.trim());
      }
    }

    // 4. Definir puntaje por ronda
    const puntosPorRonda = {
      'Knockout Round Play-offs': 2,
      'Octavos de Final': 3,
      'Cuartos de Final': 3,
      'Semifinales': 5,
      'Final': 0 // especial, ver abajo
    };

    // 5. Calcular puntos por ronda de clasificados
    let totalClasif = 0;
    const detalleClasif = [];
    for (const ronda of rondas) {
      const misClasificados = pronMap[ronda] || [];
      const reales = realMap[ronda] || [];
      let puntos = 0;
      let aciertos = 0;

      if (ronda === 'Final') {
        // Especial: campeón y subcampeón
        if (misClasificados[0] && reales[0] && misClasificados[0] === reales[0]) {
          puntos += 15; // campeón
          aciertos++;
        }
        if (misClasificados[1] && reales[1] && misClasificados[1] === reales[1]) {
          puntos += 10; // subcampeón
          aciertos++;
        }
      } else {
        // Rondas normales: buscar coincidencias sin importar el orden
        const puntajePorAcierto = puntosPorRonda[ronda] || 0;
        for (const miEquipo of misClasificados) {
          if (reales.includes(miEquipo)) {
            aciertos++;
            puntos += puntajePorAcierto;
          }
        }
      }
      
      totalClasif += puntos;
      detalleClasif.push({
        ronda,
        misClasificados,
        clasificadosReales: reales,
        aciertos,
        puntos
      });
    }

    // Sumar total general (partidos + clasificados)
    const total = (puntajePartidos?.total || 0) + totalClasif;

    res.json({
      partidos: puntajePartidos,
      clasificados: {
        detalle: detalleClasif,
        total: totalClasif
      },
      total
    });
  } catch (error) {
    console.error('Error calculando puntajes Sudamericana:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
