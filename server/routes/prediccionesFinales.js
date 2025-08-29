import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';

const router = express.Router();

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
      chile_4_lib,
      cuarto,
      quinto,
      sexto,
      septimo,
      quinceto,
      dieciseisavo,
      goleador
    } = req.body;

    // Verificar si ya existen predicciones para este jugador
    const existingResult = await pool.query(
      'SELECT id FROM predicciones_finales WHERE jugador_id = $1',
      [jugador_id]
    );

    if (existingResult.rows.length > 0) {
      // Actualizar predicciones existentes
      const updateResult = await pool.query(`
        UPDATE predicciones_finales 
        SET campeon = $2, subcampeon = $3, tercero = $4, chile_4_lib = $5,
            cuarto = $6, quinto = $7, sexto = $8, septimo = $9,
            quinceto = $10, dieciseisavo = $11, goleador = $12
        WHERE jugador_id = $1
        RETURNING *
      `, [
        jugador_id, campeon, subcampeon, tercero, chile_4_lib,
        cuarto, quinto, sexto, septimo, quinceto, dieciseisavo, goleador
      ]);
      
      res.json({ 
        message: 'Predicciones actualizadas exitosamente',
        predicciones: updateResult.rows[0]
      });
    } else {
      // Crear nuevas predicciones
      const insertResult = await pool.query(`
        INSERT INTO predicciones_finales (
          jugador_id, campeon, subcampeon, tercero, chile_4_lib,
          cuarto, quinto, sexto, septimo, quinceto, dieciseisavo, goleador
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `, [
        jugador_id, campeon, subcampeon, tercero, chile_4_lib,
        cuarto, quinto, sexto, septimo, quinceto, dieciseisavo, goleador
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
      
      // Calcular puntos según aciertos
      if (prediccion.campeon === prediccionesReales.campeon && prediccionesReales.campeon) {
        puntos += 15;
      }
      if (prediccion.subcampeon === prediccionesReales.subcampeon && prediccionesReales.subcampeon) {
        puntos += 10;
      }
      if (prediccion.tercero === prediccionesReales.tercero && prediccionesReales.tercero) {
        puntos += 5;
      }
      if (prediccion.chile_4_lib === prediccionesReales.chile_4_lib && prediccionesReales.chile_4_lib) {
        puntos += 5;
      }
      if (prediccion.cuarto === prediccionesReales.cuarto && prediccionesReales.cuarto) {
        puntos += 5;
      }
      if (prediccion.quinto === prediccionesReales.quinto && prediccionesReales.quinto) {
        puntos += 5;
      }
      if (prediccion.sexto === prediccionesReales.sexto && prediccionesReales.sexto) {
        puntos += 5;
      }
      if (prediccion.septimo === prediccionesReales.septimo && prediccionesReales.septimo) {
        puntos += 5;
      }
      if (prediccion.quinceto === prediccionesReales.quinceto && prediccionesReales.quinceto) {
        puntos += 5;
      }
      if (prediccion.dieciseisavo === prediccionesReales.dieciseisavo && prediccionesReales.dieciseisavo) {
        puntos += 5;
      }
      if (prediccion.goleador === prediccionesReales.goleador && prediccionesReales.goleador) {
        puntos += 6;
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

// Sumar puntos del cuadro final al ranking general
router.post('/sumar-ranking', verifyToken, async (req, res) => {
  try {
    // Obtener todas las predicciones finales con puntos
    const result = await pool.query(`
      SELECT jugador_id, puntos 
      FROM predicciones_finales 
      WHERE puntos > 0
    `);
    
    let usuariosActualizados = 0;
    
    for (const prediccion of result.rows) {
      // Sumar puntos al total del usuario
      await pool.query(`
        UPDATE usuarios 
        SET puntaje_total = puntaje_total + $1 
        WHERE id = $2
      `, [prediccion.puntos, prediccion.jugador_id]);
      
      usuariosActualizados++;
    }
    
    res.json({ 
      message: 'Puntos sumados al ranking exitosamente',
      usuariosActualizados
    });
  } catch (error) {
    console.error('Error al sumar puntos al ranking:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

export default router;
