import { pool } from './db/pool.js';

async function testCierreAutomatico() {
  try {
    console.log('=== ESTADO ACTUAL ===');
    const estado = await pool.query('SELECT * FROM sudamericana_config WHERE id = 1');
    console.log('Estado actual:', estado.rows[0]);
    
    const row = estado.rows[0];
    const now = new Date();
    const cierre = new Date(row.fecha_cierre);
    
    console.log('\\n=== ANÁLISIS DE CIERRE AUTOMÁTICO ===');
    console.log('Fecha actual:', now.toISOString());
    console.log('Fecha de cierre:', cierre.toISOString());
    console.log('Fecha actual >= fecha cierre:', now >= cierre);
    console.log('Edición cerrada:', row.edicion_cerrada);
    console.log('Cierre automático ejecutado:', row.cierre_automatico_ejecutado);
    
    console.log('\\n=== EVALUACIÓN DE CONDICIONES ===');
    console.log('1. ¿Hay fecha de cierre?', !!row.fecha_cierre);
    console.log('2. ¿Edición NO está cerrada?', !row.edicion_cerrada);
    console.log('3. ¿Cierre automático NO ejecutado?', !row.cierre_automatico_ejecutado);
    console.log('4. ¿Fecha actual >= fecha cierre?', now >= cierre);
    
    const deberiaEjecutar = row.fecha_cierre && !row.edicion_cerrada && !row.cierre_automatico_ejecutado && (now >= cierre);
    console.log('\\n=== RESULTADO ===');
    console.log('¿Debería ejecutar cierre automático?', deberiaEjecutar);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.exit();
  }
}

testCierreAutomatico();
