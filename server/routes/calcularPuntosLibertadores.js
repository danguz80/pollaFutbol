import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';
import htmlPdf from 'html-pdf-node';
import { getWhatsAppService } from '../services/whatsappService.js';
import { getLogoBase64 } from '../utils/logoHelper.js';
import { calcularTablaOficial, calcularTablaUsuario } from '../utils/calcularClasificadosLibertadores.js';

const router = express.Router();

// POST /api/libertadores-calcular/puntos - Calcular y asignar puntos a todos los pronósticos (o de una jornada específica)
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
        p.bonus,
        lj.numero as jornada_numero
      FROM libertadores_pronosticos lp
      INNER JOIN libertadores_partidos p ON lp.partido_id = p.id
      INNER JOIN libertadores_jornadas lj ON lp.jornada_id = lj.id
      WHERE p.goles_local IS NOT NULL 
        AND p.goles_visita IS NOT NULL`;
    
    const params = [];
    if (jornadaNumero) {
      query += ` AND lj.numero = $1`;
      params.push(jornadaNumero);
    }
    
    const pronosticosResult = await pool.query(query, params);

    let pronosticosActualizados = 0;
    let puntosAsignados = 0;
    let puntosClasificacion = 0;

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

      // Multiplicar puntos por el bonus del partido
      const puntosFinales = puntosGanados * bonusMultiplicador;

      // Actualizar puntos en la base de datos
      await pool.query(
        'UPDATE libertadores_pronosticos SET puntos = $1 WHERE id = $2',
        [puntosFinales, id]
      );

      if (puntosFinales > 0) {
        pronosticosActualizados++;
        puntosAsignados += puntosFinales;
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
      }
    }

    // CALCULAR PUNTOS DEL PARTIDO FINAL (id 456) para jornada 10
    let puntosPartidoFinal = 0;
    if (jornadaNumero === 10 || !jornadaNumero) {
      // Verificar si el partido FINAL tiene resultado
      const partidoFinalResult = await pool.query(`
        SELECT id, nombre_local, nombre_visita, goles_local, goles_visita, bonus, jornada_id
        FROM libertadores_partidos
        WHERE id = 456
      `);

      if (partidoFinalResult.rows.length > 0) {
        const partidoFinal = partidoFinalResult.rows[0];
        
        if (partidoFinal.goles_local !== null && partidoFinal.goles_visita !== null) {
          // Obtener todos los pronósticos virtuales del FINAL
          const pronosticosFinalesResult = await pool.query(`
            SELECT 
              lpfv.usuario_id,
              lpfv.equipo_local,
              lpfv.equipo_visita,
              lpfv.goles_local,
              lpfv.goles_visita
            FROM libertadores_pronosticos_final_virtual lpfv
            JOIN libertadores_jornadas lj ON lpfv.jornada_id = lj.id
            WHERE lj.numero = 10
          `);

          for (const pron of pronosticosFinalesResult.rows) {
            // Verificar si los equipos coinciden
            const equiposCoinciden = 
              pron.equipo_local === partidoFinal.nombre_local && 
              pron.equipo_visita === partidoFinal.nombre_visita;

            let puntosFinales = 0;
            
            if (equiposCoinciden) {
              const pronostico_local = pron.goles_local;
              const pronostico_visita = pron.goles_visita;
              const resultado_local = partidoFinal.goles_local;
              const resultado_visita = partidoFinal.goles_visita;
              const bonus = partidoFinal.bonus || 1;

              // Determinar fase para puntos (FINAL es una fase especial)
              const reglaPuntos = reglas.find(r => r.concepto.includes('Resultado exacto'));
              const puntosExacto = reglaPuntos?.puntos || 10;
              const puntosDiferencia = 7;
              const puntosSigno = 4;

              // Calcular puntos según reglas
              if (pronostico_local === resultado_local && pronostico_visita === resultado_visita) {
                puntosFinales = puntosExacto * bonus;
              } else if (Math.abs(pronostico_local - pronostico_visita) === Math.abs(resultado_local - resultado_visita)) {
                const signoPronostico = Math.sign(pronostico_local - pronostico_visita);
                const signoResultado = Math.sign(resultado_local - resultado_visita);
                if (signoPronostico === signoResultado) {
                  puntosFinales = puntosDiferencia * bonus;
                }
              } else {
                const signoPronostico = Math.sign(pronostico_local - pronostico_visita);
                const signoResultado = Math.sign(resultado_local - resultado_visita);
                if (signoPronostico === signoResultado) {
                  puntosFinales = puntosSigno * bonus;
                }
              }

              // Insertar o actualizar en libertadores_pronosticos
              const existePronostico = await pool.query(`
                SELECT id FROM libertadores_pronosticos
                WHERE usuario_id = $1 AND partido_id = 456
              `, [pron.usuario_id]);

              if (existePronostico.rows.length > 0) {
                // Actualizar
                await pool.query(`
                  UPDATE libertadores_pronosticos
                  SET puntos = $1, goles_local = $2, goles_visita = $3
                  WHERE usuario_id = $4 AND partido_id = 456
                `, [puntosFinales, pronostico_local, pronostico_visita, pron.usuario_id]);
              } else {
                // Insertar
                await pool.query(`
                  INSERT INTO libertadores_pronosticos (usuario_id, partido_id, jornada_id, goles_local, goles_visita, puntos)
                  VALUES ($1, 456, $2, $3, $4, $5)
                `, [pron.usuario_id, partidoFinal.jornada_id, pronostico_local, pronostico_visita, puntosFinales]);
              }

              if (puntosFinales > 0) {
                puntosPartidoFinal += puntosFinales;
              }
            }
          }
        }
      }
    }

    // Para jornada 6: calcular y guardar puntos de clasificación
    if (jornadaNumero == 6) {  // Usar == en lugar de === por si viene como string
      
      // Calcular clasificados oficiales (top 2 y 3er lugar de cada grupo)
      const jornadasNumeros = [1, 2, 3, 4, 5, 6];
      const grupos = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      const clasificadosOficiales = {};
      const tercerosOficiales = {};
      
      for (const grupo of grupos) {
        const tabla = await calcularTablaOficial(grupo, jornadasNumeros);
        if (tabla.length >= 2) {
          clasificadosOficiales[grupo] = [tabla[0].nombre, tabla[1].nombre];
        }
        if (tabla.length >= 3) {
          tercerosOficiales[grupo] = tabla[2].nombre;
        }
      }
      
      // Para cada usuario, calcular sus aciertos
      const usuariosRes = await pool.query(`
        SELECT DISTINCT lp.usuario_id
        FROM libertadores_pronosticos lp
        INNER JOIN libertadores_partidos p ON lp.partido_id = p.id
        INNER JOIN libertadores_jornadas j ON p.jornada_id = j.id
        WHERE j.numero = 6
      `);
      
      for (const {usuario_id} of usuariosRes.rows) {
        let totalPuntosUsuario = 0;
        
        // Primero eliminar TODOS los registros existentes de clasificación J6
        await pool.query(
          `DELETE FROM libertadores_puntos_clasificacion 
           WHERE usuario_id = $1 
           AND jornada_numero = 6`,
          [usuario_id]
        );
        
        for (const grupo of grupos) {
          try {
            const tablaUsuario = await calcularTablaUsuario(usuario_id, grupo, jornadasNumeros);
            
            const top2Usuario = tablaUsuario.slice(0, 2).map(e => e.nombre);
            const top2Oficial = clasificadosOficiales[grupo] || [];
            
            // Contar aciertos para octavos (top 2)
            const aciertos = top2Usuario.filter(equipo => top2Oficial.includes(equipo));
            
            // Insertar puntos para cada equipo acertado (octavos)
            for (let i = 0; i < aciertos.length; i++) {
              const equipoAcertado = aciertos[i];
              // Usar un ID ficticio para partido_id basado en grupo y posición
              const partidoIdFicticio = -(1000 + grupo.charCodeAt(0) * 10 + i); // Negativo para no chocar con partidos reales
              
              await pool.query(`
                INSERT INTO libertadores_puntos_clasificacion 
                (usuario_id, partido_id, jornada_numero, equipo_clasificado, fase_clasificado, puntos)
                VALUES ($1, $2, 6, $3, $4, 2)
              `, [usuario_id, partidoIdFicticio, equipoAcertado, `OCTAVOS_GRUPO_${grupo}`]);
              
              totalPuntosUsuario += 2;
            }
            
            // Calcular aciertos para Playoffs Sudamericana (3er lugar)
            if (tablaUsuario.length >= 3) {
              const terceroUsuario = tablaUsuario[2].nombre;
              const terceroOficial = tercerosOficiales[grupo];
              
              if (terceroOficial && terceroUsuario === terceroOficial) {
                const puntosPlayoffs = 2;
                // Usar un ID ficticio para playoffs (2000 + código de grupo)
                const partidoIdFicticioPlayoffs = -(2000 + grupo.charCodeAt(0));
                
                // Insertar puntos para playoffs
                await pool.query(`
                  INSERT INTO libertadores_puntos_clasificacion 
                  (usuario_id, partido_id, jornada_numero, equipo_clasificado, fase_clasificado, puntos)
                  VALUES ($1, $2, 6, $3, $4, $5)
                `, [usuario_id, partidoIdFicticioPlayoffs, terceroOficial, `PLAYOFFS_GRUPO_${grupo}`, puntosPlayoffs]);
                
                totalPuntosUsuario += puntosPlayoffs;
              }
            }
          } catch (error) {
            console.error(`  ❌ Error grupo ${grupo}:`, error.message);
          }
        }
      }
    }

    res.json({
      mensaje: jornadaNumero 
        ? `✅ Puntajes de jornada ${jornadaNumero} calculados correctamente`
        : '✅ Puntajes calculados correctamente',
      total_pronosticos: pronosticosResult.rows.length,
      pronosticos_con_puntos: pronosticosActualizados,
      puntos_totales_asignados: puntosAsignados + puntosPartidoFinal,
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

// ==================== FUNCIÓN PARA GENERAR PDF CON RESULTADOS LIBERTADORES ====================
async function generarPDFLibertadores() {
  try {
    // 1. Obtener pronósticos con resultados reales y puntos
    const pronosticosQuery = await pool.query(
      `SELECT 
        u.nombre AS usuario,
        p.nombre_local,
        p.nombre_visita,
        p.fecha,
        lp.goles_local AS pred_local,
        lp.goles_visita AS pred_visita,
        p.goles_local AS real_local,
        p.goles_visita AS real_visita,
        lp.puntos,
        lj.numero AS jornada_numero,
        lj.nombre AS jornada_nombre
      FROM libertadores_pronosticos lp
      JOIN usuarios u ON lp.usuario_id = u.id
      JOIN libertadores_partidos p ON lp.partido_id = p.id
      JOIN libertadores_jornadas lj ON lp.jornada_id = lj.id
      WHERE p.goles_local IS NOT NULL AND p.goles_visita IS NOT NULL
      ORDER BY u.nombre, lj.numero, p.fecha`,
      []
    );

    // 2. Obtener ranking acumulado
    const rankingQuery = await pool.query(
      `SELECT 
        u.nombre AS usuario,
        COALESCE(SUM(lp.puntos), 0) AS puntaje_total,
        ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(lp.puntos), 0) DESC, u.nombre ASC) AS posicion
      FROM usuarios u
      LEFT JOIN libertadores_pronosticos lp ON lp.usuario_id = u.id
      WHERE u.activo_libertadores = true
      GROUP BY u.id, u.nombre
      ORDER BY puntaje_total DESC
      LIMIT 10`,
      []
    );

    // 3. Obtener la última jornada cerrada
    const ultimaJornadaQuery = await pool.query(
      `SELECT numero, nombre 
       FROM libertadores_jornadas 
       WHERE cerrada = true 
       ORDER BY numero DESC 
       LIMIT 1`
    );

    const ultimaJornada = ultimaJornadaQuery.rows[0];

    // 4. Obtener ranking de la última jornada si existe
    let rankingJornada = [];
    if (ultimaJornada) {
      const rankingJornadaQuery = await pool.query(
        `SELECT 
          u.nombre AS usuario,
          COALESCE(SUM(lp.puntos), 0) AS puntos_jornada,
          ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(lp.puntos), 0) DESC, u.nombre ASC) AS posicion
        FROM usuarios u
        LEFT JOIN libertadores_pronosticos lp ON lp.usuario_id = u.id
        LEFT JOIN libertadores_partidos p ON lp.partido_id = p.id
        LEFT JOIN libertadores_jornadas lj ON lp.jornada_id = lj.id
        WHERE u.activo_libertadores = true 
          AND lj.numero = $1
          AND p.goles_local IS NOT NULL
        GROUP BY u.id, u.nombre
        ORDER BY puntos_jornada DESC
        LIMIT 10`,
        [ultimaJornada.numero]
      );
      rankingJornada = rankingJornadaQuery.rows;
    }

    const pronosticos = pronosticosQuery.rows;
    const ranking = rankingQuery.rows;

    // Agrupar pronósticos por usuario
    const pronosticosPorUsuario = {};
    pronosticos.forEach((p) => {
      if (!pronosticosPorUsuario[p.usuario]) {
        pronosticosPorUsuario[p.usuario] = [];
      }
      pronosticosPorUsuario[p.usuario].push(p);
    });

    // Obtener logos
    const whatsappService = getWhatsAppService();
    const logoItauBase64 = getLogoBase64('itau');
    const logoLibertadoresBase64 = getLogoBase64('libertadores');

    // Generar HTML
    let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Arial', sans-serif; 
          padding: 20px; 
          background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
          color: #333;
        }
        .header {
          text-align: center;
          background: white;
          padding: 20px;
          border-radius: 10px;
          margin-bottom: 30px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .header img {
          height: 60px;
          margin: 0 15px;
          vertical-align: middle;
        }
        .header h1 {
          color: #1e3c72;
          font-size: 28px;
          margin: 15px 0 5px 0;
        }
        .header p {
          color: #666;
          font-size: 16px;
        }
        
        .rankings-section {
          background: white;
          padding: 20px;
          margin-bottom: 25px;
          border-radius: 10px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          page-break-inside: avoid;
        }
        .rankings-section h2 {
          color: #1e3c72;
          font-size: 22px;
          margin-bottom: 15px;
          text-align: center;
        }
        
        .usuario-section {
          background: white;
          padding: 20px;
          margin-bottom: 25px;
          border-radius: 10px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          page-break-inside: avoid;
        }
        .usuario-section h2 {
          color: #1e3c72;
          font-size: 20px;
          margin-bottom: 15px;
          border-bottom: 3px solid #ff6b35;
          padding-bottom: 8px;
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }
        th {
          background: #1e3c72;
          color: white;
          padding: 12px 8px;
          text-align: left;
          font-size: 13px;
          font-weight: bold;
        }
        td {
          padding: 10px 8px;
          border-bottom: 1px solid #e0e0e0;
          font-size: 12px;
        }
        tr:hover {
          background-color: #f5f5f5;
        }
        .partido-cell {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .equipo-logo {
          width: 24px;
          height: 24px;
          object-fit: contain;
        }
        .vs {
          color: #999;
          font-weight: bold;
          margin: 0 4px;
        }
        .resultado {
          font-weight: bold;
          color: #1e3c72;
        }
        .puntos-cell {
          font-weight: bold;
          font-size: 14px;
        }
        .puntos-positivo { color: #27ae60; }
        .puntos-cero { color: #c0392b; }
        
        .ranking-table th {
          background: #27ae60;
        }
        .ranking-table .posicion {
          text-align: center;
          font-weight: bold;
          font-size: 16px;
          color: #1e3c72;
        }
        .ranking-table .top-1 {
          background: #ffd700 !important;
          color: #000 !important;
        }
        .ranking-table .top-2 {
          background: #c0c0c0 !important;
          color: #000 !important;
        }
        .ranking-table .top-3 {
          background: #cd7f32 !important;
          color: #000 !important;
        }

        .footer {
          text-align: center;
          color: white;
          font-size: 12px;
          margin-top: 30px;
          padding: 15px;
          background: rgba(255,255,255,0.1);
          border-radius: 10px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="${logoItauBase64}" alt="Itau">
        <img src="${logoLibertadoresBase64}" alt="Libertadores">
        <h1>📊 RESULTADOS LIBERTADORES</h1>
        <p>Copa Libertadores - Campeonato Itaú</p>
        <p style="font-size: 14px; color: #999; margin-top: 10px;">
          Fecha de generación: ${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })}
        </p>
      </div>
    `;

    // RANKING ACUMULADO
    if (ranking.length > 0) {
      html += `
      <div class="rankings-section">
        <h2>📈 RANKING ACUMULADO LIBERTADORES</h2>
        <table class="ranking-table">
          <thead>
            <tr>
              <th style="width: 15%; text-align: center;">Posición</th>
              <th style="width: 60%;">Jugador</th>
              <th style="width: 25%; text-align: center;">Puntos Totales</th>
            </tr>
          </thead>
          <tbody>
      `;
      ranking.forEach((r) => {
        let rowClass = '';
        if (r.posicion === 1) rowClass = 'top-1';
        else if (r.posicion === 2) rowClass = 'top-2';
        else if (r.posicion === 3) rowClass = 'top-3';
        
        html += `
            <tr class="${rowClass}">
              <td class="posicion">${r.posicion}</td>
              <td>${r.usuario}</td>
              <td style="text-align: center; font-weight: bold;">${r.puntaje_total}</td>
            </tr>
        `;
      });
      html += `
          </tbody>
        </table>
      </div>
      `;
    }

    // RANKING DE LA ÚLTIMA JORNADA
    if (rankingJornada.length > 0 && ultimaJornada) {
      html += `
      <div class="rankings-section">
        <h2>🥇 RANKING JORNADA ${ultimaJornada.numero} - ${ultimaJornada.nombre}</h2>
        <table class="ranking-table">
          <thead>
            <tr>
              <th style="width: 15%; text-align: center;">Posición</th>
              <th style="width: 60%;">Jugador</th>
              <th style="width: 25%; text-align: center;">Puntos</th>
            </tr>
          </thead>
          <tbody>
      `;
      rankingJornada.forEach((r) => {
        let rowClass = '';
        if (r.posicion === 1) rowClass = 'top-1';
        else if (r.posicion === 2) rowClass = 'top-2';
        else if (r.posicion === 3) rowClass = 'top-3';
        
        html += `
            <tr class="${rowClass}">
              <td class="posicion">${r.posicion}</td>
              <td>${r.usuario}</td>
              <td style="text-align: center; font-weight: bold;">${r.puntos_jornada}</td>
            </tr>
        `;
      });
      html += `
          </tbody>
        </table>
      </div>
      `;
    }

    // PRONÓSTICOS POR USUARIO
    for (const [usuario, pronosticosUsuario] of Object.entries(pronosticosPorUsuario)) {
      // Calcular puntaje total del usuario
      const puntajeTotal = pronosticosUsuario.reduce((sum, p) => sum + (p.puntos || 0), 0);
      
      html += `
      <div class="usuario-section">
        <h2>👤 ${usuario} <span style="color: #27ae60; float: right;">Total: ${puntajeTotal} pts</span></h2>
        <table>
          <thead>
            <tr>
              <th style="width: 10%;">Jornada</th>
              <th style="width: 35%;">Partido</th>
              <th style="width: 15%;">Pronóstico</th>
              <th style="width: 15%;">Resultado</th>
              <th style="width: 10%;">Puntos</th>
            </tr>
          </thead>
          <tbody>
      `;

      pronosticosUsuario.forEach((p) => {
        const logoLocal = getLogoBase64(p.nombre_local);
        const logoVisita = getLogoBase64(p.nombre_visita);
        
        const pronostico = `${p.pred_local} - ${p.pred_visita}`;
        const resultado = (p.real_local !== null && p.real_visita !== null) 
          ? `${p.real_local} - ${p.real_visita}` 
          : 'Pendiente';
        
        const puntos = p.puntos || 0;
        const puntosClass = puntos > 0 ? 'puntos-positivo' : 'puntos-cero';

        html += `
            <tr>
              <td style="text-align: center;">${p.jornada_numero}</td>
              <td>
                <div class="partido-cell">
                  <img src="${logoLocal}" class="equipo-logo" alt="${p.nombre_local}">
                  <span>${p.nombre_local}</span>
                  <span class="vs">vs</span>
                  <img src="${logoVisita}" class="equipo-logo" alt="${p.nombre_visita}">
                  <span>${p.nombre_visita}</span>
                </div>
              </td>
              <td style="text-align: center;">${pronostico}</td>
              <td style="text-align: center;" class="resultado">${resultado}</td>
              <td style="text-align: center;" class="puntos-cell ${puntosClass}">
                ${puntos}
              </td>
            </tr>
        `;
      });

      html += `
          </tbody>
        </table>
      </div>
      `;
    }

    html += `
      <div class="footer">
        <p>Campeonato Itaú ${new Date().getFullYear()} • Copa Libertadores</p>
        <p>Sistema de Pronósticos Deportivos</p>
      </div>
    </body>
    </html>
    `;

    // Generar PDF
    const options = {
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
    };
    const file = { content: html };
    const pdfBuffer = await htmlPdf.generatePdf(file, options);

    // Enviar por email
    const nombreArchivo = `Resultados_Libertadores_${new Date().toISOString().split('T')[0]}.pdf`;
    const resultadoEmail = await whatsappService.enviarEmailConPDF(
      pdfBuffer,
      nombreArchivo,
      'Todas',
      'Libertadores'
    );

    if (!resultadoEmail.success) {
      throw new Error(resultadoEmail.mensaje);
    }

    return true;

  } catch (error) {
    console.error('Error al generar PDF de Libertadores:', error);
    throw error;
  }
}

export default router;
