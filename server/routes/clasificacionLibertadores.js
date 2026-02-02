import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';

const router = express.Router();

// GET /api/libertadores-clasificacion/pronosticos - Obtener pronósticos con filtros
router.get('/pronosticos', verifyToken, async (req, res) => {
  try {
    const { usuario_id, partido_id, jornada_numero } = req.query;

    let query = `
      SELECT 
        lp.id,
        lp.usuario_id,
        u.nombre as usuario_nombre,
        u.foto_perfil as usuario_foto_perfil,
        lp.jornada_id,
        lj.numero as jornada_numero,
        lj.nombre as jornada_nombre,
        lj.cerrada as jornada_cerrada,
        lp.partido_id,
        p.nombre_local,
        p.nombre_visita,
        el.pais as pais_local,
        ev.pais as pais_visita,
        el.grupo as grupo_local,
        ev.grupo as grupo_visita,
        p.fecha as partido_fecha,
        CASE 
          WHEN lj.numero >= 7 AND lj.numero <= 10 THEN 
            CASE 
              WHEN lj.numero = 7 THEN 'IDA'
              WHEN lj.numero = 8 THEN 'VUELTA'
              WHEN lj.numero = 9 THEN 
                CASE 
                  -- Para J9: IDA si este partido se jugó antes que su partido de vuelta (equipos invertidos)
                  WHEN EXISTS (
                    SELECT 1 FROM libertadores_partidos p2
                    WHERE p2.jornada_id = p.jornada_id
                    AND p2.nombre_local = p.nombre_visita
                    AND p2.nombre_visita = p.nombre_local
                    AND p2.id > p.id
                  ) THEN 'IDA'
                  ELSE 'VUELTA'
                END
              WHEN lj.numero = 10 THEN 
                CASE 
                  -- Para J10: Similar pero distinguiendo FINAL
                  WHEN NOT EXISTS (
                    SELECT 1 FROM libertadores_partidos p2
                    WHERE p2.jornada_id = p.jornada_id
                    AND p2.nombre_local = p.nombre_visita
                    AND p2.nombre_visita = p.nombre_local
                  ) THEN 'FINAL'
                  WHEN EXISTS (
                    SELECT 1 FROM libertadores_partidos p2
                    WHERE p2.jornada_id = p.jornada_id
                    AND p2.nombre_local = p.nombre_visita
                    AND p2.nombre_visita = p.nombre_local
                    AND p2.id > p.id
                  ) THEN 'IDA'
                  ELSE 'VUELTA'
                END
            END
          ELSE el.grupo
        END as tipo_partido,
        lp.goles_local as pronostico_local,
        lp.goles_visita as pronostico_visita,
        lp.penales_local as penales_pronostico_local,
        lp.penales_visita as penales_pronostico_visita,
        p.goles_local as resultado_local,
        p.goles_visita as resultado_visita,
        p.penales_local as penales_real_local,
        p.penales_visita as penales_real_visita,
        p.bonus,
        lp.puntos,
        lp.created_at as fecha_pronostico,
        lpc.equipo_clasificado as equipo_pronosticado_avanza,
        lpc.puntos as puntos_clasificacion,
        lpcc.puntos_campeon,
        lpcc.puntos_subcampeon,
        lpfv.equipo_local as final_virtual_local,
        lpfv.equipo_visita as final_virtual_visita,
        lpfv.goles_local as final_virtual_goles_local,
        lpfv.goles_visita as final_virtual_goles_visita,
        lpfv.penales_local as final_virtual_penales_local,
        lpfv.penales_visita as final_virtual_penales_visita
      FROM libertadores_pronosticos lp
      INNER JOIN usuarios u ON lp.usuario_id = u.id
      INNER JOIN libertadores_jornadas lj ON lp.jornada_id = lj.id
      INNER JOIN libertadores_partidos p ON lp.partido_id = p.id
      LEFT JOIN libertadores_equipos el ON p.nombre_local = el.nombre
      LEFT JOIN libertadores_equipos ev ON p.nombre_visita = ev.nombre
      LEFT JOIN libertadores_puntos_clasificacion lpc ON lp.usuario_id = lpc.usuario_id 
        AND lp.partido_id = lpc.partido_id 
        AND lj.numero = lpc.jornada_numero
      LEFT JOIN libertadores_predicciones_campeon lpcc ON lp.usuario_id = lpcc.usuario_id
      LEFT JOIN libertadores_pronosticos_final_virtual lpfv ON lp.usuario_id = lpfv.usuario_id 
        AND lj.id = lpfv.jornada_id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    // Filtro por usuario_id
    if (usuario_id && !isNaN(usuario_id)) {
      query += ` AND lp.usuario_id = $${paramIndex}`;
      params.push(parseInt(usuario_id));
      paramIndex++;
    }

    // Filtro por partido
    if (partido_id && !isNaN(partido_id)) {
      query += ` AND lp.partido_id = $${paramIndex}`;
      params.push(parseInt(partido_id));
      paramIndex++;
    }

    // Filtro por jornada
    if (jornada_numero && !isNaN(jornada_numero)) {
      query += ` AND lj.numero = $${paramIndex}`;
      params.push(parseInt(jornada_numero));
      paramIndex++;
    }

    // Ordenamiento especial para J10: semifinales primero, final al último
    query += ` 
      ORDER BY 
        lj.numero DESC,
        CASE 
          WHEN lj.numero = 10 THEN 
            -- En J10: partidos sin complementario (FINAL) al final, el resto al inicio
            CASE 
              WHEN NOT EXISTS (
                SELECT 1 FROM libertadores_partidos p2
                WHERE p2.jornada_id = p.jornada_id
                AND p2.nombre_local = p.nombre_visita
                AND p2.nombre_visita = p.nombre_local
              ) THEN 2  -- FINAL al final
              ELSE 1    -- Semifinales primero
            END
          ELSE 1
        END,
        p.id ASC,
        u.nombre ASC
    `;

    const result = await pool.query(query, params);
    
    // LÓGICA ESPECIAL PARA J10: Agregar partido FINAL para usuarios que no lo tienen en libertadores_pronosticos
    let rowsFinales = result.rows;
    
    if (jornada_numero && parseInt(jornada_numero) === 10) {
      // Obtener el partido FINAL (id 456)
      const partidoFinalResult = await pool.query(`
        SELECT p.*, lj.id as jornada_id, lj.numero as jornada_numero, lj.nombre as jornada_nombre, lj.cerrada as jornada_cerrada
        FROM libertadores_partidos p
        INNER JOIN libertadores_jornadas lj ON p.jornada_id = lj.id
        WHERE p.id = 456 AND lj.numero = 10
      `);
      
      if (partidoFinalResult.rows.length > 0) {
        const partidoFinal = partidoFinalResult.rows[0];
        
        // Obtener usuarios que tienen datos en final_virtual pero NO tienen pronóstico del partido 456
        const usuariosConFinalVirtual = await pool.query(`
          SELECT DISTINCT 
            lpfv.usuario_id,
            u.nombre as usuario_nombre,
            u.foto_perfil as usuario_foto_perfil,
            lpfv.jornada_id,
            lpfv.equipo_local as final_virtual_local,
            lpfv.equipo_visita as final_virtual_visita,
            lpfv.goles_local as final_virtual_goles_local,
            lpfv.goles_visita as final_virtual_goles_visita,
            lpfv.penales_local as final_virtual_penales_local,
            lpfv.penales_visita as final_virtual_penales_visita
          FROM libertadores_pronosticos_final_virtual lpfv
          INNER JOIN usuarios u ON lpfv.usuario_id = u.id
          WHERE lpfv.jornada_id = $1
            AND NOT EXISTS (
              SELECT 1 FROM libertadores_pronosticos lp
              WHERE lp.usuario_id = lpfv.usuario_id
                AND lp.partido_id = 456
            )
            ${usuario_id && !isNaN(usuario_id) ? 'AND lpfv.usuario_id = $2' : ''}
        `, usuario_id && !isNaN(usuario_id) ? [partidoFinal.jornada_id, parseInt(usuario_id)] : [partidoFinal.jornada_id]);
        
        // Agregar filas sintéticas para estos usuarios
        for (const usr of usuariosConFinalVirtual.rows) {
          // Obtener puntos de campeón/subcampeón
          const puntosCampeonResult = await pool.query(`
            SELECT puntos_campeon, puntos_subcampeon
            FROM libertadores_predicciones_campeon
            WHERE usuario_id = $1
          `, [usr.usuario_id]);
          
          rowsFinales.push({
            id: null, // No hay pronóstico real del partido 456
            usuario_id: usr.usuario_id,
            usuario_nombre: usr.usuario_nombre,
            usuario_foto_perfil: usr.usuario_foto_perfil,
            jornada_id: usr.jornada_id,
            jornada_numero: partidoFinal.jornada_numero,
            jornada_nombre: partidoFinal.jornada_nombre,
            jornada_cerrada: partidoFinal.jornada_cerrada,
            partido_id: partidoFinal.id,
            nombre_local: partidoFinal.nombre_local,
            nombre_visita: partidoFinal.nombre_visita,
            pais_local: null,
            pais_visita: null,
            grupo_local: null,
            grupo_visita: null,
            partido_fecha: partidoFinal.fecha,
            tipo_partido: 'FINAL',
            pronostico_local: null,
            pronostico_visita: null,
            penales_pronostico_local: null,
            penales_pronostico_visita: null,
            resultado_local: partidoFinal.goles_local,
            resultado_visita: partidoFinal.goles_visita,
            penales_real_local: partidoFinal.penales_local,
            penales_real_visita: partidoFinal.penales_visita,
            bonus: partidoFinal.bonus,
            puntos: null,
            created_at: null,
            equipo_pronosticado_avanza: null,
            puntos_clasificacion: null,
            puntos_campeon: puntosCampeonResult.rows[0]?.puntos_campeon || 0,
            puntos_subcampeon: puntosCampeonResult.rows[0]?.puntos_subcampeon || 0,
            final_virtual_local: usr.final_virtual_local,
            final_virtual_visita: usr.final_virtual_visita,
            final_virtual_goles_local: usr.final_virtual_goles_local,
            final_virtual_goles_visita: usr.final_virtual_goles_visita,
            final_virtual_penales_local: usr.final_virtual_penales_local,
            final_virtual_penales_visita: usr.final_virtual_penales_visita
          });
        }
      }
    }

    // Formatear datos
    const pronosticos = await Promise.all(rowsFinales.map(async row => {
      // Calcular equipo que el usuario pronosticó que avanza (para jornadas 8+)
      let equipoPronosticadoAvanza = null;
      let partidoIda = null;
      let equipoRealQueAvanza = null;
      let equiposPronosticadosFinal = null;  // Para jornada 10 - Campeón y Subcampeón
      
      // Si es jornada 10, SIEMPRE obtener predicciones de campeón y subcampeón
      if (row.jornada_numero === 10) {
        const prediccionResult = await pool.query(`
          SELECT campeon, subcampeon
          FROM libertadores_predicciones_campeon
          WHERE usuario_id = $1
        `, [row.usuario_id]);
        
        if (prediccionResult.rows.length > 0) {
          equiposPronosticadosFinal = {
            campeon: prediccionResult.rows[0].campeon,
            subcampeon: prediccionResult.rows[0].subcampeon
          };
        }
      }
      
      // Si es jornada 10 y es el partido FINAL, obtener datos del pronóstico virtual
      if (row.jornada_numero === 10 && row.tipo_partido === 'FINAL') {
        const pronosticoVirtualResult = await pool.query(`
          SELECT equipo_local, equipo_visita, goles_local, goles_visita, penales_local, penales_visita
          FROM libertadores_pronosticos_final_virtual
          WHERE usuario_id = $1 AND jornada_id = $2
        `, [row.usuario_id, row.jornada_id]);
        
        if (pronosticoVirtualResult.rows.length > 0) {
          const pv = pronosticoVirtualResult.rows[0];
          
          // También obtener campeón y subcampeón de predicciones
          const prediccionResult = await pool.query(`
            SELECT campeon, subcampeon
            FROM libertadores_predicciones_campeon
            WHERE usuario_id = $1
          `, [row.usuario_id]);
          
          equiposPronosticadosFinal = {
            equipo_local: pv.equipo_local,
            equipo_visita: pv.equipo_visita,
            goles_local: pv.goles_local,
            goles_visita: pv.goles_visita,
            penales_local: pv.penales_local,
            penales_visita: pv.penales_visita,
            campeon: prediccionResult.rows.length > 0 ? prediccionResult.rows[0].campeon : null,
            subcampeon: prediccionResult.rows.length > 0 ? prediccionResult.rows[0].subcampeon : null
          };
        }
      }
      
      if (row.jornada_numero >= 8) {
        // Para jornada 8: Buscar partido IDA en jornada 7
        // Para jornadas 9-10: Buscar partido IDA en la misma jornada (con equipos invertidos)
        let pronosticoGlobalLocal = row.pronostico_local;
        let pronosticoGlobalVisita = row.pronostico_visita;
        let resultadoGlobalLocal = row.resultado_local;
        let resultadoGlobalVisita = row.resultado_visita;
        
        if (row.jornada_numero === 8) {
          // Buscar partido IDA en jornada 7 con equipos invertidos
          const partidoIdaResult = await pool.query(`
            SELECT 
              lp.goles_local as pronostico_ida_local, 
              lp.goles_visita as pronostico_ida_visita,
              p.goles_local as resultado_ida_local,
              p.goles_visita as resultado_ida_visita,
              p.penales_local as penales_real_ida_local,
              p.penales_visita as penales_real_ida_visita,
              p.nombre_local,
              p.nombre_visita
            FROM libertadores_pronosticos lp
            INNER JOIN libertadores_partidos p ON lp.partido_id = p.id
            INNER JOIN libertadores_jornadas lj ON lp.jornada_id = lj.id
            WHERE lj.numero = 7
              AND p.nombre_local = $1
              AND p.nombre_visita = $2
              AND lp.usuario_id = $3
          `, [row.nombre_visita, row.nombre_local, row.usuario_id]);
          
          if (partidoIdaResult.rows.length > 0) {
            partidoIda = partidoIdaResult.rows[0];
            // CORRECCIÓN: Seguir a los equipos por NOMBRE, no por posición
            // En VUELTA: row.nombre_local vs row.nombre_visita
            // En IDA: partidoIda tiene los equipos invertidos
            // partidoIda.nombre_local = row.nombre_visita (el visitante de VUELTA era local en IDA)
            // partidoIda.nombre_visita = row.nombre_local (el local de VUELTA era visita en IDA)
            
            // Goles totales del equipo LOCAL de VUELTA (row.nombre_local):
            // - En VUELTA: row.pronostico_local
            // - En IDA: era VISITA, entonces partidoIda.pronostico_ida_visita
            pronosticoGlobalLocal = row.pronostico_local + (partidoIda.pronostico_ida_visita || 0);
            
            // Goles totales del equipo VISITA de VUELTA (row.nombre_visita):
            // - En VUELTA: row.pronostico_visita
            // - En IDA: era LOCAL, entonces partidoIda.pronostico_ida_local
            pronosticoGlobalVisita = row.pronostico_visita + (partidoIda.pronostico_ida_local || 0);
            
            if (partidoIda.resultado_ida_local !== null && partidoIda.resultado_ida_visita !== null) {
              resultadoGlobalLocal = row.resultado_local + (partidoIda.resultado_ida_visita || 0);
              resultadoGlobalVisita = row.resultado_visita + (partidoIda.resultado_ida_local || 0);
            }
          }
        } else if (row.jornada_numero === 9 || row.jornada_numero === 10) {
          // Para J9 y J10: Buscar partido IDA en la misma jornada con equipos invertidos
          const partidoIdaResult = await pool.query(`
            SELECT 
              lp.goles_local as pronostico_ida_local, 
              lp.goles_visita as pronostico_ida_visita,
              p.goles_local as resultado_ida_local,
              p.goles_visita as resultado_ida_visita,
              p.penales_local as penales_real_ida_local,
              p.penales_visita as penales_real_ida_visita,
              p.nombre_local,
              p.nombre_visita
            FROM libertadores_pronosticos lp
            INNER JOIN libertadores_partidos p ON lp.partido_id = p.id
            INNER JOIN libertadores_jornadas lj ON lp.jornada_id = lj.id
            WHERE lj.numero = $1
              AND p.nombre_local = $2
              AND p.nombre_visita = $3
              AND lp.usuario_id = $4
          `, [row.jornada_numero, row.nombre_visita, row.nombre_local, row.usuario_id]);
          
          if (partidoIdaResult.rows.length > 0) {
            partidoIda = partidoIdaResult.rows[0];
            
            // Goles totales del equipo LOCAL de VUELTA (row.nombre_local):
            // - En VUELTA: row.pronostico_local
            // - En IDA: era VISITA, entonces partidoIda.pronostico_ida_visita
            pronosticoGlobalLocal = row.pronostico_local + (partidoIda.pronostico_ida_visita || 0);
            
            // Goles totales del equipo VISITA de VUELTA (row.nombre_visita):
            // - En VUELTA: row.pronostico_visita
            // - En IDA: era LOCAL, entonces partidoIda.pronostico_ida_local
            pronosticoGlobalVisita = row.pronostico_visita + (partidoIda.pronostico_ida_local || 0);
            
            if (partidoIda.resultado_ida_local !== null && partidoIda.resultado_ida_visita !== null) {
              resultadoGlobalLocal = row.resultado_local + (partidoIda.resultado_ida_visita || 0);
              resultadoGlobalVisita = row.resultado_visita + (partidoIda.resultado_ida_local || 0);
            }
          }
        }
        
        const penalesLocal = row.penales_pronostico_local;
        const penalesVisita = row.penales_pronostico_visita;
        
        // Determinar ganador según pronóstico GLOBAL
        if (pronosticoGlobalLocal > pronosticoGlobalVisita) {
          equipoPronosticadoAvanza = row.nombre_local;
        } else if (pronosticoGlobalLocal < pronosticoGlobalVisita) {
          equipoPronosticadoAvanza = row.nombre_visita;
        } else {
          // Si hay empate global, revisar penales
          if (penalesLocal !== null && penalesVisita !== null) {
            if (penalesLocal > penalesVisita) {
              equipoPronosticadoAvanza = row.nombre_local;
            } else if (penalesLocal < penalesVisita) {
              equipoPronosticadoAvanza = row.nombre_visita;
            }
          }
        }
        
        // Calcular equipo REAL que avanzó
        if (row.resultado_local !== null && row.resultado_visita !== null) {
          if (resultadoGlobalLocal > resultadoGlobalVisita) {
            equipoRealQueAvanza = row.nombre_local;
          } else if (resultadoGlobalLocal < resultadoGlobalVisita) {
            equipoRealQueAvanza = row.nombre_visita;
          } else {
            // Empate global, revisar penales reales
            if (row.penales_real_local !== null && row.penales_real_visita !== null) {
              if (row.penales_real_local > row.penales_real_visita) {
                equipoRealQueAvanza = row.nombre_local;
              } else if (row.penales_real_local < row.penales_real_visita) {
                equipoRealQueAvanza = row.nombre_visita;
              }
            }
          }
        }
      }
      
      return {
        id: row.id,
        usuario: {
          id: row.usuario_id,
          nombre: row.usuario_nombre,
          foto_perfil: row.usuario_foto_perfil
        },
        jornada: {
          id: row.jornada_id,
          numero: row.jornada_numero,
          nombre: row.jornada_nombre,
          cerrada: row.jornada_cerrada
        },
        partido: {
          id: row.partido_id,
          fecha: row.partido_fecha,
          grupo: row.grupo_local,
          tipo_partido: row.tipo_partido,
          bonus: row.bonus,
          local: {
            nombre: row.nombre_local,
            pais: row.pais_local
          },
          visita: {
            nombre: row.nombre_visita,
            pais: row.pais_visita
          },
          resultado: {
            local: row.resultado_local,
            visita: row.resultado_visita,
            penales_local: row.penales_real_local,
            penales_visita: row.penales_real_visita
          }
        },
        pronostico: {
          local: row.pronostico_local,
          visita: row.pronostico_visita,
          penales_local: row.penales_pronostico_local,
          penales_visita: row.penales_pronostico_visita
        },
        puntos: row.puntos,
        equipo_pronosticado_avanza: equipoPronosticadoAvanza,
        puntos_clasificacion: row.puntos_clasificacion || 0,
        puntos_campeon: row.puntos_campeon || 0,
        puntos_subcampeon: row.puntos_subcampeon || 0,
        fecha_pronostico: row.fecha_pronostico,
        partido_ida: partidoIda,
        equipo_real_avanza: equipoRealQueAvanza,
        equipos_pronosticados_final: equiposPronosticadosFinal,  // Nuevo campo para FINAL
        // Campos de la predicción FINAL virtual
        final_virtual_local: row.final_virtual_local,
        final_virtual_visita: row.final_virtual_visita,
        final_virtual_goles_local: row.final_virtual_goles_local,
        final_virtual_goles_visita: row.final_virtual_goles_visita,
        final_virtual_penales_local: row.final_virtual_penales_local,
        final_virtual_penales_visita: row.final_virtual_penales_visita
      };
    }));

    res.json(pronosticos);
  } catch (error) {
    console.error('Error obteniendo pronósticos:', error);
    res.status(500).json({ error: 'Error obteniendo pronósticos' });
  }
});

// GET /api/libertadores-clasificacion/partidos - Obtener lista de partidos para el filtro
router.get('/partidos', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.id,
        p.fecha,
        p.nombre_local,
        p.nombre_visita,
        p.goles_local,
        p.goles_visita,
        p.penales_local,
        p.penales_visita,
        p.tipo_partido,
        p.bonus,
        el.pais as pais_local,
        ev.pais as pais_visita,
        el.grupo as grupo,
        lj.numero as jornada_numero
      FROM libertadores_partidos p
      LEFT JOIN libertadores_equipos el ON p.nombre_local = el.nombre
      LEFT JOIN libertadores_equipos ev ON p.nombre_visita = ev.nombre
      LEFT JOIN libertadores_jornadas lj ON p.jornada_id = lj.id
      ORDER BY lj.numero DESC, p.fecha DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo partidos:', error);
    res.status(500).json({ error: 'Error obteniendo partidos' });
  }
});

// GET /api/libertadores-clasificacion/jornadas - Obtener lista de jornadas para el filtro
router.get('/jornadas', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, numero, nombre, cerrada
      FROM libertadores_jornadas
      ORDER BY numero
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo jornadas:', error);
    res.status(500).json({ error: 'Error obteniendo jornadas' });
  }
});

// GET /api/libertadores-clasificacion/jugadores - Obtener lista de jugadores con pronósticos
router.get('/jugadores', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT u.id, u.nombre
      FROM libertadores_pronosticos lp
      INNER JOIN usuarios u ON lp.usuario_id = u.id
      ORDER BY u.nombre ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo jugadores:', error);
    res.status(500).json({ error: 'Error obteniendo jugadores' });
  }
});

// GET /api/libertadores-clasificacion/puntos-clasificados-j6 - Obtener puntos de clasificados J6 por usuario
router.get('/puntos-clasificados-j6', verifyToken, async (req, res) => {
  try {
    const { usuario_id } = req.query;
    
    let query = `
      SELECT 
        usuario_id,
        SUM(puntos) as puntos_total_j6
      FROM libertadores_puntos_clasificacion
      WHERE jornada_numero = 6
    `;
    
    const params = [];
    if (usuario_id) {
      query += ` AND usuario_id = $1`;
      params.push(parseInt(usuario_id));
    }
    
    query += ` GROUP BY usuario_id`;
    
    const result = await pool.query(query, params);
    
    // Convertir a objeto {usuario_id: puntos}
    const puntosMap = {};
    result.rows.forEach(row => {
      puntosMap[row.usuario_id] = parseInt(row.puntos_total_j6) || 0;
    });
    
    res.json(puntosMap);
  } catch (error) {
    console.error('Error obteniendo puntos clasificados J6:', error);
    res.status(500).json({ error: 'Error obteniendo puntos clasificados J6' });
  }
});

// GET /api/libertadores-clasificacion/puntos-clasificacion - Obtener puntos de clasificación
router.get('/puntos-clasificacion', verifyToken, async (req, res) => {
  try {
    const { jornada_numero, usuario_id } = req.query;

    let query = `
      SELECT 
        pc.id,
        pc.usuario_id,
        u.nombre as usuario_nombre,
        pc.jornada_numero,
        pc.equipo_clasificado,
        pc.equipo_oficial,
        pc.fase_clasificado,
        pc.puntos
      FROM libertadores_puntos_clasificacion pc
      INNER JOIN usuarios u ON pc.usuario_id = u.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (jornada_numero && !isNaN(jornada_numero)) {
      query += ` AND pc.jornada_numero = $${paramIndex}`;
      params.push(parseInt(jornada_numero));
      paramIndex++;
    }

    if (usuario_id && !isNaN(usuario_id)) {
      query += ` AND pc.usuario_id = $${paramIndex}`;
      params.push(parseInt(usuario_id));
      paramIndex++;
    }

    query += ` ORDER BY pc.usuario_id, 
      CASE pc.fase_clasificado
        WHEN 'FINALISTA' THEN 1
        WHEN 'CAMPEON' THEN 2
        WHEN 'SUBCAMPEON' THEN 3
        ELSE 4
      END, pc.id`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo puntos clasificación:', error);
    res.status(500).json({ error: 'Error al obtener puntos de clasificación' });
  }
});

export default router;
