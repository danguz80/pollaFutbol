import { pool } from './db/pool.js';

async function testNuevaLogica() {
  try {
    console.log('=== PRUEBA COMPLETA DE LA NUEVA LÓGICA ===');
    
    // 1. Restablecer estado inicial (cerrado automáticamente)
    console.log('\\n1. Simulando cierre automático inicial...');
    await pool.query(
      'UPDATE sudamericana_config SET edicion_cerrada = TRUE, cierre_automatico_ejecutado = TRUE WHERE id = 1'
    );
    
    let estado = await pool.query('SELECT * FROM sudamericana_config WHERE id = 1');
    console.log('Estado después del cierre automático:', estado.rows[0]);
    
    // 2. Admin abre manualmente
    console.log('\\n2. Admin abre manualmente...');
    await pool.query(
      'UPDATE sudamericana_config SET edicion_cerrada = FALSE, cierre_automatico_ejecutado = TRUE WHERE id = 1'
    );
    
    estado = await pool.query('SELECT * FROM sudamericana_config WHERE id = 1');
    console.log('Estado después de que admin abre:', estado.rows[0]);
    
    // 3. Evaluar si debería volver a cerrar automáticamente
    const row = estado.rows[0];
    const now = new Date();
    const cierre = new Date(row.fecha_cierre);
    
    console.log('\\n3. Evaluación de cierre automático después de apertura manual:');
    console.log('1. ¿Hay fecha de cierre?', !!row.fecha_cierre);
    console.log('2. ¿Edición NO está cerrada?', !row.edicion_cerrada);
    console.log('3. ¿Cierre automático NO ejecutado?', !row.cierre_automatico_ejecutado);
    console.log('4. ¿Fecha actual >= fecha cierre?', now >= cierre);
    
    const deberiaEjecutar = row.fecha_cierre && !row.edicion_cerrada && !row.cierre_automatico_ejecutado && (now >= cierre);
    console.log('\\n=== RESULTADO FINAL ===');
    console.log('¿Debería ejecutar cierre automático?', deberiaEjecutar);
    
    if (!deberiaEjecutar) {
      console.log('✅ PERFECTO: El sistema NO volverá a cerrar automáticamente');
      console.log('   porque cierre_automatico_ejecutado = true');
    } else {
      console.log('❌ PROBLEMA: El sistema seguiría cerrando automáticamente');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.exit();
  }
}

testNuevaLogica();
