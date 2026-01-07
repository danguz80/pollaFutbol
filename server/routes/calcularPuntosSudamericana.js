import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';

const router = express.Router();

// Función auxiliar para determinar el signo del resultado
function getSigno(golesLocal, golesVisita) {
  if (golesLocal > golesVisita) return 1;  // Victoria local
  if (golesLocal < golesVisita) return 2;  // Victoria visita
  return 'X';  // Empate
}

// Función auxiliar para determinar la fase según el número de jornada
function getFaseDeJornada(jornadaNumero) {
  if (jornadaNumero <= 6) return 'FASE DE GRUPOS';
  if (jornadaNumero <= 8) return 'OCTAVOS';
  if (jornadaNumero === 9) return 'CUARTOS';
  if (jornadaNumero === 10) return 'SEMIFINALES';
  return 'FASE DE GRUPOS';
}

// POST /api/sudamericana-calcular/puntos - Calcular y asignar puntos a todos los pronósticos (o de una jornada específica)
router.post('/puntos', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { jornadaNumero } = req.body; // Jornada opcional
    console.log(`🎯 INICIO calcular puntos - Jornada: ${jornadaNumero || 'TODAS'}`);
    
    // Obtener reglas de puntuación
    const reglasResult = await pool.query('SELECT * FROM libertadores_puntuacion ORDER BY puntos DESC');
    const reglas = reglasResult.rows;

    // Construir consulta con filtro opcional de jornada
    let query = `
      SELECT 
        sp.id,
        sp.usuario_id,
        sp.goles_local as pronostico_local,
        sp.goles_visita as pronostico_visita,
        p.id as partido_id,
        p.goles_local as resultado_local,
        p.goles_visita as resultado_visita,
        p.nombre_local,
        p.nombre_visita,
        p.bonus,
        sj.numero as jornada_numero
      FROM sudamericana_pronosticos sp
      INNER JOIN sudamericana_partidos p ON sp.partido_id = p.id
      INNER JOIN sudamericana_jornadas sj ON p.jornada_id = sj.id
      WHERE p.goles_local IS NOT NULL 
        AND p.goles_visita IS NOT NULL`;
    
    const params = [];
    if (jornadaNumero) {
      query += ` AND sj.numero = $1`;
      params.push(jornadaNumero);
    }
    
    const pronosticosResult = await pool.query(query, params);

    let pronosticosActualizados = 0;
    let puntosAsignados = 0;

    // Calcular puntos para cada pronóstico
    for (const pronostico of pronosticosResult.rows) {
      const {
        id,
        usuario_id,
        pronostico_local,
        pronostico_visita,
        partido_id,
        resultado_local,
        resultado_visita,
        nombre_local,
        nombre_visita,
        bonus,
        jornada_numero
      } = pronostico;

      // Bonus del partido (x1, x2, x3, etc.)
      const bonusMultiplicador = bonus || 1;

      // Determinar la fase según el número de jornada
      const fase = getFaseDeJornada(jornada_numero);
      
      // Obtener reglas de puntuación para esta fase
      const puntosSigno = reglas.find(r => r.fase === fase && r.concepto.includes('Signo 1X2'))?.puntos || 1;
      const puntosDiferencia = reglas.find(r => r.fase === fase && r.concepto.includes('Diferencia de goles'))?.puntos || 3;
      const puntosExacto = reglas.find(r => r.fase === fase && r.concepto.includes('Resultado exacto'))?.puntos || 5;

      let puntosGanados = 0;

      // 1. Verificar resultado exacto (mayor puntuación)
      if (pronostico_local === resultado_local && pronostico_visita === resultado_visita) {
        puntosGanados = puntosExacto;
      }
      // 2. Verificar diferencia de goles
      else if (Math.abs(pronostico_local - pronostico_visita) === Math.abs(resultado_local - resultado_visita)) {
        // Además, debe coincidir el signo (quién gana)
        const signoPronostico = getSigno(pronostico_local, pronostico_visita);
        const signoResultado = getSigno(resultado_local, resultado_visita);
        
        if (signoPronostico === signoResultado) {
          puntosGanados = puntosDiferencia;
        }
      }
      // 3. Verificar solo signo 1X2
      else {
        const signoPronostico = getSigno(pronostico_local, pronostico_visita);
        const signoResultado = getSigno(resultado_local, resultado_visita);
        
        if (signoPronostico === signoResultado) {
          puntosGanados = puntosSigno;
        }
      }

      // Multiplicar puntos por el bonus del partido
      const puntosFinales = puntosGanados * bonusMultiplicador;

      // Actualizar puntos en la base de datos
      await pool.query(
        'UPDATE sudamericana_pronosticos SET puntos = $1 WHERE id = $2',
        [puntosFinales, id]
      );

      if (puntosFinales > 0) {
        pronosticosActualizados++;
        puntosAsignados += puntosFinales;
      }
    }

    // Para jornada 6: calcular y guardar puntos de clasificación
    let puntosClasificacion = 0;
    if (jornadaNumero == 6) {  // Usar == en lugar de === por si viene como string
      
      // Verificar/crear tabla sudamericana_puntos_clasificacion
      await pool.query(`
        CREATE TABLE IF NOT EXISTS sudamericana_puntos_clasificacion (
          id SERIAL PRIMARY KEY,
          usuario_id INTEGER NOT NULL,
          partido_id INTEGER,
          jornada_numero INTEGER NOT NULL,
          equipo_clasificado VARCHAR(100) NOT NULL,
          fase_clasificado VARCHAR(50) NOT NULL,
          puntos INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(usuario_id, partido_id, jornada_numero)
        )
      `);
      
      // Calcular clasificados oficiales (1ero y 2do de cada grupo)
      const jornadasNumeros = [1, 2, 3, 4, 5, 6];
      const grupos = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      const primerosOficiales = {};
      const segundosOficiales = {};
      
      for (const grupo of grupos) {
        const tabla = await calcularTablaOficial(grupo, jornadasNumeros);
        if (tabla.length >= 1) {
          primerosOficiales[grupo] = tabla[0].nombre;
        }
        if (tabla.length >= 2) {
          segundosOficiales[grupo] = tabla[1].nombre;
        }
      }
      
      // Para cada usuario, calcular sus aciertos
      const usuariosRes = await pool.query(`
        SELECT DISTINCT sp.usuario_id
        FROM sudamericana_pronosticos sp
        INNER JOIN sudamericana_partidos p ON sp.partido_id = p.id
        INNER JOIN sudamericana_jornadas j ON p.jornada_id = j.id
        WHERE j.numero = 6
      `);
      
      for (const {usuario_id} of usuariosRes.rows) {
        // Primero eliminar TODOS los registros existentes de clasificación J6
        await pool.query(
          `DELETE FROM sudamericana_puntos_clasificacion 
           WHERE usuario_id = $1 
           AND jornada_numero = 6`,
          [usuario_id]
        );
        
        for (const grupo of grupos) {
          try {
            const tablaUsuario = await calcularTablaUsuario(usuario_id, grupo, jornadasNumeros);
            
            // Verificar 1er lugar (Octavos)
            if (tablaUsuario.length >= 1) {
              const primeroUsuario = tablaUsuario[0].nombre;
              const primeroOficial = primerosOficiales[grupo];
              
              if (primeroOficial && primeroUsuario === primeroOficial) {
                const partidoIdFicticio = -(1000 + grupo.charCodeAt(0) * 10);
                
                await pool.query(`
                  INSERT INTO sudamericana_puntos_clasificacion 
                  (usuario_id, partido_id, jornada_numero, equipo_clasificado, fase_clasificado, puntos)
                  VALUES ($1, $2, 6, $3, $4, 2)
                `, [usuario_id, partidoIdFicticio, primeroOficial, `OCTAVOS_GRUPO_${grupo}`]);
                
                puntosClasificacion += 2;
              }
            }
            
            // Verificar 2do lugar (Playoffs)
            if (tablaUsuario.length >= 2) {
              const segundoUsuario = tablaUsuario[1].nombre;
              const segundoOficial = segundosOficiales[grupo];
              
              if (segundoOficial && segundoUsuario === segundoOficial) {
                const partidoIdFicticioPlayoffs = -(2000 + grupo.charCodeAt(0));
                
                await pool.query(`
                  INSERT INTO sudamericana_puntos_clasificacion 
                  (usuario_id, partido_id, jornada_numero, equipo_clasificado, fase_clasificado, puntos)
                  VALUES ($1, $2, 6, $3, $4, 2)
                `, [usuario_id, partidoIdFicticioPlayoffs, segundoOficial, `PLAYOFFS_GRUPO_${grupo}`]);
                
                puntosClasificacion += 2;
              }
            }
          } catch (error) {
            console.error(`  ❌ Error grupo ${grupo}:`, error.message);
          }
        }
      }
    }

    console.log(`✅ Puntos calculados: ${pronosticosActualizados} pronósticos actualizados, ${puntosAsignados} puntos totales asignados`);

    res.json({
      mensaje: jornadaNumero 
        ? `✅ Puntajes de jornada ${jornadaNumero} calculados correctamente`
        : '✅ Puntajes calculados correctamente',
      total_pronosticos: pronosticosResult.rows.length,
      pronosticos_con_puntos: pronosticosActualizados,
      puntos_totales_asignados: puntosAsignados,
      puntos_clasificacion_asignados: puntosClasificacion
    });

  } catch (error) {
    console.error('❌ Error al calcular puntos:', error);
    res.status(500).json({ 
      error: 'Error al calcular puntos',
      detalles: error.message 
    });
  }
});

