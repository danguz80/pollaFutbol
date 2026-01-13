import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';
import { calcularTablaOficial, calcularTablaUsuario } from '../utils/calcularClasificadosSudamericana.js';

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
        console.log(`🔍 DEBUG J6 - Grupo ${grupo} tabla oficial:`, tabla.slice(0, 3));
        if (tabla.length >= 1) {
          primerosOficiales[grupo] = tabla[0].nombre;
        }
        if (tabla.length >= 2) {
          segundosOficiales[grupo] = tabla[1].nombre;
        }
      }
      console.log('🔍 DEBUG J6 - Primeros oficiales:', primerosOficiales);
      console.log('🔍 DEBUG J6 - Segundos oficiales:', segundosOficiales);
      
      // Para cada usuario, calcular sus aciertos
      const usuariosRes = await pool.query(`
        SELECT DISTINCT sp.usuario_id
        FROM sudamericana_pronosticos sp
        INNER JOIN sudamericana_partidos p ON sp.partido_id = p.id
        INNER JOIN sudamericana_jornadas j ON p.jornada_id = j.id
        WHERE j.numero = 6
      `);
      
      for (const {usuario_id} of usuariosRes.rows) {
        console.log(`\n🔍 DEBUG J6 - Procesando usuario_id: ${usuario_id}`);
        let puntosClasifUsuario = 0;
        
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
            console.log(`🔍 DEBUG J6 - Usuario ${usuario_id} Grupo ${grupo} tabla:`, tablaUsuario.slice(0, 2).map(e => ({nombre: e.nombre, puntos: e.puntos})));
            
            // Verificar 1er lugar (Octavos) - INSERTAR SIEMPRE con 0 o 2 puntos
            if (tablaUsuario.length >= 1) {
              const primeroUsuario = tablaUsuario[0].nombre;
              const primeroOficial = primerosOficiales[grupo];
              console.log(`🔍 DEBUG J6 - Grupo ${grupo} 1ero: Usuario=${primeroUsuario} vs Oficial=${primeroOficial}`);
              
              const partidoIdFicticio = -(1000 + grupo.charCodeAt(0) * 10);
              const puntosOctavos = (primeroOficial && primeroUsuario === primeroOficial) ? 2 : 0;
              
              if (puntosOctavos > 0) {
                console.log(`✅ ACIERTO 1ero Grupo ${grupo}! +2 puntos`);
                puntosClasifUsuario += 2;
                puntosClasificacion += 2;
              }
              
              // INSERTAR SIEMPRE (igual que Libertadores)
              await pool.query(`
                INSERT INTO sudamericana_puntos_clasificacion 
                (usuario_id, partido_id, jornada_numero, equipo_clasificado, fase_clasificado, puntos, equipo_oficial)
                VALUES ($1, $2, 6, $3, $4, $5, $6)
              `, [usuario_id, partidoIdFicticio, primeroUsuario, `OCTAVOS_GRUPO_${grupo}`, puntosOctavos, primeroOficial]);
            }
            
            // Verificar 2do lugar (Playoffs) - INSERTAR SIEMPRE con 0 o 2 puntos
            if (tablaUsuario.length >= 2) {
              const segundoUsuario = tablaUsuario[1].nombre;
              const segundoOficial = segundosOficiales[grupo];
              console.log(`🔍 DEBUG J6 - Grupo ${grupo} 2do: Usuario=${segundoUsuario} vs Oficial=${segundoOficial}`);
              
              const partidoIdFicticioPlayoffs = -(2000 + grupo.charCodeAt(0));
              const puntosPlayoffs = (segundoOficial && segundoUsuario === segundoOficial) ? 2 : 0;
              
              if (puntosPlayoffs > 0) {
                console.log(`✅ ACIERTO 2do Grupo ${grupo}! +2 puntos`);
                puntosClasifUsuario += 2;
                puntosClasificacion += 2;
              }
              
              // INSERTAR SIEMPRE (igual que Libertadores)
              await pool.query(`
                INSERT INTO sudamericana_puntos_clasificacion 
                (usuario_id, partido_id, jornada_numero, equipo_clasificado, fase_clasificado, puntos, equipo_oficial)
                VALUES ($1, $2, 6, $3, $4, $5, $6)
              `, [usuario_id, partidoIdFicticioPlayoffs, segundoUsuario, `PLAYOFFS_GRUPO_${grupo}`, puntosPlayoffs, segundoOficial]);
            }
          } catch (error) {
            console.error(`  ❌ Error grupo ${grupo}:`, error.message);
          }
        }
        console.log(`🎯 DEBUG J6 - Usuario ${usuario_id} TOTAL puntos clasificación: ${puntosClasifUsuario}`);
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

