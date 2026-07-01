import { pool } from './db/pool.js';

async function recalcularTodasJornadas() {
  try {
    console.log('🔄 Recalculando TODAS las jornadas con nuevo código...\n');
    
    for (let j = 1; j <= 7; j++) {
      console.log(`\n📌 Recalculando Jornada ${j}...`);
      
      // Llamar al endpoint POST /api/mundial-calcular/puntos
      const response = await fetch('http://localhost:3001/api/mundial-calcular/puntos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer dummy_token_for_testing'
        },
        body: JSON.stringify({ jornadaNumero: j })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        console.log(`   ✅ ${result.mensaje}`);
      } else {
        console.log(`   ⚠️ Error: ${result.error}`);
      }
    }
    
    console.log('\n\n✅ Todas las jornadas recalculadas');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

recalcularTodasJornadas();
