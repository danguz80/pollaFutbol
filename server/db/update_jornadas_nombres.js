import { pool } from './pool.js';

async function updateJornadasNombres() {
  try {
    console.log('🔄 Actualizando nombres de jornadas...');

    const updates = [
      { numero: 1, nombre: 'Jornada 1' },
      { numero: 2, nombre: 'Jornada 2' },
      { numero: 3, nombre: 'Jornada 3' },
      { numero: 4, nombre: 'Jornada 4' },
      { numero: 5, nombre: 'Jornada 5' },
      { numero: 6, nombre: 'Jornada 6' },
      { numero: 7, nombre: 'Jornada 7' },
      { numero: 8, nombre: 'Jornada 8' },
      { numero: 9, nombre: 'Jornada 9' },
      { numero: 10, nombre: 'Jornada 10' }
    ];

    for (const jornada of updates) {
      await pool.query(
        'UPDATE libertadores_jornadas SET nombre = $1 WHERE numero = $2',
        [jornada.nombre, jornada.numero]
      );
      console.log(`✅ Jornada ${jornada.numero}: ${jornada.nombre}`);
    }

    console.log('✅ Nombres de jornadas actualizados correctamente');
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error actualizando nombres:', error);
    await pool.end();
    process.exit(1);
  }
}

updateJornadasNombres();
