import { pool } from './pool.js';

async function actualizarNombresJornadasMundial() {
  try {
    console.log('🔄 Actualizando nombres de jornadas del Mundial...');

    await pool.query(`
      UPDATE mundial_jornadas SET nombre = 'Jornada 1 - Fase de Grupos', descripcion = 'Primera fecha de la fase de grupos' WHERE numero = 1;
      UPDATE mundial_jornadas SET nombre = 'Jornada 2 - Fase de Grupos', descripcion = 'Segunda fecha de la fase de grupos' WHERE numero = 2;
      UPDATE mundial_jornadas SET nombre = 'Jornada 3 - Fase de Grupos', descripcion = 'Tercera fecha de la fase de grupos' WHERE numero = 3;
      UPDATE mundial_jornadas SET nombre = 'Jornada 4 - 16vos de Final', descripcion = '16vos de final (16 partidos)' WHERE numero = 4;
      UPDATE mundial_jornadas SET nombre = 'Jornada 5 - Octavos de Final', descripcion = 'Octavos de final (8 partidos)' WHERE numero = 5;
      UPDATE mundial_jornadas SET nombre = 'Jornada 6 - Cuartos de Final', descripcion = 'Cuartos de final (4 partidos)' WHERE numero = 6;
      UPDATE mundial_jornadas SET nombre = 'Jornada 7 - Finales', descripcion = 'Semifinales, tercer lugar y final (5 partidos)' WHERE numero = 7;
    `);

    console.log('✅ Nombres de jornadas actualizados correctamente!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error actualizando nombres:', error);
    process.exit(1);
  }
}

actualizarNombresJornadasMundial();
