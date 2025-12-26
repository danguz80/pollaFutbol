import { pool } from '../db/pool.js';

const ganadores = [
  { jornada: '11', nombre: 'Alejandro Varas' },
  { jornada: '12', nombre: 'Gerson Gonzalez' },
  { jornada: '13', nombre: 'Daniel Guzman' },
  { jornada: '14', nombre: 'Luis Castillo' },
  { jornada: '15', nombre: 'Miguel Abad' },
  { jornada: '16', nombre: 'Juan Oyanedel' },
  { jornada: '17', nombre: 'Gustavo Ugarte' },
  { jornada: '18', nombre: 'Juan Oyanedel' },
  { jornada: '19', nombre: 'Daniel Guzman' },
  { jornada: '20', nombre: 'Gerson Gonzalez' },
  { jornada: '21', nombre: 'Jorge Diaz' },
  { jornada: '22', nombre: 'Juan Oyanedel' },
  { jornada: '23', nombre: 'Jorge Silva' },
  { jornada: '24', nombre: 'Raul Pinto' },
  { jornada: '25', nombre: 'Daniel Guzman' },
  { jornada: '26', nombre: 'Jorge Silva' },
  { jornada: '27', nombre: 'Juan Oyanedel' },
  { jornada: '28', nombre: 'Raul Pinto' },
  { jornada: '29', nombre: 'Raul Pinto' },
  { jornada: '30', nombre: 'Luis Castillo' },
  { jornada: '30', nombre: 'Juan Oyanedel' },
  { jornada: '999', nombre: 'Juan Amestica' },
  { jornada: '999', nombre: 'Juan Oyanedel' }
];

async function restaurarGanadores() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('🔄 Restaurando ganadores del Torneo Nacional 2025...');
    
    let insertados = 0;
    let errores = 0;
    
    for (const ganador of ganadores) {
      try {
        // Buscar el ID del usuario
        const usuarioResult = await client.query(
          'SELECT id FROM usuarios WHERE nombre = $1',
          [ganador.nombre]
        );
        
        if (usuarioResult.rows.length === 0) {
          console.log(`⚠️ Usuario no encontrado: ${ganador.nombre}`);
          errores++;
          continue;
        }
        
        const usuario_id = usuarioResult.rows[0].id;
        
        // Calcular posición para esta jornada
        const posicionResult = await client.query(`
          SELECT COALESCE(MAX(posicion), 0) + 1 as posicion
          FROM rankings_historicos
          WHERE anio = 2025 
            AND competencia = 'Torneo Nacional'
            AND tipo = 'estandar'
            AND categoria = $1
        `, [ganador.jornada]);
        
        const posicion = posicionResult.rows[0].posicion;
        
        // Insertar en rankings_historicos
        await client.query(`
          INSERT INTO rankings_historicos 
            (anio, competencia, tipo, categoria, usuario_id, nombre_manual, posicion, puntos)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (anio, competencia, categoria, usuario_id, nombre_manual, posicion)
          DO NOTHING
        `, [2025, 'Torneo Nacional', 'estandar', ganador.jornada, usuario_id, null, posicion, 0]);
        
        console.log(`✅ Jornada ${ganador.jornada}: ${ganador.nombre} (posición ${posicion})`);
        insertados++;
        
      } catch (error) {
        console.error(`❌ Error con ${ganador.nombre} en jornada ${ganador.jornada}:`, error.message);
        errores++;
      }
    }
    
    await client.query('COMMIT');
    
    console.log('\n📊 Resumen:');
    console.log(`✅ Ganadores insertados: ${insertados}`);
    console.log(`❌ Errores: ${errores}`);
    console.log('\n🎉 Proceso completado');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error en el proceso:', error);
  } finally {
    client.release();
    process.exit(0);
  }
}

restaurarGanadores();
