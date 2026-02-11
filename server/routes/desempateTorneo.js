import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';

const router = express.Router();

// POST - Aplicar criterio de desempate
router.post('/aplicar', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const { temporada, equipos, criterio, detalle, orden } = req.body;
  if (!temporada || !equipos || !criterio || !orden) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  try {
    // Eliminar desempates anteriores para estos equipos
    await pool.query(
      `DELETE FROM desempates_torneo_nacional 
       WHERE temporada = $1 AND equipos = $2`,
      [temporada, equipos]
    );
    
    // Insertar nuevo desempate
    await pool.query(
      `INSERT INTO desempates_torneo_nacional (temporada, equipos, criterio, detalle, orden, aplicado_en)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [temporada, equipos, criterio, detalle || '', orden]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error aplicando desempate:', error);
    res.status(500).json({ error: 'Error aplicando desempate' });
  }
});

export default router;
