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

      // Para J10: Verificar si es partido FINAL y si el usuario pronosticó los equipos correctos
      let partidoCoincideParaJ10 = true;
      if (jornada_numero == 10) {
        // Verificar si es partido FINAL
        const partidoCheck = await pool.query(
          'SELECT tipo_partido FROM sudamericana_partidos WHERE id = $1',
          [partido_id]
        );
        
        if (partidoCheck.rows[0]?.tipo_partido === 'FINAL') {
          // Obtener pronóstico de finalistas del usuario
          const pronosticoFinal = await pool.query(
            `SELECT equipo_local, equipo_visita 
             FROM sudamericana_pronosticos_final_virtual 
             WHERE usuario_id = $1 AND jornada_id = 10`,
            [usuario_id]
          );
          
          if (pronosticoFinal.rows.length > 0) {
            const { equipo_local: equipoLocalPron, equipo_visita: equipoVisitaPron } = pronosticoFinal.rows[0];
            
            // Verificar si el partido pronosticado coincide con el real
            const coincideDirecto = (equipoLocalPron === nombre_local && equipoVisitaPron === nombre_visita);
            const coincideInverso = (equipoLocalPron === nombre_visita && equipoVisitaPron === nombre_local);
            
            partidoCoincideParaJ10 = coincideDirecto || coincideInverso;
            
            if (!partidoCoincideParaJ10) {
              console.log(`❌ Usuario ${usuario_id}: Pronosticó "${equipoLocalPron} vs ${equipoVisitaPron}" pero la final es "${nombre_local} vs ${nombre_visita}" - NO suma puntos`);
            }
          }
        }
      }

      // Bonus del partido (x1, x2, x3, etc.)
      const bonusMultiplicador = bonus || 1;

      // Determinar la fase según el número de jornada
      const fase = getFaseDeJornada(jornada_numero);
      
      // Obtener reglas de puntuación para esta fase
      const puntosSigno = reglas.find(r => r.fase === fase && r.concepto.includes('Signo 1X2'))?.puntos || 1;
      const puntosDiferencia = reglas.find(r => r.fase === fase && r.concepto.includes('Diferencia de goles'))?.puntos || 3;
      const puntosExacto = reglas.find(r => r.fase === fase && r.concepto.includes('Resultado exacto'))?.puntos || 5;

      let puntosGanados = 0;

      // Solo calcular puntos si el partido coincide (para J10 FINAL) o si no es J10 FINAL
      if (partidoCoincideParaJ10) {
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

    // Para jornada 9: calcular clasificados a Semifinales
    if (jornadaNumero == 9) {
      console.log('🎯 Calculando clasificados J9 (Semifinales)...');
      
      try {
        // Obtener partidos de J9
        const partidosJ9Result = await pool.query(`
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
          WHERE sj.numero = 9
          ORDER BY p.id
        `);

        const partidosJ9 = partidosJ9Result.rows;
        const partidosIdaJ9 = partidosJ9.filter(p => p.tipo_partido === 'IDA');
        const partidosVueltaJ9 = partidosJ9.filter(p => p.tipo_partido === 'VUELTA');

        // Calcular clasificados reales
        const clasificadosJ9 = [];
        for (const vuelta of partidosVueltaJ9) {
          const ida = partidosIdaJ9.find(p => 
            p.nombre_local === vuelta.nombre_visita && 
            p.nombre_visita === vuelta.nombre_local
          );
          if (ida) {
            const ganador = calcularGanadorCruce(ida, vuelta);
            if (ganador) clasificadosJ9.push(ganador);
          }
        }

        // Obtener pronósticos de los usuarios para J9
        const pronosticosJ9Result = await pool.query(`
          SELECT 
            sp.usuario_id, sp.partido_id,
            p.nombre_local, p.nombre_visita,
            sp.goles_local, sp.goles_visita,
            sp.penales_local, sp.penales_visita,
            p.tipo_partido
          FROM sudamericana_pronosticos sp
          JOIN sudamericana_partidos p ON sp.partido_id = p.id
          JOIN sudamericana_jornadas sj ON p.jornada_id = sj.id
          WHERE sj.numero = 9
          ORDER BY sp.usuario_id, p.id
        `);

        // Calcular puntos por usuario
        const usuariosJ9 = {};
        pronosticosJ9Result.rows.forEach(p => {
          if (!usuariosJ9[p.usuario_id]) usuariosJ9[p.usuario_id] = [];
          usuariosJ9[p.usuario_id].push(p);
        });

        const puntosJ9 = [];
        for (const [usuarioId, pronosticos] of Object.entries(usuariosJ9)) {
          const partidosIdaUser = pronosticos.filter(p => p.tipo_partido === 'IDA');
          const partidosVueltaUser = pronosticos.filter(p => p.tipo_partido === 'VUELTA');

          for (const vuelta of partidosVueltaUser) {
            const ida = partidosIdaUser.find(p => 
              p.nombre_local === vuelta.nombre_visita && 
              p.nombre_visita === vuelta.nombre_local
            );
            
            if (ida && ida.goles_local !== null && vuelta.goles_local !== null) {
              const ganadorPronosticado = calcularGanadorCruce(ida, vuelta);
              const clasificadoReal = clasificadosJ9.find(c => 
                (c === ida.nombre_local || c === ida.nombre_visita) ||
                (c === vuelta.nombre_local || c === vuelta.nombre_visita)
              );

              let puntos = 0;
              if (ganadorPronosticado && clasificadoReal && ganadorPronosticado === clasificadoReal) {
                puntos = 5;
              }

              puntosJ9.push({
                usuario_id: parseInt(usuarioId),
                jornada_numero: 9,
                equipo_clasificado: ganadorPronosticado,
                equipo_oficial: clasificadoReal || null,
                fase_clasificado: 'SEMIFINALES_CUARTOS',
                puntos: puntos
              });
            }
          }
        }

        // Guardar puntos
        await pool.query('DELETE FROM sudamericana_puntos_clasificacion WHERE jornada_numero = 9');
        for (const punto of puntosJ9) {
          await pool.query(`
            INSERT INTO sudamericana_puntos_clasificacion 
            (usuario_id, jornada_numero, equipo_clasificado, equipo_oficial, fase_clasificado, puntos)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [punto.usuario_id, punto.jornada_numero, punto.equipo_clasificado,
              punto.equipo_oficial, punto.fase_clasificado, punto.puntos]);
        }

        console.log(`✅ J9: ${clasificadosJ9.length} clasificados, ${puntosJ9.length} registros`);
      } catch (error) {
        console.error('❌ Error calculando J9:', error);
      }
    }

    // Para jornada 10: calcular Cuadro Final
    if (jornadaNumero == 10) {
      console.log('🎯 Calculando Cuadro Final J10...');
      
      try {
        // Obtener partidos de J10
        const partidosJ10Result = await pool.query(`
          SELECT 
            p.id, p.nombre_local, p.nombre_visita,
            p.goles_local, p.goles_visita,
            p.penales_local, p.penales_visita,
            p.tipo_partido
          FROM sudamericana_partidos p
          JOIN sudamericana_jornadas sj ON p.jornada_id = sj.id
          WHERE sj.numero = 10
          ORDER BY p.id
        `);

        const partidosJ10 = partidosJ10Result.rows;
        const partidosSemifinal = partidosJ10.filter(p => p.tipo_partido === 'IDA' || p.tipo_partido === 'VUELTA');
        const partidoFinal = partidosJ10.find(p => p.tipo_partido === 'FINAL');

        // Calcular finalistas reales
        const finalistasReales = [];
        const semifinalesIda = partidosSemifinal.filter(p => p.tipo_partido === 'IDA');
        const semifinalesVuelta = partidosSemifinal.filter(p => p.tipo_partido === 'VUELTA');

        for (const vuelta of semifinalesVuelta) {
          const ida = semifinalesIda.find(p => 
            p.nombre_local === vuelta.nombre_visita && 
            p.nombre_visita === vuelta.nombre_local
          );
          if (ida) {
            const ganador = calcularGanadorCruce(ida, vuelta);
            if (ganador) finalistasReales.push(ganador);
          }
        }

        // Determinar campeón y subcampeón desde el partido FINAL
        let campeonReal = null;
        let subcampeonReal = null;

        console.log('🔍 Finalistas reales:', finalistasReales);
        console.log('🔍 Partido final:', partidoFinal);

        if (partidoFinal && partidoFinal.goles_local !== null && partidoFinal.goles_visita !== null) {
          // Los nombres en la BD ya son los correctos (se actualizan en Admin)
          const finalistaLocal = partidoFinal.nombre_local;
          const finalistaVisita = partidoFinal.nombre_visita;

          // No usar penales para determinar campeón, solo goles del 90'
          if (partidoFinal.goles_local > partidoFinal.goles_visita) {
            campeonReal = finalistaLocal;
            subcampeonReal = finalistaVisita;
          } else if (partidoFinal.goles_visita > partidoFinal.goles_local) {
            campeonReal = finalistaVisita;
            subcampeonReal = finalistaLocal;
          } else {
            // En caso de empate, usar penales si existen
            if (partidoFinal.penales_local !== null && partidoFinal.penales_visita !== null) {
              if (partidoFinal.penales_local > partidoFinal.penales_visita) {
                campeonReal = finalistaLocal;
                subcampeonReal = finalistaVisita;
              } else if (partidoFinal.penales_visita > partidoFinal.penales_local) {
                campeonReal = finalistaVisita;
                subcampeonReal = finalistaLocal;
              }
            }
          }
        }

        console.log('🏆 Campeón real:', campeonReal);
        console.log('🥈 Subcampeón real:', subcampeonReal);

        // Obtener pronósticos de la tabla virtual
        const pronosticosFinalesResult = await pool.query(`
          SELECT usuario_id, equipo_local, equipo_visita, 
                 goles_local, goles_visita, penales_local, penales_visita
          FROM sudamericana_pronosticos_final_virtual
          WHERE jornada_id = 10
        `);

        const puntosJ10 = [];
        for (const pron of pronosticosFinalesResult.rows) {
          const finalistasPronosticados = [pron.equipo_local, pron.equipo_visita];

          // Puntos por finalistas (5pts cada uno) - Asignar equipo_oficial correcto
          // Para el equipo_local del usuario
          const localAcerto = finalistasReales.includes(pron.equipo_local);
          const localEquipoOficial = localAcerto ? pron.equipo_local : (finalistasReales[0] || null);
          
          puntosJ10.push({
            usuario_id: pron.usuario_id,
            jornada_numero: 10,
            equipo_clasificado: pron.equipo_local,
            equipo_oficial: localEquipoOficial,
            fase_clasificado: 'FINALISTA',
            puntos: localAcerto ? 5 : 0
          });
          
          // Para el equipo_visita del usuario
          const visitaAcerto = finalistasReales.includes(pron.equipo_visita);
          const visitaEquipoOficial = visitaAcerto ? pron.equipo_visita : (finalistasReales[1] || finalistasReales[0] || null);
          
          puntosJ10.push({
            usuario_id: pron.usuario_id,
            jornada_numero: 10,
            equipo_clasificado: pron.equipo_visita,
            equipo_oficial: visitaEquipoOficial,
            fase_clasificado: 'FINALISTA',
            puntos: visitaAcerto ? 5 : 0
          });

          // Puntos por campeón (15pts) - Solo si pronosticó correctamente los finalistas
          const golesLocalPron = pron.goles_local + (pron.penales_local || 0);
          const golesVisitaPron = pron.goles_visita + (pron.penales_visita || 0);
          let campeonPronosticado = null;
          let subcampeonPronosticado = null;

          if (golesLocalPron > golesVisitaPron) {
            campeonPronosticado = pron.equipo_local;
            subcampeonPronosticado = pron.equipo_visita;
          } else if (golesVisitaPron > golesLocalPron) {
            campeonPronosticado = pron.equipo_visita;
            subcampeonPronosticado = pron.equipo_local;
          }

          // IMPORTANTE: Solo dar puntos si el partido pronosticado coincide con el partido real
          const partidoCoincide = 
            (pron.equipo_local === finalistasReales[0] && pron.equipo_visita === finalistasReales[1]) ||
            (pron.equipo_local === finalistasReales[1] && pron.equipo_visita === finalistasReales[0]);

          if (campeonPronosticado && campeonReal && partidoCoincide) {
            const aciertoCampeon = campeonPronosticado === campeonReal;
            puntosJ10.push({
              usuario_id: pron.usuario_id,
              jornada_numero: 10,
              equipo_clasificado: campeonPronosticado,
              equipo_oficial: campeonReal,
              fase_clasificado: 'CAMPEON',
              puntos: aciertoCampeon ? 15 : 0
            });
          } else if (campeonPronosticado) {
            // Si el partido no coincide, guardar con 0 puntos
            puntosJ10.push({
              usuario_id: pron.usuario_id,
              jornada_numero: 10,
              equipo_clasificado: campeonPronosticado,
              equipo_oficial: campeonReal,
              fase_clasificado: 'CAMPEON',
              puntos: 0
            });
          }

          // Puntos por subcampeón (8pts) - Solo si el partido coincide
          if (subcampeonPronosticado && subcampeonReal && partidoCoincide) {
            const aciertoSubcampeon = subcampeonPronosticado === subcampeonReal;
            puntosJ10.push({
              usuario_id: pron.usuario_id,
              jornada_numero: 10,
              equipo_clasificado: subcampeonPronosticado,
              equipo_oficial: subcampeonReal,
              fase_clasificado: 'SUBCAMPEON',
              puntos: aciertoSubcampeon ? 8 : 0
            });
          } else if (subcampeonPronosticado) {
            // Si el partido no coincide, guardar con 0 puntos
            puntosJ10.push({
              usuario_id: pron.usuario_id,
              jornada_numero: 10,
              equipo_clasificado: subcampeonPronosticado,
              equipo_oficial: subcampeonReal,
              fase_clasificado: 'SUBCAMPEON',
              puntos: 0
            });
          }
        }

        // Guardar puntos
        await pool.query('DELETE FROM sudamericana_puntos_clasificacion WHERE jornada_numero = 10');
        for (const punto of puntosJ10) {
          await pool.query(`
            INSERT INTO sudamericana_puntos_clasificacion 
            (usuario_id, jornada_numero, equipo_clasificado, equipo_oficial, fase_clasificado, puntos)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [punto.usuario_id, punto.jornada_numero, punto.equipo_clasificado,
              punto.equipo_oficial, punto.fase_clasificado, punto.puntos]);
        }

        console.log(`✅ J10: ${finalistasReales.length} finalistas, campeón: ${campeonReal}, ${puntosJ10.length} registros`);
      } catch (error) {
        console.error('❌ Error calculando J10:', error);
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

// ==================== ENDPOINT PARA CALCULAR CLASIFICADOS J9 (CUARTOS → SEMIFINALES) ====================
router.post('/clasificados-j9', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    console.log('🎯 Calculando clasificados de Cuartos (J9)...');

    // 1. Obtener todos los partidos de jornada 9 con tipo_partido
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
      WHERE sj.numero = 9
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

    console.log(`🏆 Clasificados oficiales J9: ${clasificadosOficiales.length}`);

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
      WHERE sj.numero = 9
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
              jornada_numero: 9,
              equipo_clasificado: ganadorPronosticado,
              equipo_oficial: clasificadoOficialCruce || null,
              fase_clasificado: 'SEMIFINALES_CUARTOS',
              puntos: puntos
            });
          }
        }
      }
    }

    // 5. Guardar en BD
    await pool.query('DELETE FROM sudamericana_puntos_clasificacion WHERE jornada_numero = 9');

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
      mensaje: 'Clasificados J9 calculados exitosamente',
      clasificados_oficiales: clasificadosOficiales.length,
      registros_insertados: puntosAInsertar.length
    });

  } catch (error) {
    console.error('❌ Error calculando clasificados J9:', error);
    res.status(500).json({ error: 'Error calculando clasificados', detalles: error.message });
  }
});

