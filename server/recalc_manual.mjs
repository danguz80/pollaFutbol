import { pool } from './db/pool.js';

// Función auxiliar para determinar el signo
function getSigno(golesLocal, golesVisita) {
  if (golesLocal > golesVisita) return '1';
  if (golesLocal < golesVisita) return '2';
  return 'X';
}

// Función auxiliar para determinar la fase según la jornada
function getFaseDeJornada(jornadaNumero) {
  if (jornadaNumero >= 1 && jornadaNumero <= 3) return 'FASE DE GRUPOS';
  if (jornadaNumero === 4) return '16VOS';
  if (jornadaNumero === 5) return 'OCTAVOS';
  if (jornadaNumero === 6) return 'CUARTOS';
  if (jornadaNumero === 7) return 'SEMIFINALES';
  return 'FASE DE GRUPOS';
}

// Importar funciones
import { calcularTablaOficial, calcularTablaUsuario, calcularMejoresTercerosUsuario } from './utils/calcularClasificadosMundial.js';

async function recalcularJornada(jornadaNumero) {
  console.log(`\n📌 RECALCULANDO JORNADA ${jornadaNumero}...`);
  
  try {
    const reglasResult = await pool.query('SELECT * FROM mundial_puntuacion ORDER BY puntos DESC');
    const reglas = reglasResult.rows;

    // 1. Recalcular puntos de partidos
    const pronosticosResult = await pool.query(`
      SELECT 
        mp.id, mp.resultado_local as pronostico_local,
        mp.resultado_visitante as pronostico_visita,
        mp.quien_avanza as pronostico_quien_avanza,
        p.resultado_local, p.resultado_visitante, p.quien_avanzo,
        p.bonus, mj.numero as jornada_numero
      FROM mundial_pronosticos mp
      INNER JOIN mundial_partidos p ON mp.partido_id = p.id
      INNER JOIN mundial_jornadas mj ON mp.jornada_id = mj.id
      WHERE mj.numero = $1 AND p.resultado_local IS NOT NULL AND p.resultado_visitante IS NOT NULL
    `, [jornadaNumero]);

    let puntosActualizados = 0;
    const fase = getFaseDeJornada(jornadaNumero);
    const puntosSigno = reglas.find(r => r.fase === fase && r.concepto.includes('Signo'))?.puntos || 1;
    const puntosDiferencia = reglas.find(r => r.fase === fase && r.concepto.includes('Diferencia'))?.puntos || 3;
    const puntosExacto = reglas.find(r => r.fase === fase && r.concepto.includes('exacto'))?.puntos || 5;

    for (const p of pronosticosResult.rows) {
      let puntosGanados = 0;
      
      if (p.pronostico_local === p.resultado_local && p.pronostico_visita === p.resultado_visitante) {
        puntosGanados = puntosExacto;
      } else if (Math.abs(p.pronostico_local - p.pronostico_visita) === Math.abs(p.resultado_local - p.resultado_visitante)) {
        const signoPronostico = getSigno(p.pronostico_local, p.pronostico_visita);
        const signoResultado = getSigno(p.resultado_local, p.resultado_visitante);
        if (signoPronostico === signoResultado) {
          puntosGanados = puntosDiferencia;
        }
      } else {
        const signoPronostico = getSigno(p.pronostico_local, p.pronostico_visita);
        const signoResultado = getSigno(p.resultado_local, p.resultado_visitante);
        if (signoPronostico === signoResultado) {
          puntosGanados = puntosSigno;
        }
      }

      if (jornadaNumero >= 4 && p.resultado_local === p.resultado_visitante &&
          p.pronostico_local === p.pronostico_visita && p.quien_avanzo && p.pronostico_quien_avanza === p.quien_avanzo) {
        puntosGanados += 2;
      }

      const puntosFinales = puntosGanados * (p.bonus || 1);
      await pool.query('UPDATE mundial_pronosticos SET puntos = $1 WHERE id = $2', [puntosFinales, p.id]);
      puntosActualizados++;
    }

    console.log(`   ✅ ${puntosActualizados} pronósticos actualizados`);

    // 2. Recalcular clasificación para J3
    if (jornadaNumero === 3) {
      console.log(`   🔄 Calculando clasificación a 16vos...`);
      
      const gruposResult = await pool.query(
        `SELECT DISTINCT grupo FROM mundial_partidos WHERE grupo IS NOT NULL ORDER BY grupo`
      );
      const grupos = gruposResult.rows.map(r => r.grupo);

      const real32 = new Set();
      for (const grupo of grupos) {
        const tabla = await calcularTablaOficial(grupo, [1, 2, 3]);
        if (tabla.length >= 2 && tabla[0].pj > 0) {
          real32.add(tabla[0].nombre);
          real32.add(tabla[1].nombre);
        }
      }

      const mejoresTercerosResult = await pool.query('SELECT equipo FROM mundial_mejores_terceros');
      mejoresTercerosResult.rows.forEach(r => real32.add(r.equipo));

      const usuariosResult = await pool.query(
        `SELECT DISTINCT u.id FROM usuarios u
         INNER JOIN mundial_pronosticos mp ON u.id = mp.usuario_id
         INNER JOIN mundial_jornadas mj ON mp.jornada_id = mj.id
         WHERE mj.numero IN (1,2,3) AND u.rol != 'admin'`
      );

      for (const { id: uid } of usuariosResult.rows) {
        await pool.query(`DELETE FROM mundial_puntos_clasificacion WHERE usuario_id = $1 AND fase LIKE '16VOS_%'`, [uid]);
        await pool.query(`DELETE FROM mundial_mejores_terceros_usuario WHERE usuario_id = $1`, [uid]);

        const predicciones = [];

        for (const grupo of grupos) {
          const tablaUser = await calcularTablaUsuario(uid, grupo, [1, 2, 3]);
          if (tablaUser.length >= 2) {
            predicciones.push({ equipo: tablaUser[0].nombre, fase: `16VOS_GRUPO_${grupo}_POS1` });
            predicciones.push({ equipo: tablaUser[1].nombre, fase: `16VOS_GRUPO_${grupo}_POS2` });
          }
        }

        const mejoresTercerosUser = await calcularMejoresTercerosUsuario(uid, grupos, [1, 2, 3]);
        for (let i = 0; i < mejoresTercerosUser.length; i++) {
          const t = mejoresTercerosUser[i];
          await pool.query(
            `INSERT INTO mundial_mejores_terceros_usuario
               (usuario_id, equipo, grupo, puntos_grupo, dif_grupo, gf_grupo, posicion_virtual)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (usuario_id, grupo) DO UPDATE
               SET equipo=$2, puntos_grupo=$4, dif_grupo=$5, gf_grupo=$6, posicion_virtual=$7`,
            [uid, t.equipo, t.grupo, t.puntos, t.dif, t.gf, i + 1]
          );
          predicciones.push({ equipo: t.equipo, fase: `16VOS_MEJOR_TERCERO_GRUPO_${t.grupo}` });
        }

        for (const pred of predicciones) {
          const pts = real32.has(pred.equipo) ? 2 : 0;
          await pool.query(
            `INSERT INTO mundial_puntos_clasificacion (usuario_id, equipo, fase, puntos)
             VALUES ($1,$2,$3,$4)
             ON CONFLICT (usuario_id, equipo, fase) DO UPDATE SET puntos = EXCLUDED.puntos`,
            [uid, pred.equipo, pred.fase, pts]
          );
        }
      }

      console.log(`   ✅ Clasificación calculada para ${usuariosResult.rows.length} usuarios`);
    }
    
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
  }
}

async function main() {
  try {
    console.log('🔄 RECALCULANDO TODAS LAS JORNADAS...\n');
    
    for (let j = 1; j <= 3; j++) {
      await recalcularJornada(j);
    }
    
    console.log('\n✅ TODAS LAS JORNADAS RECALCULADAS\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
