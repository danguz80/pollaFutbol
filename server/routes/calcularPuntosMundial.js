import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';
import { calcularTablaOficial, calcularTablaUsuario, calcularMejoresTercerosUsuario } from '../utils/calcularClasificadosMundial.js';

const router = express.Router();

// Función auxiliar para determinar el signo
function getSigno(golesLocal, golesVisita) {
  if (golesLocal > golesVisita) return '1';
  if (golesLocal < golesVisita) return '2';
  return 'X';
}

// Función auxiliar para determinar la fase según la jornada (y subtipo del partido)
function getFaseDeJornada(jornadaNumero, subtipo) {
  if (subtipo === 'final') return 'FINAL';
  if (subtipo === 'tercero_lugar') return 'SEMIFINALES'; // Mismo puntaje que semis
  if (jornadaNumero >= 1 && jornadaNumero <= 3) return 'FASE DE GRUPOS';
  if (jornadaNumero === 4) return '16VOS';
  if (jornadaNumero === 5) return 'OCTAVOS';
  if (jornadaNumero === 6) return 'CUARTOS';
  if (jornadaNumero === 7) return 'SEMIFINALES';
  return 'FASE DE GRUPOS';
}

// Determina ganador/perdedor de un partido dada predicción o resultado real
function getGanadorPerdedor(local, visita, quienAvanza, equipoLocal, equipoVisitante) {
  let winner, loser;
  if (local > visita) { winner = equipoLocal; loser = equipoVisitante; }
  else if (visita > local) { winner = equipoVisitante; loser = equipoLocal; }
  else { winner = quienAvanza || equipoLocal; loser = winner === equipoLocal ? equipoVisitante : equipoLocal; }
  return { winner, loser };
}

