import { pool } from './db/pool.js';

async function simularAdminAbre() {
  try {
    console.log('=== SIMULANDO ADMIN ABRE MANUALMENTE ===');
    
    // Simular que el admin abre (cerrada = false)
    const result = await pool.query(
      'UPDATE sudamericana_config SET edicion_cerrada = FALSE, cierre_automatico_ejecutado = FALSE WHERE id = 1 RETURNING *'
    );
    
    console.log('Estado después de que admin abre:', result.rows[0]);
    
    const row = result.rows[0];
    const now = new Date();
    const cierre = new Date(row.fecha_cierre);
    
    console.log('\\n=== NUEVA EVALUACIÓN DE CONDICIONES ===');
    console.log('1. ¿Hay fecha de cierre?', !!row.fecha_cierre);
    console.log('2. ¿Edición NO está cerrada?', !row.edicion_cerrada);
    console.log('3. ¿Cierre automático NO ejecutado?', !row.cierre_automatico_ejecutado);
    console.log('4. ¿Fecha actual >= fecha cierre?', now >= cierre);
    
    const deberiaEjecutar = row.fecha_cierre && !row.edicion_cerrada && !row.cierre_automatico_ejecutado && (now >= cierre);
    console.log('\\n=== RESULTADO ===');
    console.log('¿Debería ejecutar cierre automático?', deberiaEjecutar);
    
    if (deberiaEjecutar) {
      console.log('\\n⚠️ IMPORTANTE: El sistema detectaría que debe cerrar automáticamente porque:');
      console.log('- La fecha ya pasó (15 julio < 19 julio)');
      console.log('- La edición está abierta');
      console.log('- El cierre automático se reseteó');
      console.log('\\n💡 PERO esto es correcto porque significa que si el admin cambia la fecha a futuro,');
      console.log('   el cierre automático funcionará de nuevo en el futuro.');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.exit();
  }
}

simularAdminAbre();
