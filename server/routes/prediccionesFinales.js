import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';

const router = express.Router();

// Obtener todas las predicciones finales (para mostrar cuando esté cerrado)
router.get('/todos', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        pf.*,
        u.nombre as jugador_nombre,
        u.foto_perfil
      FROM predicciones_finales pf
      JOIN usuarios u ON pf.jugador_id = u.id
      ORDER BY u.nombre
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener todas las predicciones finales:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener predicciones finales de un jugador
router.get('/:jugadorId', async (req, res) => {
  try {
    const { jugadorId } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM predicciones_finales WHERE jugador_id = $1',
      [jugadorId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No se encontraron predicciones' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error al obtener predicciones finales:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Crear o actualizar predicciones finales
router.post('/', verifyToken, async (req, res) => {
  try {
    const {
      jugador_id,
      campeon,
      subcampeon,
      tercero,
      cuarto,
      quinto,
      sexto,
      quinceto,
      dieciseisavo,
      copa_chile,
      copa_liga,
      goleador
    } = req.body;

    // Verificar si el usuario está activo en Torneo Nacional
    const usuarioCheck = await pool.query(
      'SELECT activo_torneo_nacional FROM usuarios WHERE id = $1',
      [jugador_id]
    );
    if (usuarioCheck.rowCount === 0 || !usuarioCheck.rows[0].activo_torneo_nacional) {
      return res.status(403).json({ message: 'No tienes acceso para ingresar pronósticos en el Torneo Nacional' });
    }

    // Verificar si ya existen predicciones para este jugador
    const existingResult = await pool.query(
      'SELECT id FROM predicciones_finales WHERE jugador_id = $1',
      [jugador_id]
    );

    if (existingResult.rows.length > 0) {
      // Actualizar predicciones existentes
      const updateResult = await pool.query(`
        UPDATE predicciones_finales 
        SET campeon = $2, subcampeon = $3, tercero = $4,
            cuarto = $5, quinto = $6, sexto = $7,
            quinceto = $8, dieciseisavo = $9,
            copa_chile = $10, copa_liga = $11, goleador = $12
        WHERE jugador_id = $1
        RETURNING *
      `, [
        jugador_id, campeon, subcampeon, tercero,
        cuarto, quinto, sexto, quinceto, dieciseisavo,
        copa_chile, copa_liga, goleador
      ]);
      
      res.json({ 
        message: 'Predicciones actualizadas exitosamente',
        predicciones: updateResult.rows[0]
      });
    } else {
      // Crear nuevas predicciones
      const insertResult = await pool.query(`
        INSERT INTO predicciones_finales (
          jugador_id, campeon, subcampeon, tercero,
          cuarto, quinto, sexto, quinceto, dieciseisavo,
          copa_chile, copa_liga, goleador
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `, [
        jugador_id, campeon, subcampeon, tercero,
        cuarto, quinto, sexto, quinceto, dieciseisavo,
        copa_chile, copa_liga, goleador
      ]);
      
      res.status(201).json({ 
        message: 'Predicciones creadas exitosamente',
        predicciones: insertResult.rows[0]
      });
    }
  } catch (error) {
    console.error('Error al guardar predicciones finales:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener todas las predicciones finales con nombres de jugadores
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        pf.*,
        u.nombre
      FROM predicciones_finales pf
      JOIN usuarios u ON pf.jugador_id = u.id
      ORDER BY u.nombre
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener todas las predicciones finales:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Calcular puntos comparando con predicciones reales
router.post('/calcular-puntos', verifyToken, async (req, res) => {
  try {
    const prediccionesReales = req.body;
    
    // Obtener todas las predicciones de usuarios
    const result = await pool.query(`
      SELECT * FROM predicciones_finales
    `);
    
    let usuariosActualizados = 0;
    
    for (const prediccion of result.rows) {
      let puntos = 0;
      
      // Calcular puntos según aciertos con nueva tabla de puntaje
      if (prediccion.campeon === prediccionesReales.campeon && prediccionesReales.campeon) {
        puntos += 15; // 1° Lugar
      }
      if (prediccion.subcampeon === prediccionesReales.subcampeon && prediccionesReales.subcampeon) {
        puntos += 10; // 2° Lugar
      }
      if (prediccion.tercero === prediccionesReales.tercero && prediccionesReales.tercero) {
        puntos += 5; // 3° Lugar
      }
      if (prediccion.cuarto === prediccionesReales.cuarto && prediccionesReales.cuarto) {
        puntos += 5; // 4° Lugar
      }
      if (prediccion.quinto === prediccionesReales.quinto && prediccionesReales.quinto) {
        puntos += 5; // 5° Lugar
      }
      if (prediccion.sexto === prediccionesReales.sexto && prediccionesReales.sexto) {
        puntos += 5; // 6° Lugar
      }
      if (prediccion.quinceto === prediccionesReales.quinceto && prediccionesReales.quinceto) {
        puntos += 5; // 15° Lugar (Desciende)
      }
      if (prediccion.dieciseisavo === prediccionesReales.dieciseisavo && prediccionesReales.dieciseisavo) {
        puntos += 5; // 16° Lugar (Desciende)
      }
      if (prediccion.copa_chile === prediccionesReales.copa_chile && prediccionesReales.copa_chile) {
        puntos += 5; // Campeón Copa Chile
      }
      if (prediccion.copa_liga === prediccionesReales.copa_liga && prediccionesReales.copa_liga) {
        puntos += 5; // Campeón Copa de la Liga
      }
      if (prediccion.goleador === prediccionesReales.goleador && prediccionesReales.goleador) {
        puntos += 6; // Goleador
      }
      
      // Actualizar puntos en la tabla
      await pool.query(
        'UPDATE predicciones_finales SET puntos = $1 WHERE id = $2',
        [puntos, prediccion.id]
      );
      
      usuariosActualizados++;
    }
    
    res.json({ 
      message: 'Puntos calculados exitosamente',
      usuariosActualizados
    });
  } catch (error) {
    console.error('Error al calcular puntos:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Actualizar ganadores del cuadro final en jornada 999
router.post('/actualizar-ganadores', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    // Verificar/crear jornada 999
    let jornadaFinal = await pool.query(`
      SELECT id FROM jornadas WHERE numero = 999
    `);
    
    if (jornadaFinal.rows.length === 0) {
      jornadaFinal = await pool.query(`
        INSERT INTO jornadas (numero, nombre, cerrada)
        VALUES (999, 'Cuadro Final', true)
        RETURNING id
      `);
    }
    
    const jornadaFinalId = jornadaFinal.rows[0].id;
    
    // Eliminar ganadores anteriores de la jornada 999
    await pool.query(`
      DELETE FROM ganadores_jornada WHERE jornada_id = $1
    `, [jornadaFinalId]);
    
    // Obtener el máximo puntaje del cuadro final
    const maxPuntaje = await pool.query(`
      SELECT MAX(puntos) as max_puntos FROM predicciones_finales
    `);
    
    const puntajeMaximo = maxPuntaje.rows[0].max_puntos;
    
    if (!puntajeMaximo || puntajeMaximo === 0) {
      return res.json({
        message: 'No hay puntos calculados en el cuadro final',
        ganadoresActualizados: 0
      });
    }
    
    // Obtener todos los jugadores con el máximo puntaje
    const ganadoresResult = await pool.query(`
      SELECT jugador_id FROM predicciones_finales 
      WHERE puntos = $1
    `, [puntajeMaximo]);
    
    // Registrar ganadores en ganadores_jornada
    for (const ganador of ganadoresResult.rows) {
      await pool.query(`
        INSERT INTO ganadores_jornada (jornada_id, jugador_id, acierto)
        VALUES ($1, $2, true)
      `, [jornadaFinalId, ganador.jugador_id]);
    }
    
    // Actualizar columna ganadores en jornadas con los nombres
    const nombresGanadores = await pool.query(`
      SELECT u.nombre 
      FROM usuarios u
      INNER JOIN ganadores_jornada gj ON u.id = gj.jugador_id
      WHERE gj.jornada_id = $1
    `, [jornadaFinalId]);
    
    const arrayNombres = nombresGanadores.rows.map(row => row.nombre);
    
    await pool.query(`
      UPDATE jornadas 
      SET ganadores = $1
      WHERE id = $2
    `, [arrayNombres, jornadaFinalId]);
    
    console.log(`🏆 ${ganadoresResult.rows.length} ganador(es) del cuadro final actualizados:`, arrayNombres);
    
    res.json({
      message: 'Ganadores del cuadro final actualizados',
      ganadores: arrayNombres,
      puntajeMaximo
    });
  } catch (error) {
    console.error('Error actualizando ganadores:', error);
    res.status(500).json({ 
      message: 'Error al actualizar ganadores',
      error: error.message 
    });
  }
});

// Sumar puntos del cuadro final al ranking general
router.post('/sumar-ranking', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    // Verificar que exista la jornada 999 (Cuadro Final)
    let jornadaFinal = await pool.query(`
      SELECT id FROM jornadas WHERE numero = 999
    `);
    
    if (jornadaFinal.rows.length === 0) {
      // Crear la jornada Cuadro Final
      jornadaFinal = await pool.query(`
        INSERT INTO jornadas (numero, nombre, cerrada)
        VALUES (999, 'Cuadro Final', true)
        RETURNING id
      `);
    }
    
    const jornadaFinalId = jornadaFinal.rows[0].id;
    
    // PRIMERO: Limpiar todos los pronósticos existentes de la jornada 999
    await pool.query(`
      DELETE FROM pronosticos WHERE jornada_id = $1
    `, [jornadaFinalId]);
    
    console.log('🗑️  Pronósticos anteriores de jornada 999 eliminados');
    
    // Crear un partido ficticio para la jornada 999 si no existe
    let partidoFinal = await pool.query(`
      SELECT id FROM partidos WHERE jornada_id = $1 LIMIT 1
    `, [jornadaFinalId]);
    
    if (partidoFinal.rows.length === 0) {
      partidoFinal = await pool.query(`
        INSERT INTO partidos (jornada_id, nombre_local, nombre_visita, fecha, estado)
        VALUES ($1, 'Cuadro Final', 'Cuadro Final', NOW(), 'Finalizado')
        RETURNING id
      `, [jornadaFinalId]);
    }
    
    const partidoFinalId = partidoFinal.rows[0].id;
    
    // Obtener todas las predicciones finales (incluyendo las de 0 puntos)
    const predicciones = await pool.query(`
      SELECT jugador_id, puntos 
      FROM predicciones_finales 
      WHERE puntos IS NOT NULL
    `);
    
    console.log(`📊 Predicciones finales encontradas: ${predicciones.rows.length}`);
    
    if (predicciones.rows.length === 0) {
      return res.json({ 
        message: 'No hay predicciones finales para sumar',
        usuariosActualizados: 0
      });
    }
    
    let usuariosActualizados = 0;
    
    for (const prediccion of predicciones.rows) {
      console.log(`💾 Sumando ${prediccion.puntos} puntos para jugador ${prediccion.jugador_id}`);
      
      // Insertar pronóstico con los puntos del cuadro final
      await pool.query(`
        INSERT INTO pronosticos (usuario_id, jornada_id, partido_id, goles_local, goles_visita, puntos)
        VALUES ($1, $2, $3, 0, 0, $4)
      `, [prediccion.jugador_id, jornadaFinalId, partidoFinalId, prediccion.puntos]);
      
      usuariosActualizados++;
    }
    
    console.log(`✅ Total de usuarios actualizados: ${usuariosActualizados}`);
    
    res.json({ 
      message: 'Puntos sumados al ranking exitosamente',
      usuariosActualizados
    });
  } catch (error) {
    console.error('Error al sumar puntos al ranking:', error);
    res.status(500).json({ 
      message: 'Error interno del servidor',
      error: error.message 
    });
  }
});

export default router;