// POST /api/mundial-calcular/puntos - Calcular y asignar puntos a todos los pronósticos (o de una jornada específica)
router.post('/puntos', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { jornadaNumero } = req.body; // Jornada opcional
    console.log(`🎯 INICIO calcular puntos Mundial - Jornada: ${jornadaNumero || 'TODAS'}`);
    
    // Obtener reglas de puntuación
    const reglasResult = await pool.query('SELECT * FROM mundial_puntuacion ORDER BY puntos DESC');
    const reglas = reglasResult.rows;

    // Construir consulta con filtro opcional de jornada
    let query = `
      SELECT 
        mp.id,
        mp.usuario_id,
        mp.resultado_local as pronostico_local,
        mp.resultado_visitante as pronostico_visita,
        mp.quien_avanza as pronostico_quien_avanza,
        p.id as partido_id,
        p.resultado_local,
        p.resultado_visitante,
        p.quien_avanzo,
        p.equipo_local,
        p.equipo_visitante,
        p.bonus,
        p.subtipo,
        mj.numero as jornada_numero
      FROM mundial_pronosticos mp
      INNER JOIN mundial_partidos p ON mp.partido_id = p.id
      INNER JOIN mundial_jornadas mj ON mp.jornada_id = mj.id
      WHERE p.resultado_local IS NOT NULL 
        AND p.resultado_visitante IS NOT NULL`;

    const params = [];
    if (jornadaNumero) {
      query += ` AND mj.numero = $1`;
      params.push(jornadaNumero);
    }

    const pronosticosResult = await pool.query(query, params);

    // Pre-cargar brackets virtuales de J7 si hay partidos de final/tercero
    const bracketMap = {}; // usuario_id → {1:equipo, 2:equipo, 3:equipo, 4:equipo}
    const tieneJ7FinalOTercero = pronosticosResult.rows.some(p => p.subtipo === 'final' || p.subtipo === 'tercero_lugar');
    if (tieneJ7FinalOTercero) {
      const brackets = await pool.query(`SELECT usuario_id, equipo, posicion FROM mundial_pronosticos_final_virtual`);
      brackets.rows.forEach(b => {
        if (!bracketMap[b.usuario_id]) bracketMap[b.usuario_id] = {};
        bracketMap[b.usuario_id][b.posicion] = b.equipo;
      });
    }

    let pronosticosActualizados = 0;
    let puntosAsignados = 0;

    // Calcular puntos para cada pronóstico
    for (const pronostico of pronosticosResult.rows) {
      const {
        id,
        usuario_id,
        pronostico_local,
        pronostico_visita,
        pronostico_quien_avanza,
        resultado_local,
        resultado_visitante,
        quien_avanzo,
        bonus,
        subtipo,
        jornada_numero,
        equipo_local,
        equipo_visitante
      } = pronostico;

      // Bonus del partido (x1, x2, x3, etc.)
      const bonusMultiplicador = bonus || 1;

      // Determinar la fase según el número de jornada
      const fase = getFaseDeJornada(jornada_numero, subtipo);
      
      // Obtener reglas de puntuación para esta fase
      const puntosSigno = reglas.find(r => r.fase === fase && r.concepto.includes('Signo 1X2'))?.puntos || 1;
      const puntosDiferencia = reglas.find(r => r.fase === fase && r.concepto.includes('Diferencia de goles'))?.puntos || 3;
      const puntosExacto = reglas.find(r => r.fase === fase && r.concepto.includes('Resultado exacto'))?.puntos || 5;

      let puntosGanados = 0;
      
      // 1. Verificar resultado exacto (mayor puntuación)
      if (pronostico_local === resultado_local && pronostico_visita === resultado_visitante) {
        puntosGanados = puntosExacto;
      }
      // 2. Verificar diferencia de goles
      else if (Math.abs(pronostico_local - pronostico_visita) === Math.abs(resultado_local - resultado_visitante)) {
        // Además, debe coincidir el signo (quién gana)
        const signoPronostico = getSigno(pronostico_local, pronostico_visita);
        const signoResultado = getSigno(resultado_local, resultado_visitante);
        
        if (signoPronostico === signoResultado) {
          puntosGanados = puntosDiferencia;
        }
      }
      // 3. Verificar solo signo 1X2
      else {
        const signoPronostico = getSigno(pronostico_local, pronostico_visita);
        const signoResultado = getSigno(resultado_local, resultado_visitante);
        
        if (signoPronostico === signoResultado) {
          puntosGanados = puntosSigno;
        }
      }

      // Multiplicar puntos por el bonus del partido
      // NOTA: +2 pts por quien avanza NO van aquí, van en mundial_puntos_clasificacion (sin bonus)

      // Para partidos de Final y Tercer Lugar (J7): verificar que el bracket virtual coincide
      if ((subtipo === 'final' || subtipo === 'tercero_lugar') && puntosGanados > 0) {
        const userBracket = bracketMap[usuario_id] || {};
        let predLocal, predVisita;
        if (subtipo === 'final') { predLocal = userBracket[1]; predVisita = userBracket[2]; }
        else { predLocal = userBracket[3]; predVisita = userBracket[4]; }
        const realTeams = new Set([equipo_local, equipo_visitante]);
        const bracketMatch = predLocal && predVisita && realTeams.has(predLocal) && realTeams.has(predVisita);
        if (!bracketMatch) puntosGanados = 0; // Equipos no coinciden → 0 pts
      }

      const puntosFinales = puntosGanados * bonusMultiplicador;

      // Actualizar puntos en la base de datos
      await pool.query(
        'UPDATE mundial_pronosticos SET puntos = $1 WHERE id = $2',
        [puntosFinales, id]
      );

      if (puntosFinales > 0) {
        pronosticosActualizados++;
        puntosAsignados += puntosFinales;
      }
    }

    console.log(`✅ Puntos calculados: ${pronosticosActualizados} pronósticos actualizados, ${puntosAsignados} puntos totales asignados`);

    // J3: clasificación a 16vos se calcula aquí (basada en tabla de grupos)
    // J4-J7: clasificación (quien avanza) se calcula en POST /ganadores
    if (!jornadaNumero || jornadaNumero === 3) {
      await calcularPuntosClasificacionPorJornada(3, '16VOS');
    }

    // Actualizar ranking acumulado
    await actualizarRankingAcumulado();

    res.json({ 
      mensaje: `✅ Puntajes calculados exitosamente para ${jornadaNumero ? `Jornada ${jornadaNumero}` : 'todas las jornadas'}`,
      pronosticosActualizados,
      puntosAsignados
    });

  } catch (error) {
    console.error('❌ Error calculando puntos Mundial:', error);
    res.status(500).json({ error: 'Error calculando puntos', details: error.message });
  }
});