// POST /clasificados-j10 - Calcular Cuadro Final (Campeón y Subcampeón)
router.post('/clasificados-j10', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    console.log('🎯 Calculando Cuadro Final (J10)...');

    // 1. Obtener todos los partidos de jornada 10
    const partidosResult = await pool.query(`
      SELECT 
        p.id, p.nombre_local, p.nombre_visita,
        p.goles_local, p.goles_visita,
        p.penales_local, p.penales_visita,
        p.tipo_partido
      FROM sudamericana_partidos p
      JOIN sudamericana_jornadas sj ON p.jornada_id = sj.id
      WHERE sj.numero = 10
      ORDER BY p.id
    `);

    const partidos = partidosResult.rows;
    const partidosSemifinal = partidos.filter(p => p.tipo_partido === 'IDA' || p.tipo_partido === 'VUELTA');
    const partidoFinal = partidos.find(p => p.tipo_partido === 'FINAL');

    // 2. Calcular finalistas (ganadores de semifinales)
    const finalistasOficiales = [];
    const semifinalesIda = partidosSemifinal.filter(p => p.tipo_partido === 'IDA');
    const semifinalesVuelta = partidosSemifinal.filter(p => p.tipo_partido === 'VUELTA');

    for (const vuelta of semifinalesVuelta) {
      const ida = semifinalesIda.find(p => 
        p.nombre_local === vuelta.nombre_visita && 
        p.nombre_visita === vuelta.nombre_local
      );
      if (ida) {
        const ganador = calcularGanadorCruce(ida, vuelta);
        if (ganador) finalistasOficiales.push(ganador);
      }
    }

    // 3. Determinar campeón y subcampeón desde el partido final
    let campeonOficial = null;
    let subcampeonOficial = null;

    if (partidoFinal && partidoFinal.goles_local !== null && partidoFinal.goles_visita !== null) {
      // Usar los finalistas calculados si los nombres en BD son genéricos
      let finalistaLocal = partidoFinal.nombre_local;
      let finalistaVisita = partidoFinal.nombre_visita;
      
      // Si los nombres son genéricos, usar los finalistas calculados
      if (finalistasOficiales.length === 2 && 
          (finalistaLocal.includes('Ganador') || finalistaLocal.includes('SF'))) {
        finalistaLocal = finalistasOficiales[0];
        finalistaVisita = finalistasOficiales[1];
      }
      
      const golesLocal = partidoFinal.goles_local;
      const golesVisita = partidoFinal.goles_visita;
      const penalesLocal = partidoFinal.penales_local || 0;
      const penalesVisita = partidoFinal.penales_visita || 0;

      if (golesLocal > golesVisita) {
        campeonOficial = finalistaLocal;
        subcampeonOficial = finalistaVisita;
      } else if (golesVisita > golesLocal) {
        campeonOficial = finalistaVisita;
        subcampeonOficial = finalistaLocal;
      } else {
        // Empate, se define por penales
        if (penalesLocal > penalesVisita) {
          campeonOficial = finalistaLocal;
          subcampeonOficial = finalistaVisita;
        } else if (penalesVisita > penalesLocal) {
          campeonOficial = finalistaVisita;
          subcampeonOficial = finalistaLocal;
        }
      }
    }

    console.log(`🏆 Finalistas oficiales: ${finalistasOficiales.join(' vs ')}`);
    console.log(`🏆 Campeón oficial: ${campeonOficial || 'Pendiente'}`);
    console.log(`🥈 Subcampeón oficial: ${subcampeonOficial || 'Pendiente'}`);

    // 4. Obtener pronósticos finales virtuales de todos los usuarios
    const pronosticosFinalesResult = await pool.query(`
      SELECT 
        spfv.usuario_id,
        u.nombre as usuario_nombre,
        spfv.equipo_local as finalista_1,
        spfv.equipo_visita as finalista_2,
        spfv.goles_local,
        spfv.goles_visita,
        spfv.penales_local,
        spfv.penales_visita
      FROM sudamericana_pronosticos_final_virtual spfv
      JOIN usuarios u ON spfv.usuario_id = u.id
      WHERE spfv.jornada_id = 10
      ORDER BY spfv.usuario_id
    `);

    console.log(`📊 Pronósticos finales encontrados: ${pronosticosFinalesResult.rows.length}`);
    console.log(`📊 Finalistas oficiales: ${finalistasOficiales.join(' vs ')}`);
    console.log(`📊 Campeón oficial: ${campeonOficial || 'Pendiente'}`);
    console.log(`📊 Subcampeón oficial: ${subcampeonOficial || 'Pendiente'}`);

    const puntosAInsertar = [];

    for (const pronFinal of pronosticosFinalesResult.rows) {
      console.log(`\n👤 Usuario ${pronFinal.usuario_nombre}:`);
      console.log(`   Finalistas pronosticados: ${pronFinal.finalista_1} vs ${pronFinal.finalista_2}`);
      console.log(`   Resultado final pronosticado: ${pronFinal.goles_local}-${pronFinal.goles_visita}`);
      
      const finalistasPronosticados = [pronFinal.finalista_1, pronFinal.finalista_2];
      
      // Determinar campeón y subcampeón pronosticados desde el pronóstico final
      let campeonPronosticado = null;
      let subcampeonPronosticado = null;

      if (pronFinal.goles_local !== null && pronFinal.goles_visita !== null) {
        const golesLocal = pronFinal.goles_local;
        const golesVisita = pronFinal.goles_visita;
        const penalesLocal = pronFinal.penales_local || 0;
        const penalesVisita = pronFinal.penales_visita || 0;

        if (golesLocal > golesVisita) {
          campeonPronosticado = pronFinal.finalista_1;
          subcampeonPronosticado = pronFinal.finalista_2;
        } else if (golesVisita > golesLocal) {
          campeonPronosticado = pronFinal.finalista_2;
          subcampeonPronosticado = pronFinal.finalista_1;
        } else {
          // Empate, se define por penales
          if (penalesLocal > penalesVisita) {
            campeonPronosticado = pronosticoFinal.nombre_local;
            subcampeonPronosticado = pronosticoFinal.nombre_visita;
          } else if (penalesVisita > penalesLocal) {
            campeonPronosticado = pronFinal.finalista_2;
            subcampeonPronosticado = pronFinal.finalista_1;
          }
        }
      }

      // Calcular puntos por finalistas (5 puntos cada uno)
      finalistasPronosticados.forEach((finalista) => {
        const acertoFinalista = finalistasOficiales.length === 2 && finalistasOficiales.includes(finalista);
        console.log(`   Finalista ${finalista}: ${acertoFinalista ? '✅ ACIERTO (+5pts)' : '❌ FALLO (0pts)'}`);
        
        puntosAInsertar.push({
          usuario_id: pronFinal.usuario_id,
          jornada_numero: 10,
          equipo_clasificado: finalista,
          equipo_oficial: finalistasOficiales.length === 2 && acertoFinalista ? finalista : null,
          fase_clasificado: 'FINALISTA',
          puntos: acertoFinalista ? 5 : 0
        });
      });

      // Calcular puntos por campeón (15 puntos)
      if (campeonPronosticado) {
        const acertoCampeon = campeonOficial && campeonOficial === campeonPronosticado;
        console.log(`   Campeón ${campeonPronosticado}: ${acertoCampeon ? '✅ ACIERTO (+15pts)' : '❌ FALLO (0pts)'}`);
        puntosAInsertar.push({
          usuario_id: pronFinal.usuario_id,
          jornada_numero: 10,
          equipo_clasificado: campeonPronosticado,
          equipo_oficial: campeonOficial || null,
          fase_clasificado: 'CAMPEON',
          puntos: acertoCampeon ? 15 : 0
        });
      }

      // Calcular puntos por subcampeón (8 puntos)
      if (subcampeonPronosticado) {
        const acertoSubcampeon = subcampeonOficial && subcampeonOficial === subcampeonPronosticado;
        console.log(`   Subcampeón ${subcampeonPronosticado}: ${acertoSubcampeon ? '✅ ACIERTO (+8pts)' : '❌ FALLO (0pts)'}`);
        puntosAInsertar.push({
          usuario_id: pronFinal.usuario_id,
          jornada_numero: 10,
          equipo_clasificado: subcampeonPronosticado,
          equipo_oficial: subcampeonOficial || null,
          fase_clasificado: 'SUBCAMPEON',
          puntos: acertoSubcampeon ? 8 : 0
        });
      }
    }

    console.log(`\n📝 Total de registros a insertar: ${puntosAInsertar.length}`);

    // 6. Guardar en BD
    await pool.query('DELETE FROM sudamericana_puntos_clasificacion WHERE jornada_numero = 10');

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
      mensaje: 'Cuadro Final J10 calculado exitosamente',
      campeon: campeonOficial,
      subcampeon: subcampeonOficial,
      registros_insertados: puntosAInsertar.length
    });

  } catch (error) {
    console.error('❌ Error calculando cuadro final J10:', error);
    res.status(500).json({ error: 'Error calculando cuadro final', detalles: error.message });
  }
});

export default router;
