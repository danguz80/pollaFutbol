import express from 'express';
import { pool } from '../db/pool.js';

const router = express.Router();

// Endpoint de prueba para verificar routing
router.get('/test', (req, res) => {
  console.log('✅ Test endpoint funcionando');
  res.json({ message: 'Admin SUD router funcionando correctamente' });
});

// Obtener estado global de edición de pronósticos
router.get('/estado-edicion', async (req, res) => {
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
      INSERT INTO sudamericana_config (id, edicion_cerrada, fecha_cierre, cierre_automatico_ejecutado) 
      VALUES (1, FALSE, NULL, FALSE) 
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
    console.log('🔍 Recibida petición PATCH /cerrar');
    console.log('Body:', req.body);
    
    const { cerrada } = req.body;    
    // Validar que cerrada sea booleano
    const estadoCerrada = Boolean(cerrada);
    console.log('Estado cerrada convertido:', estadoCerrada);
    
    // Crear tabla si no existe
    console.log('🔧 Creando tabla si no existe...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sudamericana_config (
        id INTEGER PRIMARY KEY,
        edicion_cerrada BOOLEAN DEFAULT FALSE,
        fecha_cierre TIMESTAMP,
        cierre_automatico_ejecutado BOOLEAN DEFAULT FALSE
      )
    `);
    console.log('✅ Tabla verificada/creada');
    
    // Insertar fila por defecto si no existe
    console.log('🔧 Insertando fila por defecto...');
    await pool.query(`
      INSERT INTO sudamericana_config (id, edicion_cerrada, fecha_cierre, cierre_automatico_ejecutado) 
      VALUES (1, FALSE, NULL, FALSE) 
      ON CONFLICT (id) DO NOTHING
    `);
    console.log('✅ Fila por defecto verificada/insertada');
    
    // Actualizar estado - EL BOTÓN MANUAL NO TOCA EL CAMPO DE CIERRE AUTOMÁTICO
    console.log('🔧 Actualizando estado...');
    const result = await pool.query(
      'UPDATE sudamericana_config SET edicion_cerrada = $1 WHERE id = 1 RETURNING edicion_cerrada',
      [estadoCerrada]
    );
    
    console.log('Resultado UPDATE:', result.rows);
    
    if (result.rows.length === 0) {
      throw new Error('No se pudo actualizar el estado - fila no encontrada');
    }
    
    const estadoActualizado = result.rows[0].edicion_cerrada;
    console.log('✅ Estado actualizado:', estadoActualizado);
    
    res.json({ cerrada: estadoActualizado, edicion_cerrada: estadoActualizado });
  } catch (err) {
    console.error('❌ Error completo al actualizar estado de edición:', err);
    console.error('Stack trace:', err.stack);
    res.status(500).json({ error: 'No se pudo actualizar el estado de la jornada' });
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
        fecha_cierre TIMESTAMP,
        cierre_automatico_ejecutado BOOLEAN DEFAULT FALSE
      )
    `);
    
    // Insertar fila por defecto si no existe
    await pool.query(`
      INSERT INTO sudamericana_config (id, edicion_cerrada, fecha_cierre, cierre_automatico_ejecutado) 
      VALUES (1, FALSE, NULL, FALSE) 
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
        fecha_cierre TIMESTAMP,
        cierre_automatico_ejecutado BOOLEAN DEFAULT FALSE
      )
    `);
    
    console.log(`📅 Guardando fecha de cierre: ${fecha_cierre}`);
    
    // Insertar o actualizar (resetear cierre_automatico_ejecutado cuando se actualiza fecha)
    await pool.query(`
      INSERT INTO sudamericana_config (id, edicion_cerrada, fecha_cierre, cierre_automatico_ejecutado) 
      VALUES (1, FALSE, $1, FALSE) 
      ON CONFLICT (id) DO UPDATE SET fecha_cierre = $1, cierre_automatico_ejecutado = FALSE
    `, [fecha_cierre]);
    
    res.json({ ok: true });
  } catch (err) {
    console.error('Error al guardar fecha de cierre:', err);
    res.status(500).json({ error: 'Error al guardar fecha de cierre' });
  }
});

export default router;);

// Cron simple para cierre automático (llamar desde app.js o server.js)
async function cierreAutomaticoSudamericana() {
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
      INSERT INTO sudamericana_config (id, edicion_cerrada, fecha_cierre, cierre_automatico_ejecutado) 
      VALUES (1, FALSE, NULL, FALSE) 
      ON CONFLICT (id) DO NOTHING
    `);
    
    const { rows } = await pool.query('SELECT fecha_cierre, edicion_cerrada, cierre_automatico_ejecutado FROM sudamericana_config WHERE id = 1');
    
    if (rows[0]?.fecha_cierre) {
      // Ajustar la hora actual con el desfase correcto (2 horas adicionales a Chile)
      const now = new Date();
      const nowAjustado = new Date(now.getTime() - (1 * 60 * 60 * 1000)); // GMT-1 (Chile + 2h de ajuste)
      const cierreUTC = new Date(rows[0].fecha_cierre);
      
      console.log(`⏰ Verificando cierre automático Sudamericana:`);
      console.log(`   Hora actual ajustada: ${nowAjustado.toISOString()}`);
      console.log(`   Fecha de cierre:      ${cierreUTC.toISOString()}`);
      console.log(`   Ya ejecutado:         ${rows[0]?.cierre_automatico_ejecutado}`);
      console.log(`   Debe cerrar:          ${nowAjustado >= cierreUTC && !rows[0]?.cierre_automatico_ejecutado}`);
      
      if (nowAjustado >= cierreUTC && !rows[0]?.cierre_automatico_ejecutado) {
        console.log('� EJECUTANDO CIERRE AUTOMÁTICO DE SUDAMERICANA');
        await pool.query(
          'UPDATE sudamericana_config SET edicion_cerrada = TRUE, cierre_automatico_ejecutado = TRUE WHERE id = 1'
        );
        console.log('✅ Cierre automático completado');
      }
    }
  } catch (err) {
    console.error('❌ Error en cierre automático Sudamericana:', err);
  }
}

export default router;
