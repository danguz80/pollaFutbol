import { pool } from './db/pool.js';

function getSigno(golesLocal, golesVisita) {
  if (golesLocal > golesVisita) return '1';
  if (golesLocal < golesVisita) return '2';
  return 'X';
}

function getFaseDeJornada(jornadaNumero) {
  if (jornadaNumero >= 1 && jornadaNumero <= 3) return 'FASE DE GRUPOS';
  if (jornadaNumero === 4) return '16VOS';
  if (jornadaNumero === 5) return 'OCTAVOS';
  if (jornadaNumero === 6) return 'CUARTOS';
  if (jornadaNumero === 7) return 'SEMIFINALES';
  return 'FASE DE GRUPOS';
}

async function recalcularJornada4() {
  try {
    console.log('🔄 Recalculando Jornada 4 para TODOS los usuarios...');
    
    const reglasResult = await pool.query('SELECT * FROM mundial_puntuacion ORDER BY puntos DESC');
    const reglas = reglasResult.rows;

    const pronosticosResult = await pool.query(`
      SELECT 
        mp.id, mp.usuario_id, u.nombre,
        mp.resultado_local as pronostico_local,
        mp.resultado_visitante as pronostico_visita,
        p.id as partido_id, p.resultado_local, p.resultado_visitante,
        p.equipo_local, p.equipo_visitante, p.bonus,
        mj.numero as jornada_numero
      FROM mundial_pronosticos mp
      INNER JOIN mundial_partidos p ON mp.partido_id = p.id
      INNER JOIN mundial_jornadas mj ON mp.jornada_id = mj.id
      INNER JOIN usuarios u ON mp.usuario_id = u.id
      WHERE mj.numero = 4
        AND p.resultado_local IS NOT NULL 
        AND p.resultado_visitante IS NOT NULL
    `);

    let puntosActualizados = 0;
    let usuariosCont = {};
    
    for (const pronostico of pronosticosResult.rows) {
      const {
        id, usuario_id, nombre, pronostico_local, pronostico_visita, resultado_local, resultado_visitante,
        bonus, jornada_numero, equipo_local, equipo_visitante
      } = pronostico;

      const bonusMultiplicador = bonus || 1;
      const fase = getFaseDeJornada(jornada_numero);
      
      const puntosSigno = reglas.find(r => r.fase === fase && r.concepto.includes('Signo'))?.puntos || 1;
      const puntosDiferencia = reglas.find(r => r.fase === fase && r.concepto.includes('Diferencia'))?.puntos || 3;
      const puntosExacto = reglas.find(r => r.fase === fase && r.concepto.includes('exacto'))?.puntos || 5;

      let puntosGanados = 0;
      
      if (pronostico_local === resultado_local && pronostico_visita === resultado_visitante) {
        puntosGanados = puntosExacto;
      } else if (Math.abs(pronostico_local - pronostico_visita) === Math.abs(resultado_local - resultado_visitante)) {
        const signoPronostico = getSigno(pronostico_local, pronostico_visita);
        const signoResultado = getSigno(resultado_local, resultado_visitante);
        if (signoPronostico === signoResultado) {
          puntosGanados = puntosDiferencia;
        }
      } else {
        const signoPronostico = getSigno(pronostico_local, pronostico_visita);
        const signoResultado = getSigno(resultado_local, resultado_visitante);
        if (signoPronostico === signoResultado) {
          puntosGanados = puntosSigno;
        }
      }

      const puntosFinales = puntosGanados * bonusMultiplicador;

      if (nombre === 'Jorge Diaz') {
        console.log(`  [Jorge] ${equipo_local} vs ${equipo_visitante}: ${pronostico_local}-${pronostico_visita} vs ${resultado_local}-${resultado_visitante} (bonus ${bonus}) = ${puntosGanados} × ${bonusMultiplicador} = ${puntosFinales} pts`);
      }

      await pool.query('UPDATE mundial_pronosticos SET puntos = $1 WHERE id = $2', [puntosFinales, id]);
      puntosActualizados++;
      
      if (!usuariosCont[usuario_id]) usuariosCont[usuario_id] = 0;
      usuariosCont[usuario_id]++;
    }

    // Limpiar clasificación
    await pool.query('DELETE FROM mundial_puntos_clasificacion');
    console.log('✅ Puntos de clasificación limpiados');

    console.log(`✅ ${puntosActualizados} pronósticos recalculados para ${Object.keys(usuariosCont).length} usuarios`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

recalcularJornada4();