// Función auxiliar para calcular ganador de un cruce (IDA + VUELTA + penales)
function calcularGanadorCruce(partidoIda, partidoVuelta) {
  // Validar que ambos partidos tengan resultados
  if (!partidoIda || !partidoVuelta || 
      partidoIda.goles_local === null || partidoIda.goles_visita === null ||
      partidoVuelta.goles_local === null || partidoVuelta.goles_visita === null) {
    return null;
  }

  // Calcular marcador global
  // En IDA: Local vs Visita
  // En VUELTA: Visita vs Local (equipos invertidos)
  const golesLocalGlobal = partidoIda.goles_visita + partidoVuelta.goles_local;
  const golesVisitaGlobal = partidoIda.goles_local + partidoVuelta.goles_visita;

  // Si no hay empate, gana quien tenga más goles
  if (golesLocalGlobal > golesVisitaGlobal) {
    return partidoVuelta.nombre_local;
  } else if (golesLocalGlobal < golesVisitaGlobal) {
    return partidoVuelta.nombre_visita;
  }

  // Empate global - revisar penales
  if (partidoVuelta.penales_local !== null && partidoVuelta.penales_visita !== null) {
    if (partidoVuelta.penales_local > partidoVuelta.penales_visita) {
      return partidoVuelta.nombre_local;
    } else if (partidoVuelta.penales_local < partidoVuelta.penales_visita) {
      return partidoVuelta.nombre_visita;
    }
  }

  return null;
}

