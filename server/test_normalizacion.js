// Test para verificar la corrección de Central Córdoba

function testNormalizacion() {
  const normalizar = (str) => {
    if (!str) return '';
    let normalizado = str.toString().trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
    
    // FIX: Normalización específica para equipos con nombres similares
    // Central Córdoba vs Central Cordoba de Santiago
    if (normalizado.includes('central cordoba')) {
      normalizado = normalizado.replace(/central cordoba.*/, 'central cordoba');
    }
    
    return normalizado;
  };

  // Casos de prueba
  const casos = [
    { real: "Central Córdoba", pronosticado: "Central Cordoba de Santiago" },
    { real: "Central Cordoba", pronosticado: "Central Córdoba de Santiago" },
    { real: "Racing Club", pronosticado: "Racing" },
    { real: "Boca Juniors", pronosticado: "Boca Juniors" }
  ];

  console.log('🧪 PRUEBAS DE NORMALIZACIÓN:\n');
  
  casos.forEach((caso, index) => {
    const realNorm = normalizar(caso.real);
    const pronNorm = normalizar(caso.pronosticado);
    const coincide = realNorm === pronNorm;
    
    console.log(`Caso ${index + 1}:`);
    console.log(`  Real: "${caso.real}" → "${realNorm}"`);
    console.log(`  Pron: "${caso.pronosticado}" → "${pronNorm}"`);
    console.log(`  ¿Coincide? ${coincide ? '✅' : '❌'}\n`);
  });
}

testNormalizacion();
