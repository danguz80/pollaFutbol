const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// Obtener estado global de edición de pronósticos
router.get('/estado-edicion', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT edicion_cerrada FROM sudamericana_config LIMIT 1');
    res.json({ cerrada: rows[0]?.edicion_cerrada });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener estado de edición' });
  }
});

// Cambiar estado global de edición (abrir/cerrar manual)
router.patch('/cerrar', async (req, res) => {
  try {
    const { cerrada } = req.body;
    await pool.query('UPDATE sudamericana_config SET edicion_cerrada = $1', [!!cerrada]);
    res.json({ cerrada: !!cerrada });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar estado de edición' });
  }
});

// Obtener fecha/hora de cierre
router.get('/fecha-cierre', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT fecha_cierre FROM sudamericana_config LIMIT 1');
    res.json({ fecha_cierre: rows[0]?.fecha_cierre });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener fecha de cierre' });
  }
});

// Guardar fecha/hora de cierre
router.patch('/fecha-cierre', async (req, res) => {
  try {
    const { fecha_cierre } = req.body;
    await pool.query('UPDATE sudamericana_config SET fecha_cierre = $1', [fecha_cierre]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al guardar fecha de cierre' });
  }
});

// Cron simple para cierre automático (llamar desde app.js o server.js)
async function cierreAutomaticoSudamericana() {
  try {
    const { rows } = await pool.query('SELECT fecha_cierre, edicion_cerrada FROM sudamericana_config LIMIT 1');
    if (rows[0]?.fecha_cierre && !rows[0]?.edicion_cerrada) {
      const now = new Date();
      const cierre = new Date(rows[0].fecha_cierre);
      if (now >= cierre) {
        await pool.query('UPDATE sudamericana_config SET edicion_cerrada = TRUE');
        console.log('Edición de pronósticos Sudamericana cerrada automáticamente');
      }
    }
  } catch (err) {
    console.error('Error en cierre automático Sudamericana:', err);
  }
}

module.exports = { router, cierreAutomaticoSudamericana };
