import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';

const router = express.Router();

// POST /api/libertadores-calcular/puntos - Calcular y asignar puntos a todos los pronósticos
router.post('/puntos', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    // Obtener reglas de puntuación
    const reglasResult = await pool.query('SELECT * FROM libertadores_puntuacion ORDER BY puntos DESC');
    const reglas = reglasResult.rows;

    // Obtener todos los pronósticos con sus resultados reales
    const pronosticosResult = await pool.query(`
      SELECT 
        lp.id,
        lp.usuario_id,
        lp.goles_local as pronostico_local,
        lp.goles_visita as pronostico_visita,
        lp.penales_local as penales_pron_local,
        lp.penales_visita as penales_pron_visita,
        p.id as partido_id,
        p.goles_local as resultado_local,
        p.goles_visita as resultado_visita,
        p.penales_local as penales_real_local,
        p.penales_visita as penales_real_visita,
        p.nombre_local,
        p.nombre_visita,
        lj.numero as jornada_numero
      FROM libertadores_pronosticos lp
      INNER JOIN libertadores_partidos p ON lp.partido_id = p.id
      INNER JOIN libertadores_jornadas lj ON lp.jornada_id = lj.id
      WHERE p.goles_local IS NOT NULL 
        AND p.goles_visita IS NOT NULL
    `);

    let pronosticosActualizados = 0;
    let puntosAsignados = 0;
    let puntosClasificacion = 0;

    console.log(`📊 Total de pronósticos a procesar: ${pronosticosResult.rows.length}`);

    // Calcular puntos para cada pronóstico
    for (const pronostico of pronosticosResult.rows) {
      const {
        id,
        usuario_id,
        pronostico_local,
        pronostico_visita,
        penales_pron_local,
        penales_pron_visita,
        partido_id,
        resultado_local,
        resultado_visita,
        penales_real_local,
        penales_real_visita,
        nombre_local,
        nombre_visita,
        jornada_numero
      } = pronostico;

      // Determinar la fase según el número de jornada
      const fase = getFaseDeJornada(jornada_numero);
      
      // Obtener reglas de puntuación para esta fase
      const puntosSigno = reglas.find(r => r.fase === fase && r.concepto.includes('Signo 1X2'))?.puntos || 1;
      const puntosDiferencia = reglas.find(r => r.fase === fase && r.concepto.includes('Diferencia de goles'))?.puntos || 3;
      const puntosExacto = reglas.find(r => r.fase === fase && r.concepto.includes('Resultado exacto'))?.puntos || 5;

      let puntosGanados = 0;
      
      // Para FINAL en J10: Solo dar puntos si los equipos coinciden con lo pronosticado
      let debeCalcularPuntosFinal = true;
      if (jornada_numero === 10) {
        // Verificar si es el partido FINAL (no tiene complementario)
        const partidoComplementarioResult = await pool.query(`
          SELECT p.id
          FROM libertadores_partidos p
          INNER JOIN libertadores_jornadas lj ON p.jornada_id = lj.id
          WHERE lj.numero = $1
            AND p.nombre_local = $2
            AND p.nombre_visita = $3
        `, [jornada_numero, nombre_visita, nombre_local]);
        
        const esFinal = partidoComplementarioResult.rows.length === 0;
        
        if (esFinal) {
          // Es el partido FINAL: verificar que los equipos coincidan con lo pronosticado
          const prediccionFinalResult = await pool.query(`
            SELECT campeon, subcampeon
            FROM libertadores_predicciones_campeon
            WHERE usuario_id = $1
          `, [usuario_id]);
          
          if (prediccionFinalResult.rows.length > 0) {
            const { campeon, subcampeon } = prediccionFinalResult.rows[0];
            
            // Verificar si los equipos del partido coinciden con campeón/subcampeón pronosticados
            const equiposCoinciden = 
              (campeon === nombre_local && subcampeon === nombre_visita) ||
              (campeon === nombre_visita && subcampeon === nombre_local);
            
            if (!equiposCoinciden) {
              debeCalcularPuntosFinal = false; // NO dar puntos por resultado si los equipos no coinciden
            }
          } else {
            // Si NO hay predicción de campeón, NO dar puntos en la FINAL
            debeCalcularPuntosFinal = false;
          }
        }
      }

      // IMPORTANTE: Los penales NO afectan el cálculo de puntos
      // Solo los goles regulares determinan victoria/empate/derrota
      
      if (debeCalcularPuntosFinal) {
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

      // Actualizar puntos en la base de datos
      await pool.query(
        'UPDATE libertadores_pronosticos SET puntos = $1 WHERE id = $2',
        [puntosGanados, id]
      );

      if (puntosGanados > 0) {
        pronosticosActualizados++;
        puntosAsignados += puntosGanados;
        console.log(`✅ Pronóstico ${id} - Jornada ${jornada_numero}: ${puntosGanados} puntos`);
      }

      // CALCULAR PUNTOS POR EQUIPOS QUE AVANZAN
      // Guardar solo UNA VEZ por cruce para evitar duplicados
      // J8: Guardar todos (todos son VUELTA)
      // J9 y J10: Guardar solo en el partido con ID mayor del cruce
      
      if (jornada_numero >= 8 && jornada_numero <= 10) {
        let equipoQueAvanzaPronostico = null;
        let equipoQueAvanzaReal = null;
        let debeGuardarClasificacion = false;
        
        if (jornada_numero === 8) {
          debeGuardarClasificacion = true;
        } else if (jornada_numero === 9 || jornada_numero === 10) {
          // Buscar el partido complementario (equipos invertidos)
          const partidoComplementarioResult = await pool.query(`
            SELECT p.id
            FROM libertadores_partidos p
            INNER JOIN libertadores_jornadas lj ON p.jornada_id = lj.id
            WHERE lj.numero = $1
              AND p.nombre_local = $2
              AND p.nombre_visita = $3
          `, [jornada_numero, nombre_visita, nombre_local]);
          
          // Solo guardar si tenemos ID mayor (para evitar guardar 2 veces el mismo cruce)
          if (partidoComplementarioResult.rows.length > 0) {
            const idComplementario = partidoComplementarioResult.rows[0].id;
            debeGuardarClasificacion = partido_id > idComplementario;
          }
        }
        
        if (debeGuardarClasificacion) {
        
        if (jornada_numero === 8) {
          // Buscar partido de IDA (jornada 7) con equipos invertidos
          const partidoIdaResult = await pool.query(`
            SELECT goles_local, goles_visita, penales_local, penales_visita
            FROM libertadores_partidos p
            INNER JOIN libertadores_jornadas lj ON p.jornada_id = lj.id
            WHERE lj.numero = 7
              AND p.nombre_local = $1
              AND p.nombre_visita = $2
          `, [nombre_visita, nombre_local]);

          if (partidoIdaResult.rows.length > 0) {
            const partidoIda = partidoIdaResult.rows[0];
            
            // Buscar también el PRONÓSTICO de IDA
            const pronosticoIdaResult = await pool.query(`
              SELECT lp.goles_local as pronostico_ida_local, lp.goles_visita as pronostico_ida_visita,
                     lp.penales_local as penales_pron_ida_local, lp.penales_visita as penales_pron_ida_visita
              FROM libertadores_pronosticos lp
              INNER JOIN libertadores_partidos p ON lp.partido_id = p.id
              INNER JOIN libertadores_jornadas lj ON p.jornada_id = lj.id
              WHERE lj.numero = 7
                AND p.nombre_local = $1
                AND p.nombre_visita = $2
                AND lp.usuario_id = $3
            `, [nombre_visita, nombre_local, usuario_id]);
            
            // Calcular marcador global PRONOSTICADO SIGUIENDO A LOS EQUIPOS POR NOMBRE
            // Equipo LOCAL de VUELTA: goles en VUELTA + sus goles en IDA (cuando era VISITA)
            let pronosticoGlobalLocal = pronostico_local;
            let pronosticoGlobalVisita = pronostico_visita;
            
            if (pronosticoIdaResult.rows.length > 0) {
              const pronosticoIda = pronosticoIdaResult.rows[0];
              pronosticoGlobalLocal = pronostico_local + (pronosticoIda.pronostico_ida_visita || 0);
              pronosticoGlobalVisita = pronostico_visita + (pronosticoIda.pronostico_ida_local || 0);
            }
            
            // Determinar equipo que el usuario pronosticó que avanza CON MARCADOR GLOBAL
            equipoQueAvanzaPronostico = determinarEquipoQueAvanza(
              pronosticoGlobalLocal,
              pronosticoGlobalVisita,
              penales_pron_local,
              penales_pron_visita,
              nombre_local,
              nombre_visita
            );
            
            // Calcular marcador global REAL SIGUIENDO A LOS EQUIPOS POR NOMBRE
            // En VUELTA: nombre_local vs nombre_visita
            // En IDA (invertido): nombre_visita (era local) vs nombre_local (era visita)
            // 
            // Goles del equipo LOCAL de VUELTA:
            // - En VUELTA: resultado_local
            // - En IDA: era VISITA, entonces goles_visita del IDA
            const golesGlobalLocal = resultado_local + (partidoIda.goles_visita || 0);
            
            // Goles del equipo VISITA de VUELTA:
            // - En VUELTA: resultado_visita
            // - En IDA: era LOCAL, entonces goles_local del IDA
            const golesGlobalVisita = resultado_visita + (partidoIda.goles_local || 0);
            
            equipoQueAvanzaReal = determinarEquipoQueAvanza(
              golesGlobalLocal,
              golesGlobalVisita,
              penales_real_local,
              penales_real_visita,
              nombre_local,
              nombre_visita
            );
          }
        } else if (jornada_numero === 9 || jornada_numero === 10) {
          // Para J9 y J10: Buscar partido IDA en la misma jornada con equipos invertidos
          const partidoIdaResult = await pool.query(`
            SELECT goles_local, goles_visita, penales_local, penales_visita
            FROM libertadores_partidos p
            INNER JOIN libertadores_jornadas lj ON p.jornada_id = lj.id
            WHERE lj.numero = $1
              AND p.nombre_local = $2
              AND p.nombre_visita = $3
          `, [jornada_numero, nombre_visita, nombre_local]);

          if (partidoIdaResult.rows.length > 0) {
            const partidoIda = partidoIdaResult.rows[0];
            
            // Buscar también el PRONÓSTICO de IDA en la misma jornada
            const pronosticoIdaResult = await pool.query(`
              SELECT lp.goles_local as pronostico_ida_local, lp.goles_visita as pronostico_ida_visita,
                     lp.penales_local as penales_pron_ida_local, lp.penales_visita as penales_pron_ida_visita
              FROM libertadores_pronosticos lp
              INNER JOIN libertadores_partidos p ON lp.partido_id = p.id
              INNER JOIN libertadores_jornadas lj ON p.jornada_id = lj.id
              WHERE lj.numero = $1
                AND p.nombre_local = $2
                AND p.nombre_visita = $3
                AND lp.usuario_id = $4
            `, [jornada_numero, nombre_visita, nombre_local, usuario_id]);
            
            // Calcular marcador global PRONOSTICADO
            let pronosticoGlobalLocal = pronostico_local;
            let pronosticoGlobalVisita = pronostico_visita;
            
            if (pronosticoIdaResult.rows.length > 0) {
              const pronosticoIda = pronosticoIdaResult.rows[0];
              pronosticoGlobalLocal = pronostico_local + (pronosticoIda.pronostico_ida_visita || 0);
              pronosticoGlobalVisita = pronostico_visita + (pronosticoIda.pronostico_ida_local || 0);
            }
            
            // Determinar equipo que el usuario pronosticó que avanza
            equipoQueAvanzaPronostico = determinarEquipoQueAvanza(
              pronosticoGlobalLocal,
              pronosticoGlobalVisita,
              penales_pron_local,
              penales_pron_visita,
              nombre_local,
              nombre_visita
            );
            
            // Calcular marcador global REAL
            const golesGlobalLocal = resultado_local + (partidoIda.goles_visita || 0);
            const golesGlobalVisita = resultado_visita + (partidoIda.goles_local || 0);
            
            equipoQueAvanzaReal = determinarEquipoQueAvanza(
              golesGlobalLocal,
              golesGlobalVisita,
              penales_real_local,
              penales_real_visita,
              nombre_local,
              nombre_visita
            );
          }
        }

        // SIEMPRE guardar el pronóstico, con puntos o sin puntos
        if (equipoQueAvanzaPronostico) {
          let puntosPorAvance = 0;
          
          if (equipoQueAvanzaReal && equipoQueAvanzaPronostico === equipoQueAvanzaReal) {
            // Determinar a qué fase avanza
            const faseAvance = getFaseAvance(jornada_numero);
            puntosPorAvance = reglas.find(
              r => r.fase === 'CLASIFICACIÓN' && r.concepto.includes(faseAvance)
            )?.puntos || 0;
            
            puntosClasificacion += puntosPorAvance;
          }

          // Guardar siempre (con puntos o sin puntos)
          await pool.query(`
            INSERT INTO libertadores_puntos_clasificacion 
            (usuario_id, partido_id, jornada_numero, equipo_clasificado, fase_clasificado, puntos)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (usuario_id, partido_id, jornada_numero)
            DO UPDATE SET 
              equipo_clasificado = EXCLUDED.equipo_clasificado,
              fase_clasificado = EXCLUDED.fase_clasificado,
              puntos = EXCLUDED.puntos
          `, [usuario_id, partido_id, jornada_numero, equipoQueAvanzaPronostico, getFaseAvance(jornada_numero), puntosPorAvance]);
        }
        } // Fin debeGuardarClasificacion
      }
    }

    // CALCULAR PUNTOS DE CUADRO FINAL (CAMPEÓN Y SUBCAMPEÓN) para J10
    // Buscar si existe un partido FINAL con resultado en jornada 10
    const partidoFinalResult = await pool.query(`
      SELECT p.id, p.nombre_local, p.nombre_visita, p.goles_local, p.goles_visita, 
             p.penales_local, p.penales_visita
      FROM libertadores_partidos p
      INNER JOIN libertadores_jornadas lj ON p.jornada_id = lj.id
      WHERE lj.numero = 10
        AND p.goles_local IS NOT NULL 
        AND p.goles_visita IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM libertadores_partidos p2
          WHERE p2.jornada_id = p.jornada_id
          AND p2.nombre_local = p.nombre_visita
          AND p2.nombre_visita = p.nombre_local
        )
    `);
    
    if (partidoFinalResult.rows.length > 0) {
      const partidoFinal = partidoFinalResult.rows[0];
      
      // Determinar campeón y subcampeón reales
      let campeonReal = null;
      let subcampeonReal = null;
      
      if (partidoFinal.goles_local > partidoFinal.goles_visita) {
        campeonReal = partidoFinal.nombre_local;
        subcampeonReal = partidoFinal.nombre_visita;
      } else if (partidoFinal.goles_local < partidoFinal.goles_visita) {
        campeonReal = partidoFinal.nombre_visita;
        subcampeonReal = partidoFinal.nombre_local;
      } else {
        // Empate, revisar penales
        if (partidoFinal.penales_local !== null && partidoFinal.penales_visita !== null) {
          if (partidoFinal.penales_local > partidoFinal.penales_visita) {
            campeonReal = partidoFinal.nombre_local;
            subcampeonReal = partidoFinal.nombre_visita;
          } else {
            campeonReal = partidoFinal.nombre_visita;
            subcampeonReal = partidoFinal.nombre_local;
          }
        }
      }
      
      if (campeonReal && subcampeonReal) {
        // Obtener reglas de puntuación para Cuadro Final
        const puntosCampeon = reglas.find(r => r.fase === 'CAMPEÓN' && r.concepto.includes('Campeón'))?.puntos || 15;
        const puntosSubcampeon = reglas.find(r => r.fase === 'CAMPEÓN' && r.concepto.includes('Subcampeón'))?.puntos || 8;
        
        // Obtener todas las predicciones
        const predicciones = await pool.query('SELECT * FROM libertadores_predicciones_campeon');
        
        for (const prediccion of predicciones.rows) {
          let puntos_campeon_usuario = 0;
          let puntos_subcampeon_usuario = 0;
          
          if (prediccion.campeon === campeonReal) {
            puntos_campeon_usuario = puntosCampeon;
          }
          
          if (prediccion.subcampeon === subcampeonReal) {
            puntos_subcampeon_usuario = puntosSubcampeon;
          }
          
          await pool.query(`
            UPDATE libertadores_predicciones_campeon 
            SET puntos_campeon = $1, puntos_subcampeon = $2
            WHERE usuario_id = $3
          `, [puntos_campeon_usuario, puntos_subcampeon_usuario, prediccion.usuario_id]);
        }
        
        console.log(`✅ Puntos de Cuadro Final calculados: Campeón: ${campeonReal}, Subcampeón: ${subcampeonReal}`);
      }
    }

    res.json({
      mensaje: 'Puntos calculados exitosamente',
      total_pronosticos: pronosticosResult.rows.length,
      pronosticos_con_puntos: pronosticosActualizados,
      puntos_totales_asignados: puntosAsignados,
      puntos_clasificacion_asignados: puntosClasificacion
    });
  } catch (error) {
    console.error('Error calculando puntos:', error);
    res.status(500).json({ error: 'Error calculando puntos' });
  }
});