// Función auxiliar para calcular tabla oficial de un grupo
async function calcularTablaOficial(grupo, jornadas) {
  const partidosResult = await pool.query(`
    SELECT 
      p.nombre_local,
      p.nombre_visita,
      p.goles_local,
      p.goles_visita,
      p.grupo
    FROM sudamericana_partidos p
    INNER JOIN sudamericana_jornadas j ON p.jornada_id = j.id
    WHERE p.grupo = $1
      AND j.numero = ANY($2)
      AND p.goles_local IS NOT NULL
      AND p.goles_visita IS NOT NULL
    ORDER BY j.numero, p.id
  `, [grupo, jornadas]);

  const equipos = {};

  for (const partido of partidosResult.rows) {
    const { nombre_local, nombre_visita, goles_local, goles_visita } = partido;

    if (!equipos[nombre_local]) {
      equipos[nombre_local] = { nombre: nombre_local, pts: 0, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dif: 0 };
    }
    if (!equipos[nombre_visita]) {
      equipos[nombre_visita] = { nombre: nombre_visita, pts: 0, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dif: 0 };
    }

    equipos[nombre_local].pj++;
    equipos[nombre_visita].pj++;
    equipos[nombre_local].gf += goles_local;
    equipos[nombre_local].gc += goles_visita;
    equipos[nombre_visita].gf += goles_visita;
    equipos[nombre_visita].gc += goles_local;

    if (goles_local > goles_visita) {
      equipos[nombre_local].pts += 3;
      equipos[nombre_local].pg++;
      equipos[nombre_visita].pp++;
    } else if (goles_local < goles_visita) {
      equipos[nombre_visita].pts += 3;
      equipos[nombre_visita].pg++;
      equipos[nombre_local].pp++;
    } else {
      equipos[nombre_local].pts += 1;
      equipos[nombre_visita].pts += 1;
      equipos[nombre_local].pe++;
      equipos[nombre_visita].pe++;
    }
  }

  const tabla = Object.values(equipos);
  tabla.forEach(e => e.dif = e.gf - e.gc);
  tabla.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.dif !== a.dif) return b.dif - a.dif;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.nombre.localeCompare(b.nombre);
  });

  return tabla;
}

