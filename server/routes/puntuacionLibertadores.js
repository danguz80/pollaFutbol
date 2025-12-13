import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';

const router = express.Router();

// GET /api/libertadores-puntuacion/reglas - Obtener todas las reglas de puntuación
router.get('/reglas', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM libertadores_puntuacion
      ORDER BY id
    `);

    // Si no hay reglas, crear las por defecto
    if (result.rows.length === 0) {
      await crearReglasDefecto();
      const newResult = await pool.query(`
        SELECT * FROM libertadores_puntuacion
        ORDER BY id
      `);
      return res.json(newResult.rows);
    }

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo reglas de puntuación:', error);
    res.status(500).json({ error: 'Error obteniendo reglas de puntuación' });
  }
});

// PUT /api/libertadores-puntuacion/reglas - Actualizar reglas de puntuación (Admin)
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
          'UPDATE libertadores_puntuacion SET puntos = $1 WHERE id = $2',
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
    { fase: 'FASE DE GRUPOS', concepto: 'Posición exacta (1º)', puntos: 3 },
    { fase: 'FASE DE GRUPOS', concepto: 'Posición exacta (2º)', puntos: 2 },
    { fase: 'FASE DE GRUPOS', concepto: 'Posición exacta (3º)', puntos: 2 },
    { fase: 'FASE DE GRUPOS', concepto: 'Posición exacta (4º)', puntos: 2 },
    
    // OCTAVOS
    { fase: 'CLASIFICACIÓN', concepto: 'Equipo clasificado para OCTAVOS', puntos: 2 },
    { fase: 'OCTAVOS', concepto: 'Signo 1X2 (local, empate, visitante)', puntos: 1 },
    { fase: 'OCTAVOS', concepto: 'Diferencia de goles', puntos: 3 },
    { fase: 'OCTAVOS', concepto: 'Resultado exacto', puntos: 5 },
    
    // CUARTOS
    { fase: 'CLASIFICACIÓN', concepto: 'Equipo clasificado para CUARTOS', puntos: 3 },
    { fase: 'CUARTOS', concepto: 'Signo 1X2 (local, empate, visitante)', puntos: 2 },
    { fase: 'CUARTOS', concepto: 'Diferencia de goles', puntos: 4 },
    { fase: 'CUARTOS', concepto: 'Resultado exacto', puntos: 6 },
    
    // SEMIFINALES
    { fase: 'CLASIFICACIÓN', concepto: 'Equipo clasificado para SEMIFINALES', puntos: 3 },
    { fase: 'SEMIFINALES', concepto: 'Signo 1X2 (local, empate, visitante)', puntos: 2 },
    { fase: 'SEMIFINALES', concepto: 'Diferencia de goles', puntos: 4 },
    { fase: 'SEMIFINALES', concepto: 'Resultado exacto', puntos: 6 },
    
    // FINAL
    { fase: 'CLASIFICACIÓN', concepto: 'Equipo clasificado para LA FINAL', puntos: 5 },
    { fase: 'FINAL', concepto: 'Signo 1X2 (local, empate, visitante)', puntos: 4 },
    { fase: 'FINAL', concepto: 'Diferencia de goles', puntos: 7 },
    { fase: 'FINAL', concepto: 'Resultado exacto', puntos: 10 },
    
    // CAMPEÓN
    { fase: 'CAMPEÓN', concepto: 'Campeón', puntos: 15 },
    { fase: 'CAMPEÓN', concepto: 'Subcampeón', puntos: 8 }
  ];

  for (const regla of reglasDefecto) {
    await pool.query(
      'INSERT INTO libertadores_puntuacion (fase, concepto, puntos) VALUES ($1, $2, $3)',
      [regla.fase, regla.concepto, regla.puntos]
    );
  }
}

export default router;
