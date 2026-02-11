import { pool } from './db/pool.js';

async function activarJornadasGrupos() {
  try {
    console.log('🔄 Activando jornadas de fase de grupos del Mundial...\n');

    // Activar jornadas 1, 2 y 3
    await pool.query(`
      UPDATE mundial_jornadas 
      SET activa = true 
      WHERE numero IN (1, 2, 3)
    `);

    console.log('✅ Jornadas 1, 2 y 3 activadas exitosamente!');
    
    // Verificar
    const result = await pool.query(`
      SELECT numero, nombre, activa, cerrada 
      FROM mundial_jornadas 
      ORDER BY numero
    `);
    
    console.log('\n📋 Estado actual de las jornadas:');
    result.rows.forEach(j => {
      const estado = j.activa ? '✅ ACTIVA' : '⏸️  Inactiva';
      const cerrada = j.cerrada ? '🔒 Cerrada' : '🔓 Abierta';
      console.log(`   J${j.numero}: ${j.nombre} - ${estado}, ${cerrada}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

activarJornadasGrupos();
