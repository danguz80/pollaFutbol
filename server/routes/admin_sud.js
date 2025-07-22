import express from 'express';
import { pool } from '../db/pool.js';

const router = express.Router();

// Endpoint de prueba para verificar routing
router.get('/test', (req, res) => {
  console.log('✅ Test endpoint funcionando');
  res.json({ message: 'Admin SUD router funcionando correctamente' });
});

// GET /api/admin/sudamericana/estado - Verificar si la edición está cerrada
router.get('/estado', async (req, res) => {
  try {
    // Crear tabla si no existe
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sudamericana_config (
        id INTEGER PRIMARY KEY,
        edicion_cerrada BOOLEAN DEFAULT FALSE,
        fecha_cierre TIMESTAMP,
        cierre_automatico_ejecutado BOOLEAN DEFAULT FALSE
      )
    `);
    
    // Insertar fila por defecto si no existe
    await pool.query(`
      INSERT INTO sudamericana_config (id, edicion_cerrada) 
      VALUES (1, FALSE) 
      ON CONFLICT (id) DO NOTHING
    `);
    
    const { rows } = await pool.query('SELECT edicion_cerrada FROM sudamericana_config WHERE id = 1');
    res.json({ cerrada: rows[0]?.edicion_cerrada || false });
  } catch (err) {
    console.error('Error al verificar estado de edición:', err);
    res.status(500).json({ error: 'Error al verificar estado de edición' });
  }
});

// PATCH /api/admin/sudamericana/cerrar - Cerrar edición manualmente
router.patch('/cerrar', async (req, res) => {
  try {
    // Crear tabla si no existe
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sudamericana_config (
        id INTEGER PRIMARY KEY,
        edicion_cerrada BOOLEAN DEFAULT FALSE,
        fecha_cierre TIMESTAMP,
        cierre_automatico_ejecutado BOOLEAN DEFAULT FALSE
      )
    `);
    
    // Insertar o actualizar a cerrada
    await pool.query(`
      INSERT INTO sudamericana_config (id, edicion_cerrada) 
      VALUES (1, TRUE) 
      ON CONFLICT (id) DO UPDATE SET edicion_cerrada = TRUE
    `);
    
    console.log('✅ Edición de Sudamericana cerrada manualmente');
    res.json({ ok: true, message: 'Edición cerrada correctamente' });
  } catch (err) {
    console.error('Error al cerrar edición:', err);
    res.status(500).json({ error: 'Error al cerrar edición' });
  }
});

// PATCH /api/admin/sudamericana/abrir - Abrir edición manualmente
router.patch('/abrir', async (req, res) => {
  try {
    // Crear tabla si no existe
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sudamericana_config (
        id INTEGER PRIMARY KEY,
        edicion_cerrada BOOLEAN DEFAULT FALSE,
        fecha_cierre TIMESTAMP,
        cierre_automatico_ejecutado BOOLEAN DEFAULT FALSE
      )
    `);
    
    // Insertar o actualizar a abierta y resetear el flag de cierre automático
    await pool.query(`
      INSERT INTO sudamericana_config (id, edicion_cerrada, cierre_automatico_ejecutado) 
      VALUES (1, FALSE, FALSE) 
      ON CONFLICT (id) DO UPDATE SET edicion_cerrada = FALSE, cierre_automatico_ejecutado = FALSE
    `);
    
    console.log('✅ Edición de Sudamericana abierta manualmente');
    res.json({ ok: true, message: 'Edición abierta correctamente' });
  } catch (err) {
    console.error('Error al abrir edición:', err);
    res.status(500).json({ error: 'Error al abrir edición' });
  }
});

// GET /api/admin/sudamericana/fecha-cierre - Obtener fecha de cierre
router.get('/fecha-cierre', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT fecha_cierre FROM sudamericana_config WHERE id = 1');
    res.json({ fecha_cierre: rows[0]?.fecha_cierre || null });
  } catch (err) {
    console.error('Error al obtener fecha de cierre:', err);
    res.status(500).json({ error: 'Error al obtener fecha de cierre' });
  }
});

// PATCH /api/admin/sudamericana/fecha-cierre - Guardar nueva fecha de cierre
router.patch('/fecha-cierre', async (req, res) => {
  const { fecha_cierre } = req.body;
  try {
    await pool.query(`
      INSERT INTO sudamericana_config (id, fecha_cierre, cierre_automatico_ejecutado) 
      VALUES (1, $1, FALSE) 
      ON CONFLICT (id) DO UPDATE SET fecha_cierre = $1, cierre_automatico_ejecutado = FALSE
    `, [fecha_cierre]);
    
    res.json({ ok: true });
  } catch (err) {
    console.error('Error al guardar fecha de cierre:', err);
    res.status(500).json({ error: 'Error al guardar fecha de cierre' });
  }
});

export default router;
