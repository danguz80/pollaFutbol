import { pool } from './pool.js';

async function resetearPuntuacionMundial() {
  try {
    console.log('🗑️  Limpiando tabla mundial_puntuacion...');
    await pool.query('DELETE FROM mundial_puntuacion');

    console.log('📝 Insertando reglas de puntuación...');
    
    const reglasDefecto = [
      // FASE DE GRUPOS
      { fase: 'FASE DE GRUPOS', concepto: 'Signo 1X2 (local, empate, visitante)', puntos: 1 },
      { fase: 'FASE DE GRUPOS', concepto: 'Diferencia de goles', puntos: 3 },
      { fase: 'FASE DE GRUPOS', concepto: 'Resultado exacto', puntos: 5 },
      
      // CLASIFICACIÓN - 16VOS
      { fase: 'CLASIFICACIÓN', concepto: 'Equipo clasificado para 16VOS', puntos: 2 },
      
      // 16VOS
      { fase: '16VOS', concepto: 'Signo 1X2 (local, empate, visitante)', puntos: 1 },
      { fase: '16VOS', concepto: 'Diferencia de goles', puntos: 3 },
      { fase: '16VOS', concepto: 'Resultado exacto', puntos: 5 },
      
      // CLASIFICACIÓN - OCTAVOS
      { fase: 'CLASIFICACIÓN', concepto: 'Equipo clasificado para OCTAVOS', puntos: 2 },
      
      // OCTAVOS
      { fase: 'OCTAVOS', concepto: 'Signo 1X2 (local, empate, visitante)', puntos: 1 },
      { fase: 'OCTAVOS', concepto: 'Diferencia de goles', puntos: 3 },
      { fase: 'OCTAVOS', concepto: 'Resultado exacto', puntos: 5 },
      
      // CLASIFICACIÓN - CUARTOS
      { fase: 'CLASIFICACIÓN', concepto: 'Equipo clasificado para CUARTOS', puntos: 3 },
      
      // CUARTOS
      { fase: 'CUARTOS', concepto: 'Signo 1X2 (local, empate, visitante)', puntos: 2 },
      { fase: 'CUARTOS', concepto: 'Diferencia de goles', puntos: 4 },
      { fase: 'CUARTOS', concepto: 'Resultado exacto', puntos: 6 },
      
      // CLASIFICACIÓN - SEMIFINALES
      { fase: 'CLASIFICACIÓN', concepto: 'Equipo clasificado para SEMIFINALES', puntos: 3 },
      
      // SEMIFINALES
      { fase: 'SEMIFINALES', concepto: 'Signo 1X2 (local, empate, visitante)', puntos: 2 },
      { fase: 'SEMIFINALES', concepto: 'Diferencia de goles', puntos: 4 },
      { fase: 'SEMIFINALES', concepto: 'Resultado exacto', puntos: 6 },
      
      // CLASIFICACIÓN - FINAL
      { fase: 'CLASIFICACIÓN', concepto: 'Equipo clasificado para LA FINAL', puntos: 5 },
      
      // FINAL
      { fase: 'FINAL', concepto: 'Signo 1X2 (local, empate, visitante)', puntos: 4 },
      { fase: 'FINAL', concepto: 'Diferencia de goles', puntos: 7 },
      { fase: 'FINAL', concepto: 'Resultado exacto', puntos: 10 },
      
      // CAMPEÓN
      { fase: 'CAMPEÓN', concepto: 'Campeón del Mundial', puntos: 20 },
      { fase: 'CAMPEÓN', concepto: 'Subcampeón', puntos: 10 },
      { fase: 'CAMPEÓN', concepto: 'Tercer Lugar', puntos: 5 }
    ];

    for (const regla of reglasDefecto) {
      await pool.query(
        'INSERT INTO mundial_puntuacion (fase, concepto, puntos) VALUES ($1, $2, $3)',
        [regla.fase, regla.concepto, regla.puntos]
      );
    }

    console.log(`✅ Se insertaron ${reglasDefecto.length} reglas correctamente`);
    
    // Verificar
    const result = await pool.query('SELECT fase, COUNT(*) FROM mundial_puntuacion GROUP BY fase ORDER BY fase');
    console.log('\n📊 Reglas por fase:');
    result.rows.forEach(row => {
      console.log(`   ${row.fase}: ${row.count} reglas`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

resetearPuntuacionMundial();