// POST /api/sudamericana-calcular/clasificados-j7 - Calcular clasificados de Play-Offs
router.post('/clasificados-j7', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    console.log('🚀 Calculando clasificados J7 (Play-Offs)...');

    // 1. Obtener partidos de J7 con tipo
    const partidosResult = await pool.query(`
      SELECT 
        p.id, p.nombre_local, p.nombre_visita,
        p.goles_local, p.goles_visita,
        p.penales_local, p.penales_visita,
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM sudamericana_partidos p2
            WHERE p2.jornada_id = p.jornada_id
            AND p2.nombre_local = p.nombre_visita
            AND p2.nombre_visita = p.nombre_local
            AND p2.id > p.id
          ) THEN 'IDA'
          ELSE 'VUELTA'
        END as tipo_partido
      FROM sudamericana_partidos p
      JOIN sudamericana_jornadas sj ON p.jornada_id = sj.id
      WHERE sj.numero = 7
      ORDER BY p.id
    `);

    const partidos = partidosResult.rows;
    const partidosIda = partidos.filter(p => p.tipo_partido === 'IDA');
    const partidosVuelta = partidos.filter(p => p.tipo_partido === 'VUELTA');

    // 2. Calcular clasificados oficiales
    const clasificadosOficiales = [];
    for (const vuelta of partidosVuelta) {
      const ida = partidosIda.find(p => 
        p.nombre_local === vuelta.nombre_visita && 
        p.nombre_visita === vuelta.nombre_local
      );
      if (ida) {
        const ganador = calcularGanadorCruce(ida, vuelta);
        if (ganador) clasificadosOficiales.push(ganador);
      }
    }

    console.log(`🏆 Clasificados oficiales: ${clasificadosOficiales.length}`);

    // 3. Obtener pronósticos
    const pronosticosResult = await pool.query(`
      SELECT 
        sp.usuario_id, u.nombre as usuario_nombre,
        p.id as partido_id, p.nombre_local, p.nombre_visita,
        sp.goles_local as pron_goles_local,
        sp.goles_visita as pron_goles_visita,
        sp.penales_local as pron_penales_local,
        sp.penales_visita as pron_penales_visita,
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM sudamericana_partidos p2
            WHERE p2.jornada_id = p.jornada_id
            AND p2.nombre_local = p.nombre_visita
            AND p2.nombre_visita = p.nombre_local
            AND p2.id > p.id
          ) THEN 'IDA'
          ELSE 'VUELTA'
        END as tipo_partido
      FROM sudamericana_pronosticos sp
      JOIN usuarios u ON sp.usuario_id = u.id
      JOIN sudamericana_partidos p ON sp.partido_id = p.id
      JOIN sudamericana_jornadas sj ON p.jornada_id = sj.id
      WHERE sj.numero = 7
      ORDER BY sp.usuario_id, p.id
    `);

    // 4. Agrupar por usuario y calcular puntos
    const usuariosMap = {};
    pronosticosResult.rows.forEach(p => {
      if (!usuariosMap[p.usuario_id]) {
        usuariosMap[p.usuario_id] = { id: p.usuario_id, nombre: p.usuario_nombre, pronosticos: [] };
      }
      usuariosMap[p.usuario_id].pronosticos.push(p);
    });

    const puntosAInsertar = [];
    for (const usuario of Object.values(usuariosMap)) {
      const pronosticosIda = usuario.pronosticos.filter(p => p.tipo_partido === 'IDA');
      const pronosticosVuelta = usuario.pronosticos.filter(p => p.tipo_partido === 'VUELTA');

      for (const pronVuelta of pronosticosVuelta) {
        if (pronVuelta.pron_goles_local === null || pronVuelta.pron_goles_visita === null) continue;

        const pronIda = pronosticosIda.find(p => 
          p.nombre_local === pronVuelta.nombre_visita && 
          p.nombre_visita === pronVuelta.nombre_local
        );

        if (pronIda && pronIda.pron_goles_local !== null && pronIda.pron_goles_visita !== null) {
          const ganadorPronosticado = calcularGanadorCruce(
            {
              nombre_local: pronIda.nombre_local,
              nombre_visita: pronIda.nombre_visita,
              goles_local: pronIda.pron_goles_local,
              goles_visita: pronIda.pron_goles_visita,
              penales_local: pronIda.pron_penales_local,
              penales_visita: pronIda.pron_penales_visita
            },
            {
              nombre_local: pronVuelta.nombre_local,
              nombre_visita: pronVuelta.nombre_visita,
              goles_local: pronVuelta.pron_goles_local,
              goles_visita: pronVuelta.pron_goles_visita,
              penales_local: pronVuelta.pron_penales_local,
              penales_visita: pronVuelta.pron_penales_visita
            }
          );

          if (ganadorPronosticado) {
            // Buscar el clasificado oficial real de este cruce
            const clasificadoOficialCruce = clasificadosOficiales.find(c => 
              c === pronVuelta.nombre_local || c === pronVuelta.nombre_visita
            );
            
            const acerto = clasificadoOficialCruce === ganadorPronosticado;
            const puntos = acerto ? 2 : 0;

            puntosAInsertar.push({
              usuario_id: usuario.id,
              jornada_numero: 7,
              equipo_clasificado: ganadorPronosticado,
              equipo_oficial: clasificadoOficialCruce || null, // Siempre guarda el clasificado real
              fase_clasificado: 'OCTAVOS_PLAYOFFS',
              puntos: puntos
            });
          }
        }
      }
    }

    // 5. Guardar en BD
    await pool.query('DELETE FROM sudamericana_puntos_clasificacion WHERE jornada_numero = 7');

    for (const punto of puntosAInsertar) {
      await pool.query(`
        INSERT INTO sudamericana_puntos_clasificacion 
        (usuario_id, jornada_numero, equipo_clasificado, equipo_oficial, fase_clasificado, puntos)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        punto.usuario_id, punto.jornada_numero, punto.equipo_clasificado,
        punto.equipo_oficial, punto.fase_clasificado, punto.puntos
      ]);
    }

    res.json({
      success: true,
      mensaje: 'Clasificados J7 calculados exitosamente',
      clasificados_oficiales: clasificadosOficiales.length,
      registros_insertados: puntosAInsertar.length
    });

  } catch (error) {
    console.error('❌ Error calculando clasificados J7:', error);
    res.status(500).json({ error: 'Error calculando clasificados', detalles: error.message });
  }
});

// POST /clasificados-j8 - Calcular clasificados de Octavos (J8 IDA/VUELTA)
router.post('/clasificados-j8', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    console.log('🎯 Calculando clasificados de Octavos (J8)...');

    // 1. Obtener todos los partidos de jornada 8 con tipo_partido
    const partidosResult = await pool.query(`
      SELECT 
        p.id, p.nombre_local, p.nombre_visita,
        p.goles_local, p.goles_visita,
        p.penales_local, p.penales_visita,
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM sudamericana_partidos p2
            WHERE p2.jornada_id = p.jornada_id
            AND p2.nombre_local = p.nombre_visita
            AND p2.nombre_visita = p.nombre_local
            AND p2.id > p.id
          ) THEN 'IDA'
          ELSE 'VUELTA'
        END as tipo_partido
      FROM sudamericana_partidos p
      JOIN sudamericana_jornadas sj ON p.jornada_id = sj.id
      WHERE sj.numero = 8
      ORDER BY p.id
    `);

    const partidos = partidosResult.rows;
    const partidosIda = partidos.filter(p => p.tipo_partido === 'IDA');
    const partidosVuelta = partidos.filter(p => p.tipo_partido === 'VUELTA');

    // 2. Calcular clasificados oficiales
    const clasificadosOficiales = [];
    for (const vuelta of partidosVuelta) {
      const ida = partidosIda.find(p => 
        p.nombre_local === vuelta.nombre_visita && 
        p.nombre_visita === vuelta.nombre_local
      );
      if (ida) {
        const ganador = calcularGanadorCruce(ida, vuelta);
        if (ganador) clasificadosOficiales.push(ganador);
      }
    }

    console.log(`🏆 Clasificados oficiales J8: ${clasificadosOficiales.length}`);

    // 3. Obtener pronósticos
    const pronosticosResult = await pool.query(`
      SELECT 
        sp.usuario_id, u.nombre as usuario_nombre,
        p.id as partido_id, p.nombre_local, p.nombre_visita,
        sp.goles_local as pron_goles_local,
        sp.goles_visita as pron_goles_visita,
        sp.penales_local as pron_penales_local,
        sp.penales_visita as pron_penales_visita,
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM sudamericana_partidos p2
            WHERE p2.jornada_id = p.jornada_id
            AND p2.nombre_local = p.nombre_visita
            AND p2.nombre_visita = p.nombre_local
            AND p2.id > p.id
          ) THEN 'IDA'
          ELSE 'VUELTA'
        END as tipo_partido
      FROM sudamericana_pronosticos sp
      JOIN usuarios u ON sp.usuario_id = u.id
      JOIN sudamericana_partidos p ON sp.partido_id = p.id
      JOIN sudamericana_jornadas sj ON p.jornada_id = sj.id
      WHERE sj.numero = 8
      ORDER BY sp.usuario_id, p.id
    `);

    // 4. Agrupar por usuario y calcular puntos
    const usuariosMap = {};
    pronosticosResult.rows.forEach(p => {
      if (!usuariosMap[p.usuario_id]) {
        usuariosMap[p.usuario_id] = { id: p.usuario_id, nombre: p.usuario_nombre, pronosticos: [] };
      }
      usuariosMap[p.usuario_id].pronosticos.push(p);
    });

    const puntosAInsertar = [];
    for (const usuario of Object.values(usuariosMap)) {
      const pronosticosIda = usuario.pronosticos.filter(p => p.tipo_partido === 'IDA');
      const pronosticosVuelta = usuario.pronosticos.filter(p => p.tipo_partido === 'VUELTA');

      for (const pronVuelta of pronosticosVuelta) {
        if (pronVuelta.pron_goles_local === null || pronVuelta.pron_goles_visita === null) continue;

        const pronIda = pronosticosIda.find(p => 
          p.nombre_local === pronVuelta.nombre_visita && 
          p.nombre_visita === pronVuelta.nombre_local
        );

        if (pronIda && pronIda.pron_goles_local !== null && pronIda.pron_goles_visita !== null) {
          const ganadorPronosticado = calcularGanadorCruce(
            {
              nombre_local: pronIda.nombre_local,
              nombre_visita: pronIda.nombre_visita,
              goles_local: pronIda.pron_goles_local,
              goles_visita: pronIda.pron_goles_visita,
              penales_local: pronIda.pron_penales_local,
              penales_visita: pronIda.pron_penales_visita
            },
            {
              nombre_local: pronVuelta.nombre_local,
              nombre_visita: pronVuelta.nombre_visita,
              goles_local: pronVuelta.pron_goles_local,
              goles_visita: pronVuelta.pron_goles_visita,
              penales_local: pronVuelta.pron_penales_local,
              penales_visita: pronVuelta.pron_penales_visita
            }
          );

          if (ganadorPronosticado) {
            const clasificadoOficialCruce = clasificadosOficiales.find(c => 
              c === pronVuelta.nombre_local || c === pronVuelta.nombre_visita
            );
            
            const acerto = clasificadoOficialCruce === ganadorPronosticado;
            const puntos = acerto ? 2 : 0;

            puntosAInsertar.push({
              usuario_id: usuario.id,
              jornada_numero: 8,
              equipo_clasificado: ganadorPronosticado,
              equipo_oficial: clasificadoOficialCruce || null,
              fase_clasificado: 'CUARTOS_OCTAVOS',
              puntos: puntos
            });
          }
        }
      }
    }

    // 5. Guardar en BD
    await pool.query('DELETE FROM sudamericana_puntos_clasificacion WHERE jornada_numero = 8');

    for (const punto of puntosAInsertar) {
      await pool.query(`
        INSERT INTO sudamericana_puntos_clasificacion 
        (usuario_id, jornada_numero, equipo_clasificado, equipo_oficial, fase_clasificado, puntos)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        punto.usuario_id, punto.jornada_numero, punto.equipo_clasificado,
        punto.equipo_oficial, punto.fase_clasificado, punto.puntos
      ]);
    }

    res.json({
      success: true,
      mensaje: 'Clasificados J8 calculados exitosamente',
      clasificados_oficiales: clasificadosOficiales.length,
      registros_insertados: puntosAInsertar.length
    });

  } catch (error) {
    console.error('❌ Error calculando clasificados J8:', error);
    res.status(500).json({ error: 'Error calculando clasificados', detalles: error.message });
  }
});

export default router;
