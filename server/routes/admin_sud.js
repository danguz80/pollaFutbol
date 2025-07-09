import express from 'express';
import { pool } from '../db/pool.js';

const router = express.Router();

// Obtener estado global de edición de pronósticos
router.get('/estado-edicion', async (req, res) => {
  try {
    // Crear tabla si no existe
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sudamericana_config (
        id INTEGER PRIMARY KEY,
        edicion_cerrada BOOLEAN DEFAULT FALSE,
        fecha_cierre TIMESTAMP
      )
    `);
    
    // Insertar fila por defecto si no existe
    await pool.query(`
      INSERT INTO sudamericana_config (id, edicion_cerrada, fecha_cierre) 
      VALUES (1, FALSE, NULL) 
      ON CONFLICT (id) DO NOTHING
    `);
    
    const { rows } = await pool.query('SELECT edicion_cerrada FROM sudamericana_config WHERE id = 1');
    res.json({ cerrada: rows[0]?.edicion_cerrada || false });
  } catch (err) {
    console.error('Error al obtener estado de edición:', err);
    res.status(500).json({ error: 'Error al obtener estado de edición' });
  }
});

// Cambiar estado global de edición (abrir/cerrar manual)
router.patch('/cerrar', async (req, res) => {
  try {
    const { cerrada } = req.body;
    console.log('Recibido estado cerrada:', cerrada);
    
    // Crear tabla si no existe
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sudamericana_config (
        id INTEGER PRIMARY KEY,
        edicion_cerrada BOOLEAN DEFAULT FALSE,
        fecha_cierre TIMESTAMP
      )
    `);
    
    // Insertar o actualizar
    const result = await pool.query(`
      INSERT INTO sudamericana_config (id, edicion_cerrada, fecha_cierre) 
      VALUES (1, $1, NULL) 
      ON CONFLICT (id) DO UPDATE SET edicion_cerrada = $1
      RETURNING edicion_cerrada
    `, [!!cerrada]);
    
    console.log('Estado actualizado en BD:', result.rows[0]?.edicion_cerrada);
    res.json({ cerrada: !!cerrada });
  } catch (err) {
    console.error('Error al actualizar estado de edición:', err);
    res.status(500).json({ error: 'Error al actualizar estado de edición' });
  }
});

// Obtener fecha/hora de cierre
router.get('/fecha-cierre', async (req, res) => {
  try {
    // Crear tabla si no existe
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sudamericana_config (
        id INTEGER PRIMARY KEY,
        edicion_cerrada BOOLEAN DEFAULT FALSE,
        fecha_cierre TIMESTAMP
      )
    `);
    
    // Insertar fila por defecto si no existe
    await pool.query(`
      INSERT INTO sudamericana_config (id, edicion_cerrada, fecha_cierre) 
      VALUES (1, FALSE, NULL) 
      ON CONFLICT (id) DO NOTHING
    `);
    
    const { rows } = await pool.query('SELECT fecha_cierre FROM sudamericana_config WHERE id = 1');
    res.json({ fecha_cierre: rows[0]?.fecha_cierre });
  } catch (err) {
    console.error('Error al obtener fecha de cierre:', err);
    res.status(500).json({ error: 'Error al obtener fecha de cierre' });
  }
});

// Guardar fecha/hora de cierre
router.patch('/fecha-cierre', async (req, res) => {
  try {
    const { fecha_cierre } = req.body;
    
    // Crear tabla si no existe
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sudamericana_config (
        id INTEGER PRIMARY KEY,
        edicion_cerrada BOOLEAN DEFAULT FALSE,
        fecha_cierre TIMESTAMP
      )
    `);
    
    // Insertar o actualizar
    await pool.query(`
      INSERT INTO sudamericana_config (id, edicion_cerrada, fecha_cierre) 
      VALUES (1, FALSE, $1) 
      ON CONFLICT (id) DO UPDATE SET fecha_cierre = $1
    `, [fecha_cierre]);
    
    res.json({ ok: true });
  } catch (err) {
    console.error('Error al guardar fecha de cierre:', err);
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

export { router, cierreAutomaticoSudamericana };
