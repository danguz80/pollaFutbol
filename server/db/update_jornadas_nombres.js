import { pool } from './pool.js';

async function updateJornadasNombres() {
  try {
    console.log('🔄 Actualizando nombres de jornadas...');

    const updates = [
      { numero: 1, nombre: 'Jornada 1 - Fase de Grupos' },
      { numero: 2, nombre: 'Jornada 2 - Fase de Grupos' },
      { numero: 3, nombre: 'Jornada 3 - Fase de Grupos' },
      { numero: 4, nombre: 'Jornada 4 - Fase de Grupos' },
      { numero: 5, nombre: 'Jornada 5 - Fase de Grupos' },
      { numero: 6, nombre: 'Jornada 6 - Fase de Grupos' },
      { numero: 7, nombre: 'Octavos de Final IDA' },
      { numero: 8, nombre: 'Octavos de Final VUELTA' },
      { numero: 9, nombre: 'Cuartos de Final IDA/VUELTA' },
      { numero: 10, nombre: 'Semifinales IDA/VUELTA + Final + Cuadro Final' }
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
