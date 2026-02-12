import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';

const router = express.Router();

// GET /api/mundial-puntuacion/reglas - Obtener todas las reglas de puntuación
router.get('/reglas', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM mundial_puntuacion
      ORDER BY 
        CASE fase
          WHEN 'FASE DE GRUPOS' THEN 1
          WHEN 'CLASIFICACIÓN' THEN 2
          WHEN '16VOS' THEN 3
          WHEN 'OCTAVOS' THEN 4
          WHEN 'CUARTOS' THEN 5
          WHEN 'SEMIFINALES' THEN 6
          WHEN 'FINAL' THEN 7
          WHEN 'CAMPEÓN' THEN 8
          ELSE 9
        END,
        id
    `);

    // Si no hay reglas, crear las por defecto (con lock para evitar duplicados)
    if (result.rows.length === 0) {
      await pool.query('BEGIN');
      try {
        const checkResult = await pool.query('SELECT COUNT(*) FROM mundial_puntuacion');
        if (parseInt(checkResult.rows[0].count) === 0) {
          await crearReglasDefecto();
        }
        await pool.query('COMMIT');
      } catch (err) {
        await pool.query('ROLLBACK');
        throw err;
      }
      
      const newResult = await pool.query(`
        SELECT * FROM mundial_puntuacion
        ORDER BY 
          CASE fase
            WHEN 'FASE DE GRUPOS' THEN 1
            WHEN 'CLASIFICACIÓN' THEN 2
            WHEN '16VOS' THEN 3
            WHEN 'OCTAVOS' THEN 4
            WHEN 'CUARTOS' THEN 5
            WHEN 'SEMIFINALES' THEN 6
            WHEN 'FINAL' THEN 7
            WHEN 'CAMPEÓN' THEN 8
            ELSE 9
          END,
          id
      `);
      return res.json(newResult.rows);
    }

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo reglas de puntuación:', error);
    res.status(500).json({ error: 'Error obteniendo reglas de puntuación' });
  }
});

// PUT /api/mundial-puntuacion/reglas - Actualizar reglas de puntuación (Admin)
router.put('/reglas', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { reglas } = req.body; // Array de objetos { id, puntos }

    if (!Array.isArray(reglas)) {
      return res.status(400).json({ error: 'Se requiere un array de reglas' });
    }

    // Actualizar cada regla
    for (const regla of reglas) {
      if (regla.id && regla.puntos !== undefined) {
        await pool.query(
          'UPDATE mundial_puntuacion SET puntos = $1 WHERE id = $2',
          [regla.puntos, regla.id]
        );
      }
    }

    res.json({ mensaje: 'Reglas de puntuación actualizadas exitosamente' });
  } catch (error) {
    console.error('Error actualizando reglas:', error);
    res.status(500).json({ error: 'Error actualizando reglas de puntuación' });
  }
});

// Función auxiliar para crear reglas por defecto
async function crearReglasDefecto() {
  const reglasDefecto = [
    // FASE DE GRUPOS
    { fase: 'FASE DE GRUPOS', concepto: 'Signo 1X2 (local, empate, visitante)', puntos: 1 },
    { fase: 'FASE DE GRUPOS', concepto: 'Diferencia de goles', puntos: 3 },
    { fase: 'FASE DE GRUPOS', concepto: 'Resultado exacto', puntos: 5 },
    
    // CLASIFICACIÓN - 16VOS
    { fase: 'CLASIFICACIÓN', concepto: 'Equipo clasificado para 16VOS', puntos: 2 },
    
    // 16VOS
    { fase: '16VOS', concepto: 'Signo 1X2 (local, empate, visitante)', puntos: 1 },
    { fase: '16VOS', concepto: 'Diferencia de goles', puntos: 3 },
    { fase: '16VOS', concepto: 'Resultado exacto', puntos: 5 },
    
    // CLASIFICACIÓN - OCTAVOS
    { fase: 'CLASIFICACIÓN', concepto: 'Equipo clasificado para OCTAVOS', puntos: 2 },
    
    // OCTAVOS
    { fase: 'OCTAVOS', concepto: 'Signo 1X2 (local, empate, visitante)', puntos: 1 },
    { fase: 'OCTAVOS', concepto: 'Diferencia de goles', puntos: 3 },
    { fase: 'OCTAVOS', concepto: 'Resultado exacto', puntos: 5 },
    
    // CLASIFICACIÓN - CUARTOS
    { fase: 'CLASIFICACIÓN', concepto: 'Equipo clasificado para CUARTOS', puntos: 3 },
    
    // CUARTOS
    { fase: 'CUARTOS', concepto: 'Signo 1X2 (local, empate, visitante)', puntos: 2 },
    { fase: 'CUARTOS', concepto: 'Diferencia de goles', puntos: 4 },
    { fase: 'CUARTOS', concepto: 'Resultado exacto', puntos: 6 },
    
    // CLASIFICACIÓN - SEMIFINALES
    { fase: 'CLASIFICACIÓN', concepto: 'Equipo clasificado para SEMIFINALES', puntos: 3 },
    
    // SEMIFINALES
    { fase: 'SEMIFINALES', concepto: 'Signo 1X2 (local, empate, visitante)', puntos: 2 },
    { fase: 'SEMIFINALES', concepto: 'Diferencia de goles', puntos: 4 },
    { fase: 'SEMIFINALES', concepto: 'Resultado exacto', puntos: 6 },
    
    // CLASIFICACIÓN - FINAL
    { fase: 'CLASIFICACIÓN', concepto: 'Equipo clasificado para LA FINAL', puntos: 5 },
    
    // FINAL
    { fase: 'FINAL', concepto: 'Signo 1X2 (local, empate, visitante)', puntos: 4 },
    { fase: 'FINAL', concepto: 'Diferencia de goles', puntos: 7 },
    { fase: 'FINAL', concepto: 'Resultado exacto', puntos: 10 },
    
    // CAMPEÓN
    { fase: 'CAMPEÓN', concepto: 'Campeón del Mundial', puntos: 20 },
    { fase: 'CAMPEÓN', concepto: 'Subcampeón', puntos: 10 },
    { fase: 'CAMPEÓN', concepto: 'Tercer Lugar', puntos: 5 }
  ];

  for (const regla of reglasDefecto) {
    await pool.query(
      'INSERT INTO mundial_puntuacion (fase, concepto, puntos) VALUES ($1, $2, $3)',
      [regla.fase, regla.concepto, regla.puntos]
    );
  }
}

export default router;