// Función auxiliar para determinar el signo 1X2
function getSigno(golesLocal, golesVisita) {
  if (golesLocal > golesVisita) return '1'; // Gana local
  if (golesLocal < golesVisita) return '2'; // Gana visitante
  return 'X'; // Empate
}

// Función para determinar la fase según el número de jornada
function getFaseDeJornada(numeroJornada) {
  if (numeroJornada <= 6) return 'FASE DE GRUPOS';
  if (numeroJornada === 7 || numeroJornada === 8) return 'OCTAVOS';
  if (numeroJornada === 9) return 'CUARTOS';
  if (numeroJornada === 10) return 'SEMIFINALES';
  if (numeroJornada === 11) return 'FINAL';
  return 'FASE DE GRUPOS';
}

// Función para determinar a qué fase avanza el equipo
function getFaseAvance(numeroJornada) {
  if (numeroJornada === 7 || numeroJornada === 8) return 'OCTAVOS';
  if (numeroJornada === 9) return 'CUARTOS';
  if (numeroJornada === 10) return 'SEMIFINALES';
  if (numeroJornada === 11) return 'LA FINAL';
  return '';
}

// Función para determinar qué equipo avanza (considerando penales si hay empate)
function determinarEquipoQueAvanza(golesLocal, golesVisita, penalesLocal, penalesVisita, nombreLocal, nombreVisita) {
  // Si hay diferencia en el marcador global
  if (golesLocal > golesVisita) return nombreLocal;
  if (golesLocal < golesVisita) return nombreVisita;
  
  // Si están empatados, revisar penales
  if (penalesLocal !== null && penalesVisita !== null) {
    if (penalesLocal > penalesVisita) return nombreLocal;
    if (penalesLocal < penalesVisita) return nombreVisita;
  }
  
  // Si no hay resultado definitivo aún
  return null;
}

