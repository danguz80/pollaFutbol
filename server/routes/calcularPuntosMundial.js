import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';
import { calcularTablaOficial, calcularTablaUsuario } from '../utils/calcularClasificadosMundial.js';

const router = express.Router();

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
  if (jornadaNumero === 7) return 'SEMIFINALES'; // Incluye semifinales y final
  return 'FASE DE GRUPOS';
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
        p.id as partido_id,
        p.resultado_local,
        p.resultado_visitante,
        p.equipo_local,
        p.equipo_visitante,
        p.bonus,
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

    let pronosticosActualizados = 0;
    let puntosAsignados = 0;

    // Calcular puntos para cada pronóstico
    for (const pronostico of pronosticosResult.rows) {
      const {
        id,
        pronostico_local,
        pronostico_visita,
        resultado_local,
        resultado_visitante,
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

    // Para jornada 3 (o recalculo total): calcular puntos de clasificación a 16vos de Final
    if (!jornadaNumero || jornadaNumero == 3) {
      try {
        console.log('🔄 Calculando puntos de clasificación J3 (16vos de Final)...');

        const gruposResult = await pool.query(
          `SELECT DISTINCT grupo FROM mundial_partidos WHERE grupo IS NOT NULL ORDER BY grupo`
        );
        const grupos = gruposResult.rows.map(r => r.grupo);

        // Clasificados oficiales: top 2 de cada grupo con al menos 1 partido jugado
        const clasificadosOficiales = {};
        for (const grupo of grupos) {
          const tabla = await calcularTablaOficial(grupo, [1, 2, 3]);
          if (tabla.length >= 2 && tabla[0].pj > 0) {
            clasificadosOficiales[grupo] = [tabla[0].nombre, tabla[1].nombre];
          }
        }

        if (Object.keys(clasificadosOficiales).length > 0) {
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

            for (const grupo of grupos) {
              if (!clasificadosOficiales[grupo]) continue;
              const tablaUser = await calcularTablaUsuario(uid, grupo, [1, 2, 3]);
              if (tablaUser.length < 2) continue;

              const reales = clasificadosOficiales[grupo];
              const predicciones = [
                { equipo: tablaUser[0].nombre, fase: `16VOS_GRUPO_${grupo}_POS1` },
                { equipo: tablaUser[1].nombre, fase: `16VOS_GRUPO_${grupo}_POS2` }
              ];

              for (const pred of predicciones) {
                const pts = reales.includes(pred.equipo) ? 2 : 0;
                await pool.query(
                  `INSERT INTO mundial_puntos_clasificacion (usuario_id, equipo, fase, puntos)
                   VALUES ($1, $2, $3, $4)
                   ON CONFLICT (usuario_id, equipo, fase) DO UPDATE SET puntos = $4`,
                  [uid, pred.equipo, pred.fase, pts]
                );
              }
            }
          }
          console.log(`✅ Puntos clasificación J3 calculados: ${usuariosResult.rows.length} usuarios`);
        }
      } catch (classifErr) {
        console.error('⚠️ Error en puntos clasificación J3:', classifErr.message);
      }
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

// POST /api/mundial-calcular/ganadores — calcular y guardar ganadores de una jornada
router.post('/ganadores', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { jornadaNumero } = req.body;
    if (!jornadaNumero) {
      return res.status(400).json({ error: 'Se requiere jornadaNumero' });
    }
    await calcularGanadoresJornada(parseInt(jornadaNumero));
    await actualizarRankingAcumulado();
    res.json({ mensaje: `✅ Ganadores de Jornada ${jornadaNumero} calculados exitosamente` });
  } catch (error) {
    console.error('❌ Error calculando ganadores:', error);
    res.status(500).json({ error: 'Error calculando ganadores', details: error.message });
  }
});

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
