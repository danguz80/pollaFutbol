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
        lp.puntos,
        lp.created_at as fecha_pronostico,
        lpc.equipo_clasificado as equipo_pronosticado_avanza,
        lpc.puntos as puntos_clasificacion
      FROM libertadores_pronosticos lp
      INNER JOIN usuarios u ON lp.usuario_id = u.id
      INNER JOIN libertadores_jornadas lj ON lp.jornada_id = lj.id
      INNER JOIN libertadores_partidos p ON lp.partido_id = p.id
      LEFT JOIN libertadores_equipos el ON p.nombre_local = el.nombre
      LEFT JOIN libertadores_equipos ev ON p.nombre_visita = ev.nombre
      LEFT JOIN libertadores_puntos_clasificacion lpc ON lp.usuario_id = lpc.usuario_id 
        AND lp.partido_id = lpc.partido_id 
        AND lj.numero = lpc.jornada_numero
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

    query += ` ORDER BY lj.numero DESC, p.fecha DESC, u.nombre ASC`;

    const result = await pool.query(query, params);

    // Formatear datos
    const pronosticos = await Promise.all(result.rows.map(async row => {
      // Calcular equipo que el usuario pronosticó que avanza (para jornadas 8+)
      let equipoPronosticadoAvanza = null;
      let partidoIda = null;
      let equipoRealQueAvanza = null;
      
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
        fecha_pronostico: row.fecha_pronostico,
        partido_ida: partidoIda,
        equipo_real_avanza: equipoRealQueAvanza
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

export default router;