// POST /api/libertadores-calcular/campeon - Guardar/Actualizar predicción de campeón/subcampeón
router.post('/campeon', verifyToken, async (req, res) => {
  try {
    const usuario_id = req.usuario.id;
    const { campeon, subcampeon } = req.body;

    if (!campeon || !subcampeon) {
      return res.status(400).json({ error: 'Debe seleccionar campeón y subcampeón' });
    }

    await pool.query(`
      INSERT INTO libertadores_predicciones_campeon (usuario_id, campeon, subcampeon)
      VALUES ($1, $2, $3)
      ON CONFLICT (usuario_id)
      DO UPDATE SET 
        campeon = EXCLUDED.campeon,
        subcampeon = EXCLUDED.subcampeon,
        updated_at = CURRENT_TIMESTAMP
    `, [usuario_id, campeon, subcampeon]);

    res.json({ mensaje: 'Predicción guardada exitosamente' });
  } catch (error) {
    console.error('Error guardando predicción de campeón:', error);
    res.status(500).json({ error: 'Error guardando predicción' });
  }
});

// GET /api/libertadores-calcular/campeon/:usuario_id - Obtener predicción de un usuario
router.get('/campeon/:usuario_id', verifyToken, async (req, res) => {
  try {
    const { usuario_id } = req.params;

    const result = await pool.query(
      'SELECT * FROM libertadores_predicciones_campeon WHERE usuario_id = $1',
      [usuario_id]
    );

    if (result.rows.length === 0) {
      return res.json({ campeon: null, subcampeon: null });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obteniendo predicción:', error);
    res.status(500).json({ error: 'Error obteniendo predicción' });
  }
});

// POST /api/libertadores-calcular/puntos-campeon - Calcular puntos de campeón/subcampeón (Admin)
router.post('/puntos-campeon', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { campeon_real, subcampeon_real } = req.body;

    if (!campeon_real || !subcampeon_real) {
      return res.status(400).json({ error: 'Debe especificar el campeón y subcampeón real' });
    }

    // Obtener reglas de puntuación
    const reglasResult = await pool.query('SELECT * FROM libertadores_puntuacion WHERE fase = \'CAMPEÓN\'');
    const reglas = reglasResult.rows;

    const puntosCampeon = reglas.find(r => r.concepto.includes('Campeón'))?.puntos || 15;
    const puntosSubcampeon = reglas.find(r => r.concepto.includes('Subcampeón'))?.puntos || 8;

    // Obtener todas las predicciones
    const predicciones = await pool.query('SELECT * FROM libertadores_predicciones_campeon');

    let usuariosActualizados = 0;
    let puntosAsignados = 0;

    for (const prediccion of predicciones.rows) {
      let puntos_campeon_usuario = 0;
      let puntos_subcampeon_usuario = 0;

      if (prediccion.campeon === campeon_real) {
        puntos_campeon_usuario = puntosCampeon;
        puntosAsignados += puntosCampeon;
      }

      if (prediccion.subcampeon === subcampeon_real) {
        puntos_subcampeon_usuario = puntosSubcampeon;
        puntosAsignados += puntosSubcampeon;
      }

      if (puntos_campeon_usuario > 0 || puntos_subcampeon_usuario > 0) {
        await pool.query(`
          UPDATE libertadores_predicciones_campeon 
          SET puntos_campeon = $1, puntos_subcampeon = $2
          WHERE usuario_id = $3
        `, [puntos_campeon_usuario, puntos_subcampeon_usuario, prediccion.usuario_id]);
        
        usuariosActualizados++;
      }
    }

    res.json({
      mensaje: 'Puntos de campeón/subcampeón calculados exitosamente',
      campeon_real,
      subcampeon_real,
      usuarios_con_puntos: usuariosActualizados,
      puntos_totales_asignados: puntosAsignados
    });
  } catch (error) {
    console.error('Error calculando puntos de campeón:', error);
    res.status(500).json({ error: 'Error calculando puntos de campeón' });
  }
});

export default router;
