import { pool } from './db/pool.js';

// Función simplificada que arregla solo WO.E y WO.G
async function fixWOEandWOG() {
  try {
    // Obtener pronósticos específicos del usuario 2 para los partidos WO.E y WO.G
    const result = await pool.query(`
      SELECT p.fixture_id, p.goles_local, p.goles_visita, p.penales_local, p.penales_visita,
             f.equipo_local, f.equipo_visita, f.clasificado
      FROM pronosticos_sudamericana p
      JOIN sudamericana_fixtures f ON p.fixture_id = f.fixture_id
      WHERE p.usuario_id = 2 AND f.clasificado IN ('WO.E', 'WO.G') AND f.ronda = 'Octavos de Final'
      ORDER BY f.clasificado, f.fixture_id
    `);
    
    console.log('Pronósticos específicos para WO.E y WO.G:');
    
    // Agrupar por clasificado
    const grupos = {};
    result.rows.forEach(row => {
      if (!grupos[row.clasificado]) grupos[row.clasificado] = [];
      grupos[row.clasificado].push(row);
    });
    
    for (const [sigla, partidos] of Object.entries(grupos)) {
      console.log(`\n${sigla}:`);
      
      if (partidos.length === 2) {
        // Identificar equipos reales desde el primer partido
        const equipo1 = partidos[0].equipo_local;
        const equipo2 = partidos[0].equipo_visita;
        
        let goles1 = 0;
        let goles2 = 0;
        
        for (const partido of partidos) {
          console.log(`  ${partido.equipo_local} vs ${partido.equipo_visita}: ${partido.goles_local}-${partido.goles_visita}`);
          
          if (partido.equipo_local === equipo1) {
            goles1 += partido.goles_local;
            goles2 += partido.goles_visita;
          } else {
            goles1 += partido.goles_visita;
            goles2 += partido.goles_local;
          }
        }
        
        console.log(`  Total: ${equipo1} ${goles1} - ${goles2} ${equipo2}`);
        
        let ganador;
        if (goles1 > goles2) {
          ganador = equipo1;
        } else if (goles2 > goles1) {
          ganador = equipo2;
        } else {
          ganador = 'Empate';
        }
        
        console.log(`  Ganador: ${ganador}`);
      }
    }
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixWOEandWOG();