// POST /api/mundial-calcular/ganador-fase-grupos — Ganador acumulado J1+J2+J3
router.post('/ganador-fase-grupos', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    console.log('🌟 Calculando Ganador Fase de Grupos Mundial...');

    const result = await pool.query(`
      SELECT
        u.id, u.nombre, u.foto_perfil,
        COALESCE(partidos.total, 0) + COALESCE(clasificacion.total, 0) AS puntos_totales
      FROM usuarios u
      LEFT JOIN (
        SELECT mp.usuario_id, SUM(mp.puntos) AS total
        FROM mundial_pronosticos mp
        INNER JOIN mundial_jornadas mj ON mp.jornada_id = mj.id
        WHERE mj.numero IN (1, 2, 3)
        GROUP BY mp.usuario_id
      ) partidos ON u.id = partidos.usuario_id
      LEFT JOIN (
        SELECT usuario_id, SUM(puntos) AS total
        FROM mundial_puntos_clasificacion
        WHERE fase LIKE '16VOS_%'
        GROUP BY usuario_id
      ) clasificacion ON u.id = clasificacion.usuario_id
      WHERE u.rol != 'admin'
        AND (partidos.total IS NOT NULL OR clasificacion.total IS NOT NULL)
      ORDER BY puntos_totales DESC, u.nombre ASC
    `);

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'No hay pronósticos en J1-J3 para calcular el ganador' });
    }

    await pool.query('DELETE FROM mundial_ganadores_fase_grupos');

    let pos = 1;
    let prevPuntos = null;
    for (let i = 0; i < Math.min(result.rows.length, 3); i++) {
      const row = result.rows[i];
      const puntos = parseFloat(row.puntos_totales);
      if (prevPuntos !== null && puntos < prevPuntos) pos = i + 1;
      await pool.query(
        `INSERT INTO mundial_ganadores_fase_grupos (usuario_id, puntos, posicion) VALUES ($1, $2, $3)`,
        [row.id, puntos, pos]
      );
      prevPuntos = puntos;
    }

    const winner = result.rows[0];
    console.log(`✅ Ganador Fase de Grupos: ${winner.nombre} — ${winner.puntos_totales} pts`);

    // Registrar notificación para todos los usuarios
    try {
      await pool.query(
        `DELETE FROM notificaciones WHERE competencia = 'mundial' AND tipo_notificacion = 'ganador_fase_grupos'`
      );
      await pool.query(
        `INSERT INTO notificaciones (competencia, tipo, tipo_notificacion, jornada_numero, ganadores, mensaje, icono, url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          'mundial',
          'fase_grupos',
          'ganador_fase_grupos',
          3,
          JSON.stringify([{ nombre: winner.nombre, puntaje: parseFloat(winner.puntos_totales), foto_perfil: winner.foto_perfil }]),
          `🌟 Ganador Fase de Grupos Mundial: ${winner.nombre} con ${parseFloat(winner.puntos_totales)} pts`,
          '🌟',
          '/mundial'
        ]
      );
      console.log('🔔 Notificación ganador fase de grupos creada');
      // Emitir evento para que los clientes conectados recarguen notificaciones
      if (req.app.get('io')) req.app.get('io').emit('nuevaNotificacion');
    } catch (notifError) {
      console.error('⚠️ Error creando notificación fase de grupos:', notifError.message);
    }

    res.json({
      mensaje: `✅ Ganador Fase de Grupos: ${winner.nombre}`,
      ganador: { nombre: winner.nombre, foto_perfil: winner.foto_perfil, puntos: parseFloat(winner.puntos_totales) }
    });
  } catch (error) {
    console.error('❌ Error calculando ganador fase de grupos:', error);
    res.status(500).json({ error: 'Error calculando ganador fase de grupos', details: error.message });
  }
});

// POST /api/mundial-calcular/ganadores — calcular y guardar ganadores de una jornada
router.post('/ganadores', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { jornadaNumero } = req.body;
    if (!jornadaNumero) {
      return res.status(400).json({ error: 'Se requiere jornadaNumero' });
    }
    
    const jNum = parseInt(jornadaNumero);

    // Para J4-J7: calcular primero los puntos de clasificación (quien avanza en empates)
    // SIN bonus — van a mundial_puntos_clasificacion por separado
    if (jNum === 4) {
      await calcularPuntosClasificacionPorJornada(4, '8VOS');
    } else if (jNum === 5) {
      await calcularPuntosClasificacionPorJornada(5, 'CUARTOS');
    } else if (jNum === 6) {
      await calcularPuntosClasificacionPorJornada(6, 'SEMIFINALES');
    } else if (jNum === 7) {
      await calcularPuntosClasificacionPorJornada(7, 'FINAL');
    }

    await calcularGanadoresJornada(jNum);
    await actualizarRankingAcumulado();
    
    res.json({ mensaje: `✅ Ganadores de Jornada ${jornadaNumero} calculados exitosamente` });
  } catch (error) {
    console.error('❌ Error calculando ganadores:', error);
    res.status(500).json({ error: 'Error calculando ganadores', details: error.message });
  }
});

// POST /api/mundial-calcular/crear-partidos-finales — crea los partidos de Final y 3er Lugar basado en resultados reales de semis
router.post('/crear-partidos-finales', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const semis = await pool.query(`
      SELECT p.id, p.equipo_local, p.equipo_visitante, p.resultado_local, p.resultado_visitante, p.quien_avanzo, mj.id as jornada_id
      FROM mundial_partidos p INNER JOIN mundial_jornadas mj ON p.jornada_id=mj.id
      WHERE mj.numero=7 AND p.subtipo='semifinal' AND p.resultado_local IS NOT NULL
      ORDER BY p.id`);
    if (semis.rows.length < 2) return res.status(400).json({ error: 'No hay 2 resultados de semifinales registrados' });
    const jornadaId = semis.rows[0].jornada_id;
    const s1 = getGanadorPerdedor(semis.rows[0].resultado_local, semis.rows[0].resultado_visitante, semis.rows[0].quien_avanzo, semis.rows[0].equipo_local, semis.rows[0].equipo_visitante);
    const s2 = getGanadorPerdedor(semis.rows[1].resultado_local, semis.rows[1].resultado_visitante, semis.rows[1].quien_avanzo, semis.rows[1].equipo_local, semis.rows[1].equipo_visitante);
    const existing = await pool.query(`SELECT subtipo FROM mundial_partidos WHERE jornada_id=$1 AND subtipo IN ('final','tercero_lugar')`, [jornadaId]);
    const existSubtipos = new Set(existing.rows.map(r => r.subtipo));
    const created = [];
    if (!existSubtipos.has('tercero_lugar')) {
      await pool.query(`INSERT INTO mundial_partidos (jornada_id,equipo_local,equipo_visitante,bonus,subtipo) VALUES ($1,$2,$3,1,'tercero_lugar')`, [jornadaId, s1.loser, s2.loser]);
      created.push(`3er Lugar: ${s1.loser} vs ${s2.loser}`);
    }
    if (!existSubtipos.has('final')) {
      await pool.query(`INSERT INTO mundial_partidos (jornada_id,equipo_local,equipo_visitante,bonus,subtipo) VALUES ($1,$2,$3,1,'final')`, [jornadaId, s1.winner, s2.winner]);
      created.push(`Final: ${s1.winner} vs ${s2.winner}`);
    }
    if (created.length === 0) return res.json({ mensaje: 'Los partidos finales ya existen' });
    res.json({ mensaje: `✅ Partidos creados: ${created.join(' | ')}`, created });
  } catch (error) {
    console.error('❌ Error creando partidos finales:', error);
    res.status(500).json({ error: 'Error creando partidos finales', details: error.message });
  }
});

// POST /api/mundial-calcular/ganadores-acumulado-final — declara el pódio definitivo del acumulado
router.post('/ganadores-acumulado-final', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    console.log('🏆 Declarando campeones finales del acumulado Mundial...');
    // Primero recalcular el ranking con los datos actuales
    await actualizarRankingAcumulado();

    // Marcar como NO definitivo todos, luego marcar los 3 primeros como definitivo
    await pool.query(`UPDATE mundial_ganadores_acumulado SET definitivo = FALSE`);
    const result = await pool.query(`
      UPDATE mundial_ganadores_acumulado SET definitivo = TRUE
      WHERE posicion IN (1,2,3)
      RETURNING usuario_id, posicion, puntos_totales
    `);

    const ganadores = await pool.query(`
      SELECT u.nombre, mga.posicion, mga.puntos_totales
      FROM mundial_ganadores_acumulado mga
      INNER JOIN usuarios u ON u.id = mga.usuario_id
      WHERE mga.definitivo = TRUE
      ORDER BY mga.posicion
    `);

    const resumen = ganadores.rows.map(g => `${g.posicion}°: ${g.nombre} (${g.puntos_totales} pts)`).join(', ');
    console.log(`✅ Campeones definitivos: ${resumen}`);

    res.json({
      mensaje: `✅ Campeones del Acumulado declarados: ${resumen}`,
      ganadores: ganadores.rows
    });
  } catch (error) {
    console.error('❌ Error declarando campeones finales:', error);
    res.status(500).json({ error: 'Error declarando campeones finales', details: error.message });
  }
});

// Función auxiliar para calcular los puntos de clasificación a 16vos de Final
async function calcularPuntosClasificacionMundial() {
  try {
    console.log('🔄 Calculando puntos de clasificación para el Mundial (16vos de Final)');

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

    if (real32.size === 0) {
      console.log('⚠️ Sin resultados reales, omitiendo puntos clasificación');
      return;
    }

    const usuariosResult = await pool.query(
      `SELECT DISTINCT u.id FROM usuarios u
       INNER JOIN mundial_pronosticos mp ON u.id = mp.usuario_id
       INNER JOIN mundial_jornadas mj ON mp.jornada_id = mj.id
       WHERE mj.numero IN (1,2,3) AND u.rol != 'admin'`
    );

    for (const { id: uid } of usuariosResult.rows) {
      await pool.query(
        `DELETE FROM mundial_puntos_clasificacion WHERE usuario_id = $1 AND fase LIKE '16VOS_%'`,
        [uid]
      );
      await pool.query(
        `DELETE FROM mundial_mejores_terceros_usuario WHERE usuario_id = $1`,
        [uid]
      );

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

    console.log(`✅ Puntos de clasificación recalculados para ${usuariosResult.rows.length} usuarios`);
  } catch (classifErr) {
    console.error('⚠️ Error calculando puntos de clasificación:', classifErr.message);
  }
}

// Función para calcular clasificación según la jornada (SIN aplicar bonus)
async function calcularPuntosClasificacionPorJornada(jornadaNumero, faseClasif) {
  try {
    console.log(`🔄 Calculando puntos de clasificación para J${jornadaNumero} (${faseClasif})...`);

    // ── J7: FINAL ─────────────────────────────────────────────────────────────
    if (jornadaNumero === 7 && faseClasif === 'FINAL') {
      // Obtener partido final y tercer lugar con resultados
      const finalQ = await pool.query(`
        SELECT p.id, p.equipo_local, p.equipo_visitante, p.resultado_local, p.resultado_visitante, p.quien_avanzo
        FROM mundial_partidos p INNER JOIN mundial_jornadas mj ON p.jornada_id=mj.id
        WHERE mj.numero=7 AND p.subtipo='final' AND p.resultado_local IS NOT NULL`);
      const terceroQ = await pool.query(`
        SELECT p.id, p.equipo_local, p.equipo_visitante, p.resultado_local, p.resultado_visitante, p.quien_avanzo
        FROM mundial_partidos p INNER JOIN mundial_jornadas mj ON p.jornada_id=mj.id
        WHERE mj.numero=7 AND p.subtipo='tercero_lugar' AND p.resultado_local IS NOT NULL`);

      if (finalQ.rows.length === 0) {
        console.log('⚠️ Final aún no jugada, omitiendo clasificación FINAL');
        return;
      }
      const fm = finalQ.rows[0];
      const { winner: realCampeon, loser: realSubcampeon } = getGanadorPerdedor(
        fm.resultado_local, fm.resultado_visitante, fm.quien_avanzo, fm.equipo_local, fm.equipo_visitante);
      const realFinalTeams = new Set([fm.equipo_local, fm.equipo_visitante]);

      let realTercero = null, realCuarto = null, tmRow = null;
      if (terceroQ.rows.length > 0) {
        tmRow = terceroQ.rows[0];
        const r3 = getGanadorPerdedor(tmRow.resultado_local, tmRow.resultado_visitante, tmRow.quien_avanzo, tmRow.equipo_local, tmRow.equipo_visitante);
        realTercero = r3.winner; realCuarto = r3.loser;
      }

      // Borrar clasificación FINAL anterior
      await pool.query(`DELETE FROM mundial_puntos_clasificacion WHERE fase LIKE 'FINAL_%'`);

      // Obtener todos los brackets virtuales
      const bracketsAll = await pool.query(`SELECT usuario_id, equipo, posicion FROM mundial_pronosticos_final_virtual`);
      const allBrackets = {};
      bracketsAll.rows.forEach(b => {
        if (!allBrackets[b.usuario_id]) allBrackets[b.usuario_id] = {};
        allBrackets[b.usuario_id][b.posicion] = b.equipo;
      });

      let insertados = 0;
      for (const [uid, b] of Object.entries(allBrackets)) {
        const userId = parseInt(uid);
        const vFinalL = b[1], vFinalV = b[2], vTercL = b[3], vTercV = b[4];

        // 5 pts por cada equipo correctamente predicho en la final
        for (const eq of [vFinalL, vFinalV]) {
          if (eq && realFinalTeams.has(eq)) {
            await pool.query(
              `INSERT INTO mundial_puntos_clasificacion (usuario_id,equipo,fase,puntos) VALUES ($1,$2,'FINAL_CLASIFICADO',5) ON CONFLICT (usuario_id,equipo,fase) DO UPDATE SET puntos=5`,
              [userId, eq]);
            insertados++;
          }
        }

        // Verificar si el bracket final del usuario coincide con el partido real
        const vFinalTeams = new Set([vFinalL, vFinalV].filter(Boolean));
        const finalTeamsOK = vFinalL && vFinalV && realFinalTeams.has(vFinalL) && realFinalTeams.has(vFinalV);

        if (finalTeamsOK) {
          // Obtener predicción del usuario para el partido final real
          const userFinalPred = await pool.query(
            `SELECT resultado_local, resultado_visitante, quien_avanza FROM mundial_pronosticos WHERE partido_id=$1 AND usuario_id=$2`,
            [fm.id, userId]);
          if (userFinalPred.rows.length > 0) {
            const ufp = userFinalPred.rows[0];
            const { winner: predCampeon, loser: predSubcampeon } = getGanadorPerdedor(
              ufp.resultado_local, ufp.resultado_visitante, ufp.quien_avanza, fm.equipo_local, fm.equipo_visitante);
            // 20 pts campeón
            if (predCampeon === realCampeon) {
              await pool.query(`INSERT INTO mundial_puntos_clasificacion (usuario_id,equipo,fase,puntos) VALUES ($1,$2,'FINAL_CAMPEON',20) ON CONFLICT (usuario_id,equipo,fase) DO UPDATE SET puntos=20`, [userId, realCampeon]);
              insertados++;
            }
            // 10 pts subcampeón
            if (predSubcampeon === realSubcampeon) {
              await pool.query(`INSERT INTO mundial_puntos_clasificacion (usuario_id,equipo,fase,puntos) VALUES ($1,$2,'FINAL_SUBCAMPEON',10) ON CONFLICT (usuario_id,equipo,fase) DO UPDATE SET puntos=10`, [userId, realSubcampeon]);
              insertados++;
            }
          }
        }

        // 5 pts tercer lugar
        if (realTercero && tmRow && vTercL && vTercV) {
          const vTercTeams = new Set([vTercL, vTercV]);
          const realTercTeams = new Set([tmRow.equipo_local, tmRow.equipo_visitante]);
          const tercTeamsOK = realTercTeams.has(vTercL) && realTercTeams.has(vTercV);
          if (tercTeamsOK) {
            const userTercPred = await pool.query(
              `SELECT resultado_local, resultado_visitante, quien_avanza FROM mundial_pronosticos WHERE partido_id=$1 AND usuario_id=$2`,
              [tmRow.id, userId]);
            if (userTercPred.rows.length > 0) {
              const utp = userTercPred.rows[0];
              const { winner: predTercero, loser: predCuarto } = getGanadorPerdedor(utp.resultado_local, utp.resultado_visitante, utp.quien_avanza, tmRow.equipo_local, tmRow.equipo_visitante);
              // 5 pts 3er lugar
              if (predTercero === realTercero) {
                await pool.query(`INSERT INTO mundial_puntos_clasificacion (usuario_id,equipo,fase,puntos) VALUES ($1,$2,'FINAL_TERCERO',5) ON CONFLICT (usuario_id,equipo,fase) DO UPDATE SET puntos=5`, [userId, realTercero]);
                insertados++;
              }
              // 5 pts 4to lugar
              if (predCuarto === realCuarto) {
                await pool.query(`INSERT INTO mundial_puntos_clasificacion (usuario_id,equipo,fase,puntos) VALUES ($1,$2,'FINAL_CUARTO',5) ON CONFLICT (usuario_id,equipo,fase) DO UPDATE SET puntos=5`, [userId, realCuarto]);
                insertados++;
              }
            }
          }
        }
      }
      console.log(`✅ Clasificación FINAL calculada: ${insertados} registros para ${Object.keys(allBrackets).length} usuarios`);
      return;
    }

    if (jornadaNumero === 3 && faseClasif === '16VOS') {
      // J3: clasificación a 16vos de Final basada en tabla de grupos
      const gruposResult = await pool.query(
        `SELECT DISTINCT grupo FROM mundial_partidos WHERE grupo IS NOT NULL ORDER BY grupo`
      );
      const grupos = gruposResult.rows.map(r => r.grupo);

      // Clasificados oficiales: top 2 + mejores 3ros
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

      if (real32.size === 0) {
        console.log('⚠️ Sin resultados reales, omitiendo puntos clasificación');
        return;
      }

      const usuariosResult = await pool.query(
        `SELECT DISTINCT u.id FROM usuarios u
         INNER JOIN mundial_pronosticos mp ON u.id = mp.usuario_id
         INNER JOIN mundial_jornadas mj ON mp.jornada_id = mj.id
         WHERE mj.numero IN (1,2,3) AND u.rol != 'admin'`
      );

      for (const { id: uid } of usuariosResult.rows) {
        // Limpiar registros anteriores
        await pool.query(
          `DELETE FROM mundial_puntos_clasificacion WHERE usuario_id = $1 AND fase LIKE '16VOS_%'`,
          [uid]
        );
        await pool.query(
          `DELETE FROM mundial_mejores_terceros_usuario WHERE usuario_id = $1`,
          [uid]
        );

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
          const pts = real32.has(pred.equipo) ? 2 : 0; // 2 puntos SIN bonus
          await pool.query(
            `INSERT INTO mundial_puntos_clasificacion (usuario_id, equipo, fase, puntos)
             VALUES ($1,$2,$3,$4)
             ON CONFLICT (usuario_id, equipo, fase) DO UPDATE SET puntos = EXCLUDED.puntos`,
            [uid, pred.equipo, pred.fase, pts]
          );
        }
      }

      console.log(`✅ Clasificación a 16vos calculada para ${usuariosResult.rows.length} usuarios`);
      return;
    }

    // Para J4-J7: 2 pts por acertar quien avanza en partidos de empate
    // 2 pts por acertar el equipo que avanza en cada partido (independiente de si fue empate o victoria)
    // SIN aplicar bonus — puntos fijos en mundial_puntos_clasificacion
    const allMatchesResult = await pool.query(`
      SELECT p.id as partido_id, p.equipo_local, p.equipo_visitante,
             p.resultado_local, p.resultado_visitante, p.quien_avanzo
      FROM mundial_partidos p
      INNER JOIN mundial_jornadas mj ON p.jornada_id = mj.id
      WHERE mj.numero = $1
        AND p.resultado_local IS NOT NULL
        AND p.resultado_visitante IS NOT NULL
      ORDER BY p.id
    `, [jornadaNumero]);

    if (allMatchesResult.rows.length === 0) {
      console.log(`⚠️ No hay partidos con resultados para J${jornadaNumero}`);
      return;
    }

    // Determinar el equipo que realmente avanzó en cada partido
    const matchesConAvanzado = allMatchesResult.rows.map(m => {
      let avanzado;
      if (m.resultado_local > m.resultado_visitante) avanzado = m.equipo_local;
      else if (m.resultado_visitante > m.resultado_local) avanzado = m.equipo_visitante;
      else avanzado = m.quien_avanzo; // empate → penales
      return { ...m, avanzado };
    }).filter(m => m.avanzado !== null);

    if (matchesConAvanzado.length === 0) {
      console.log(`⚠️ No hay partidos con ganador/avanzado definido para J${jornadaNumero}`);
      return;
    }

    // Borrar clasificación anterior de esta fase
    await pool.query(
      `DELETE FROM mundial_puntos_clasificacion WHERE fase LIKE $1`,
      [`${faseClasif}_%`]
    );

    const usuariosResult = await pool.query(`
      SELECT DISTINCT u.id FROM usuarios u
      INNER JOIN mundial_pronosticos mp ON u.id = mp.usuario_id
      INNER JOIN mundial_jornadas mj ON mp.jornada_id = mj.id
      WHERE mj.numero = $1 AND u.rol != 'admin'
    `, [jornadaNumero]);

    // Puntos por acierto según jornada: J4=2pts (→Octavos), J5=3pts (→Cuartos), J6=3pts (→Semis), J7=5pts (→Final)
    const puntosClasif = { 4: 2, 5: 3, 6: 3, 7: 5 };
    const ptsAcierto = puntosClasif[jornadaNumero] || 2;

    let insertados = 0;
    for (const match of matchesConAvanzado) {
      for (const { id: uid } of usuariosResult.rows) {
        const predResult = await pool.query(`
          SELECT resultado_local, resultado_visitante, quien_avanza
          FROM mundial_pronosticos
          WHERE partido_id = $1 AND usuario_id = $2
        `, [match.partido_id, uid]);

        if (predResult.rows.length === 0) continue;
        const pred = predResult.rows[0];

        // Determinar el equipo que el usuario predijo que avanzaría
        let predAvanzado;
        if (pred.resultado_local > pred.resultado_visitante) predAvanzado = match.equipo_local;
        else if (pred.resultado_visitante > pred.resultado_local) predAvanzado = match.equipo_visitante;
        else predAvanzado = pred.quien_avanza; // el usuario predijo empate, ¿quién avanza?

        if (predAvanzado && predAvanzado === match.avanzado) {
          const fase = `${faseClasif}_PARTIDO_${match.partido_id}`;
          await pool.query(
            `INSERT INTO mundial_puntos_clasificacion (usuario_id, equipo, fase, puntos)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (usuario_id, equipo, fase) DO UPDATE SET puntos = $4`,
            [uid, match.avanzado, fase, ptsAcierto]
          );
          insertados++;
        }
      }
    }

    console.log(`✅ Clasificación ${faseClasif} calculada: ${insertados} aciertos / ${matchesConAvanzado.length} partidos / ${usuariosResult.rows.length} usuarios`);

  } catch (classifErr) {
    console.error(`⚠️ Error calculando clasificación J${jornadaNumero}:`, classifErr.message);
  }
}

// Función auxiliar para calcular ganadores de una jornada
async function calcularGanadoresJornada(jornadaNumero) {
  try {
    // Verificar que la jornada existe y está cerrada
    const jornadaCheck = await pool.query(`
      SELECT id, cerrada FROM mundial_jornadas WHERE numero = $1
    `, [jornadaNumero]);

    if (jornadaCheck.rows.length === 0) {
      console.log(`⚠️ Jornada ${jornadaNumero} no encontrada`);
      return;
    }

    if (!jornadaCheck.rows[0].cerrada) {
      console.log(`⚠️ Jornada ${jornadaNumero} no está cerrada`);
      return;
    }

    // Calcular ranking de la jornada
    const rankingQuery = `
      SELECT 
        u.id,
        u.nombre,
        u.foto_perfil,
        COALESCE(puntos_partidos.total, 0) as puntos_jornada
      FROM usuarios u
      LEFT JOIN (
        SELECT mp.usuario_id, SUM(mp.puntos) as total
        FROM mundial_pronosticos mp
        INNER JOIN mundial_jornadas mj ON mp.jornada_id = mj.id
        WHERE mj.numero = $1
        GROUP BY mp.usuario_id
      ) puntos_partidos ON u.id = puntos_partidos.usuario_id
      WHERE puntos_partidos.total IS NOT NULL AND puntos_partidos.total > 0
      ORDER BY puntos_jornada DESC, u.nombre ASC
    `;

    const rankingResult = await pool.query(rankingQuery, [jornadaNumero]);

    if (rankingResult.rows.length === 0) {
      console.log(`⚠️ No hay pronósticos para jornada ${jornadaNumero}`);
      return;
    }

    // Determinar posiciones (manejo de empates)
    let posicion = 1;
    let puntajeAnterior = null;
    const ganadores = [];

    for (let i = 0; i < rankingResult.rows.length; i++) {
      const usuario = rankingResult.rows[i];
      const puntos = parseInt(usuario.puntos_jornada);

      if (puntajeAnterior !== null && puntos < puntajeAnterior) {
        posicion = i + 1;
      }

      ganadores.push({
        usuario_id: usuario.id,
        puntos: puntos,
        posicion: posicion
      });

      puntajeAnterior = puntos;
    }

    // Borrar ganadores anteriores de esta jornada
    await pool.query(
      'DELETE FROM mundial_ganadores_jornada WHERE jornada_numero = $1',
      [jornadaNumero]
    );

    // Guardar ganadores
    for (const ganador of ganadores) {
      await pool.query(`
        INSERT INTO mundial_ganadores_jornada (usuario_id, jornada_numero, puntos, posicion)
        VALUES ($1, $2, $3, $4)
      `, [ganador.usuario_id, jornadaNumero, ganador.puntos, ganador.posicion]);
    }

    console.log(`✅ Ganadores de jornada ${jornadaNumero} calculados: ${ganadores.filter(g => g.posicion === 1).length} en primer lugar`);

  } catch (error) {
    console.error(`❌ Error calculando ganadores de jornada ${jornadaNumero}:`, error);
  }
}

// Función auxiliar para actualizar el ranking acumulado
async function actualizarRankingAcumulado() {
  try {
    // Calcular puntos totales por usuario (pronósticos + clasificación)
    const rankingQuery = `
      SELECT
        u.id,
        u.nombre,
        COALESCE(pts.total_partidos, 0) + COALESCE(clasif.total_clasif, 0) as puntos_totales,
        COALESCE(jg.jornadas_ganadas, 0) as jornadas_ganadas
      FROM usuarios u
      LEFT JOIN (
        SELECT usuario_id, SUM(puntos) as total_partidos
        FROM mundial_pronosticos GROUP BY usuario_id
      ) pts ON u.id = pts.usuario_id
      LEFT JOIN (
        SELECT usuario_id, SUM(puntos) as total_clasif
        FROM mundial_puntos_clasificacion GROUP BY usuario_id
      ) clasif ON u.id = clasif.usuario_id
      LEFT JOIN (
        SELECT usuario_id, COUNT(DISTINCT jornada_numero) as jornadas_ganadas
        FROM mundial_ganadores_jornada WHERE posicion = 1
        GROUP BY usuario_id
      ) jg ON u.id = jg.usuario_id
      WHERE u.rol != 'admin'
        AND (COALESCE(pts.total_partidos, 0) + COALESCE(clasif.total_clasif, 0)) > 0
      ORDER BY puntos_totales DESC, u.nombre ASC
    `;

    const rankingResult = await pool.query(rankingQuery);

    // Determinar posiciones
    let posicion = 1;
    let puntajeAnterior = null;

    for (let i = 0; i < rankingResult.rows.length; i++) {
      const usuario = rankingResult.rows[i];
      const puntos = parseInt(usuario.puntos_totales);

      if (puntajeAnterior !== null && puntos < puntajeAnterior) {
        posicion = i + 1;
      }

      // Actualizar o insertar en ganadores acumulado
      await pool.query(`
        INSERT INTO mundial_ganadores_acumulado (usuario_id, puntos_totales, posicion, jornadas_ganadas, actualizado_en)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (usuario_id)
        DO UPDATE SET 
          puntos_totales = $2,
          posicion = $3,
          jornadas_ganadas = $4,
          actualizado_en = NOW()
      `, [usuario.id, puntos, posicion, usuario.jornadas_ganadas]);

      puntajeAnterior = puntos;
    }

    console.log(`✅ Ranking acumulado actualizado: ${rankingResult.rows.length} usuarios`);

  } catch (error) {
    console.error('❌ Error actualizando ranking acumulado:', error);
  }
}

export default router;