// Función auxiliar para calcular tabla de un usuario
async function calcularTablaUsuario(usuario_id, grupo, jornadas) {
  const pronosticosResult = await pool.query(`
    SELECT 
      p.nombre_local,
      p.nombre_visita,
      sp.goles_local as pronostico_local,
      sp.goles_visita as pronostico_visita,
      p.grupo
    FROM sudamericana_pronosticos sp
    INNER JOIN sudamericana_partidos p ON sp.partido_id = p.id
    INNER JOIN sudamericana_jornadas j ON p.jornada_id = j.id
    WHERE sp.usuario_id = $1
      AND p.grupo = $2
      AND j.numero = ANY($3)
      AND sp.goles_local IS NOT NULL
      AND sp.goles_visita IS NOT NULL
    ORDER BY j.numero, p.id
  `, [usuario_id, grupo, jornadas]);

  const equipos = {};

  for (const pronostico of pronosticosResult.rows) {
    const { nombre_local, nombre_visita, pronostico_local, pronostico_visita } = pronostico;

    if (!equipos[nombre_local]) {
      equipos[nombre_local] = { nombre: nombre_local, pts: 0, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dif: 0 };
    }
    if (!equipos[nombre_visita]) {
      equipos[nombre_visita] = { nombre: nombre_visita, pts: 0, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dif: 0 };
    }

    equipos[nombre_local].pj++;
    equipos[nombre_visita].pj++;
    equipos[nombre_local].gf += pronostico_local;
    equipos[nombre_local].gc += pronostico_visita;
    equipos[nombre_visita].gf += pronostico_visita;
    equipos[nombre_visita].gc += pronostico_local;

    if (pronostico_local > pronostico_visita) {
      equipos[nombre_local].pts += 3;
      equipos[nombre_local].pg++;
      equipos[nombre_visita].pp++;
    } else if (pronostico_local < pronostico_visita) {
      equipos[nombre_visita].pts += 3;
      equipos[nombre_visita].pg++;
      equipos[nombre_local].pp++;
    } else {
      equipos[nombre_local].pts += 1;
      equipos[nombre_visita].pts += 1;
      equipos[nombre_local].pe++;
      equipos[nombre_visita].pe++;
    }
  }

  const tabla = Object.values(equipos);
  tabla.forEach(e => e.dif = e.gf - e.gc);
  tabla.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.dif !== a.dif) return b.dif - a.dif;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.nombre.localeCompare(b.nombre);
  });

  return tabla;
}

export default router;
