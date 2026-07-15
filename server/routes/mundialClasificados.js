import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { calcularTablaOficial, calcularTablaUsuario } from '../utils/calcularClasificadosMundial.js';

const router = express.Router();

// ==================== ENDPOINTS ====================

// GET - Obtener tabla virtual del usuario actual
router.get('/tabla-usuario/:grupo', verifyToken, async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const { grupo } = req.params;
    
    // Jornadas de fase de grupos (J1-J3)
    const jornadas = [1, 2, 3];
    
    const tabla = await calcularTablaUsuario(usuarioId, grupo, jornadas);
    
    res.json(tabla);
  } catch (error) {
    console.error('Error obteniendo tabla usuario:', error);
    res.status(500).json({ error: 'Error al obtener tabla del usuario' });
  }
});

// GET - Obtener todas las tablas virtuales del usuario (todos los grupos)
router.get('/todas-tablas-usuario', verifyToken, async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    
    // Obtener grupos únicos del Mundial
    const gruposResult = await pool.query(`
      SELECT DISTINCT grupo FROM mundial_partidos 
      WHERE grupo IS NOT NULL 
      ORDER BY grupo
    `);
    const grupos = gruposResult.rows.map(r => r.grupo);
    
    const jornadas = [1, 2, 3];
    
    const tablas = {};
    
    for (const grupo of grupos) {
      tablas[grupo] = await calcularTablaUsuario(usuarioId, grupo, jornadas);
    }
    
    res.json(tablas);
  } catch (error) {
    console.error('Error calculando tablas:', error);
    res.status(500).json({ error: 'Error calculando tablas' });
  }
});

// GET - Obtener clasificados oficiales (calculados desde resultados reales)
router.get('/clasificados-oficiales', verifyToken, async (req, res) => {
  try {
    const jornadasNumeros = [1, 2, 3];
    const clasificados = [];
    
    // Obtener grupos únicos del Mundial
    const gruposResult = await pool.query(`
      SELECT DISTINCT grupo FROM mundial_partidos 
      WHERE grupo IS NOT NULL 
      ORDER BY grupo
    `);
    const grupos = gruposResult.rows.map(r => r.grupo);

    // Calcular tabla oficial de cada grupo
    for (const grupo of grupos) {
      const tabla = await calcularTablaOficial(grupo, jornadasNumeros);
      
      // Top 2 clasifican a 16vos de Final
      if (tabla.length >= 2) {
        clasificados.push({
          grupo,
          posicion: 1,
          equipo_nombre: tabla[0].nombre
        });
        clasificados.push({
          grupo,
          posicion: 2,
          equipo_nombre: tabla[1].nombre
        });
      }
    }

    res.json(clasificados);
  } catch (error) {
    console.error('Error calculando clasificados oficiales:', error);
    res.status(500).json({ error: 'Error calculando clasificados oficiales' });
  }
});

// GET - Obtener puntos de clasificados de un usuario específico
router.get('/puntos-clasificados/:usuarioId', verifyToken, async (req, res) => {
  try {
    const { usuarioId } = req.params;
    const jornadasNumeros = [1, 2, 3];
    
    // Obtener grupos únicos del Mundial
    const gruposResult = await pool.query(`
      SELECT DISTINCT grupo FROM mundial_partidos 
      WHERE grupo IS NOT NULL 
      ORDER BY grupo
    `);
    const grupos = gruposResult.rows.map(r => r.grupo);
    
    let puntosTotal = 0;
    
    // Calcular clasificados oficiales
    const clasificadosOficiales = [];
    for (const grupo of grupos) {
      const tabla = await calcularTablaOficial(grupo, jornadasNumeros);
      if (tabla.length >= 2) {
        clasificadosOficiales.push(tabla[0].nombre);
        clasificadosOficiales.push(tabla[1].nombre);
      }
    }
    
    // Calcular clasificados del usuario para cada grupo
    for (const grupo of grupos) {
      const tablaUsuario = await calcularTablaUsuario(usuarioId, grupo, jornadasNumeros);
      
      if (tablaUsuario.length >= 2) {
        // Top 2 del usuario
        const equiposUsuario = [tablaUsuario[0].nombre, tablaUsuario[1].nombre];
        
        // Contar aciertos (2 puntos por cada uno)
        equiposUsuario.forEach(equipo => {
          if (clasificadosOficiales.includes(equipo)) {
            puntosTotal += 2;
          }
        });
      }
    }
    
    res.json({ puntos: puntosTotal });
  } catch (error) {
    console.error('Error calculando puntos clasificados:', error);
    res.status(500).json({ error: 'Error calculando puntos clasificados' });
  }
});

// GET /todas-tablas-oficiales — tablas de posiciones reales de todos los grupos
router.get('/todas-tablas-oficiales', verifyToken, async (req, res) => {
  try {
    const gruposResult = await pool.query(
      `SELECT DISTINCT grupo FROM mundial_partidos WHERE grupo IS NOT NULL ORDER BY grupo`
    );
    const grupos = gruposResult.rows.map(r => r.grupo);
    const tablas = {};
    for (const grupo of grupos) {
      tablas[grupo] = await calcularTablaOficial(grupo, [1, 2, 3]);
    }
    res.json(tablas);
  } catch (error) {
    console.error('Error calculando tablas oficiales:', error);
    res.status(500).json({ error: 'Error calculando tablas oficiales' });
  }
});

// GET /mejores-terceros-usuario — 8 mejores terceros virtuales del usuario actual (guardados en BD tras calcular J3)
router.get('/mejores-terceros-usuario', verifyToken, async (req, res) => {
  try {
    const usuarioId = req.query.usuario_id || req.usuario.id;
    const result = await pool.query(
      `SELECT equipo, grupo, puntos_grupo, dif_grupo, gf_grupo, posicion_virtual
       FROM mundial_mejores_terceros_usuario
       WHERE usuario_id = $1
       ORDER BY posicion_virtual`,
      [usuarioId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo mejores terceros usuario:', error);
    res.status(500).json({ error: 'Error obteniendo mejores terceros del usuario' });
  }
});

// GET /mejores-terceros — obtiene la lista de mejores terceros (público autenticado)
router.get('/mejores-terceros', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT equipo, grupo FROM mundial_mejores_terceros ORDER BY grupo'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo mejores terceros:', error);
    res.status(500).json({ error: 'Error obteniendo mejores terceros' });
  }
});

// GET /clasificacion-guardada — clasificados guardados del usuario actual (o usuario_id si es admin)
router.get('/clasificacion-guardada', verifyToken, async (req, res) => {
  try {
    const usuarioId = req.query.usuario_id || req.usuario.id;

    const predsResult = await pool.query(
      `SELECT equipo, fase, puntos FROM mundial_puntos_clasificacion
       WHERE usuario_id = $1 AND fase LIKE '16VOS_%' ORDER BY fase`,
      [usuarioId]
    );

    if (predsResult.rows.length === 0) {
      return res.json({ clasificados: [], totalPuntos: 0 });
    }

    const gruposResult = await pool.query(
      `SELECT DISTINCT grupo FROM mundial_partidos WHERE grupo IS NOT NULL ORDER BY grupo`
    );
    const grupos = gruposResult.rows.map(r => r.grupo);
    const clasificadosReales = {};
    for (const grupo of grupos) {
      const tabla = await calcularTablaOficial(grupo, [1, 2, 3]);
      if (tabla.length >= 2) {
        clasificadosReales[`${grupo}_POS1`] = tabla[0].nombre;
        clasificadosReales[`${grupo}_POS2`] = tabla[1].nombre;
      }
      if (tabla.length >= 3) {
        clasificadosReales[`${grupo}_POS3_REAL`] = tabla[2].nombre;
      }
    }
    // Añadir mejores terceros como equipo real para POS3 (admin-defined)
    const tercR = await pool.query('SELECT equipo, grupo FROM mundial_mejores_terceros');
    tercR.rows.forEach(r => { clasificadosReales[`${r.grupo}_POS3`] = r.equipo; });

    const clasificados = predsResult.rows.map(row => {
      // Formato POS1/POS2
      const matchPos = row.fase.match(/16VOS_GRUPO_([A-Z]+)_POS(\d)/);
      if (matchPos) {
        const grupo = matchPos[1];
        const pos = matchPos[2];
        const posLabel = pos === '1' ? 'Clasificado #1 a 16vos'
          : pos === '2' ? 'Clasificado #2 a 16vos'
          : 'Mejor Tercero (grupo)';
        return {
          grupo,
          posicion: parseInt(pos),
          posLabel,
          equipo_pronosticado: row.equipo,
          equipo_real: clasificadosReales[`${grupo}_POS${pos}`] || null,
          puntos: row.puntos
        };
      }
      // Formato MEJOR_TERCERO virtual del usuario
      const matchTercero = row.fase.match(/16VOS_MEJOR_TERCERO_GRUPO_([A-Z]+)/);
      if (matchTercero) {
        const grupo = matchTercero[1];
        return {
          grupo,
          posicion: 3,
          posLabel: 'Mejor Tercero',
          equipo_pronosticado: row.equipo,
          equipo_real: clasificadosReales[`${grupo}_POS3_REAL`] || null,
          puntos: row.puntos
        };
      }
      return null;
    }).filter(Boolean).sort((a, b) => a.grupo.localeCompare(b.grupo) || a.posicion - b.posicion);

    const totalPuntos = clasificados.reduce((sum, c) => sum + c.puntos, 0);
    res.json({ clasificados, totalPuntos });
  } catch (error) {
    console.error('Error obteniendo clasificación guardada:', error);
    res.status(500).json({ error: 'Error obteniendo clasificación guardada' });
  }
});

// GET /clasificacion-guardada-todos — clasificados guardados de todos los usuarios (para admin y vista general)
router.get('/clasificacion-guardada-todos', verifyToken, async (req, res) => {
  try {
    const { usuario_id } = req.query;

    let sql = `
      SELECT mpc.usuario_id, u.nombre as nombre_usuario, u.foto_perfil,
             mpc.equipo, mpc.fase, mpc.puntos
      FROM mundial_puntos_clasificacion mpc
      INNER JOIN usuarios u ON mpc.usuario_id = u.id
      WHERE mpc.fase LIKE '16VOS_%'
    `;
    const params = [];
    if (usuario_id) {
      params.push(usuario_id);
      sql += ` AND mpc.usuario_id = $${params.length}`;
    }
    sql += ` ORDER BY u.nombre, mpc.fase`;

    const result = await pool.query(sql, params);

    // Clasificados reales para comparativa
    const gruposResult2 = await pool.query(
      `SELECT DISTINCT grupo FROM mundial_partidos WHERE grupo IS NOT NULL ORDER BY grupo`
    );
    const grupos2 = gruposResult2.rows.map(r => r.grupo);
    const clasificadosReales2 = {};
    for (const grupo of grupos2) {
      const tabla = await calcularTablaOficial(grupo, [1, 2, 3]);
      if (tabla.length >= 2) {
        clasificadosReales2[`${grupo}_POS1`] = tabla[0].nombre;
        clasificadosReales2[`${grupo}_POS2`] = tabla[1].nombre;
      }
      if (tabla.length >= 3) {
        clasificadosReales2[`${grupo}_POS3_REAL`] = tabla[2].nombre;
      }
    }
    // Añadir mejores terceros como equipo real para POS3
    const tercerosTodosR = await pool.query('SELECT equipo, grupo FROM mundial_mejores_terceros');
    tercerosTodosR.rows.forEach(r => { clasificadosReales2[`${r.grupo}_POS3`] = r.equipo; });

    // Agrupar por usuario
    const porUsuario = {};
    result.rows.forEach(row => {
      if (!porUsuario[row.usuario_id]) {
        porUsuario[row.usuario_id] = {
          usuario_id: row.usuario_id,
          nombre: row.nombre_usuario,
          foto_perfil: row.foto_perfil,
          clasificados: []
        };
      }
      // Formato POS1/POS2
      const matchPos = row.fase.match(/16VOS_GRUPO_([A-Z]+)_POS(\d)/);
      if (matchPos) {
        const grupo = matchPos[1];
        const pos = matchPos[2];
        const posLabel = pos === '1' ? 'Clasificado #1 a 16vos'
          : pos === '2' ? 'Clasificado #2 a 16vos'
          : 'Mejor Tercero (grupo)';
        porUsuario[row.usuario_id].clasificados.push({
          grupo,
          posicion: parseInt(pos),
          posLabel,
          equipo_pronosticado: row.equipo,
          equipo_real: clasificadosReales2[`${grupo}_POS${pos}`] || null,
          puntos: row.puntos
        });
        return;
      }
      // Formato MEJOR_TERCERO virtual
      const matchTercero = row.fase.match(/16VOS_MEJOR_TERCERO_GRUPO_([A-Z]+)/);
      if (matchTercero) {
        const grupo = matchTercero[1];
        porUsuario[row.usuario_id].clasificados.push({
          grupo,
          posicion: 3,
          posLabel: 'Mejor Tercero',
          equipo_pronosticado: row.equipo,
          equipo_real: clasificadosReales2[`${grupo}_POS3_REAL`] || null,
          puntos: row.puntos
        });
      }
    });

    Object.values(porUsuario).forEach(u => {
      u.clasificados.sort((a, b) => a.grupo.localeCompare(b.grupo) || a.posicion - b.posicion);
      u.totalPuntos = u.clasificados.reduce((sum, c) => sum + c.puntos, 0);
    });

    res.json(Object.values(porUsuario));
  } catch (error) {
    console.error('Error obteniendo clasificación guardada todos:', error);
    res.status(500).json({ error: 'Error obteniendo clasificación guardada' });
  }
});

// GET /clasificacion-knockout/:jornadaNumero — clasificados para fases eliminatorias (J4+)
router.get('/clasificacion-knockout/:jornadaNumero', verifyToken, async (req, res) => {
  try {
    const jornada = parseInt(req.params.jornadaNumero);
    const fasePrefijos = { 4: '8VOS', 5: 'CUARTOS', 6: 'SEMIFINALES', 7: 'FINAL' };
    const fasePrefijo = fasePrefijos[jornada];
    if (!fasePrefijo) return res.status(400).json({ error: 'Jornada no soportada' });

    const result = await pool.query(`
      SELECT mpc.usuario_id, u.nombre as nombre_usuario, u.foto_perfil,
             mpc.equipo as equipo_pronosticado, mpc.fase, mpc.puntos
      FROM mundial_puntos_clasificacion mpc
      INNER JOIN usuarios u ON mpc.usuario_id = u.id
      WHERE mpc.fase LIKE $1 AND u.rol != 'admin'
      ORDER BY u.nombre, mpc.fase
    `, [`${fasePrefijo}_%`]);

    // Mapa de partidos: id → { avanzado, local, visitante }
    const matchesResult = await pool.query(`
      SELECT p.id, p.equipo_local, p.equipo_visitante,
             p.resultado_local, p.resultado_visitante, p.quien_avanzo
      FROM mundial_partidos p
      INNER JOIN mundial_jornadas mj ON p.jornada_id = mj.id
      WHERE mj.numero = $1
    `, [jornada]);

    const matchMap = {};
    matchesResult.rows.forEach(m => {
      let avanzado;
      if (m.resultado_local > m.resultado_visitante) avanzado = m.equipo_local;
      else if (m.resultado_visitante > m.resultado_local) avanzado = m.equipo_visitante;
      else avanzado = m.quien_avanzo;
      matchMap[m.id] = { avanzado, local: m.equipo_local, visitante: m.equipo_visitante };
    });

    const porUsuario = {};
    result.rows.forEach(row => {
      if (!porUsuario[row.usuario_id]) {
        porUsuario[row.usuario_id] = {
          usuario_id: row.usuario_id,
          nombre: row.nombre_usuario,
          foto_perfil: row.foto_perfil,
          clasificados: []
        };
      }
      const m = row.fase.match(new RegExp(`${fasePrefijo}_PARTIDO_(\\d+)`));
      if (m) {
        const pid = parseInt(m[1]);
        const match = matchMap[pid];
        porUsuario[row.usuario_id].clasificados.push({
          equipo_pronosticado: row.equipo_pronosticado,
          equipo_real: match ? match.avanzado : null,
          puntos: row.puntos,
          posLabel: match ? `${match.local} vs ${match.visitante}` : `Partido ${pid}`
        });
      }
    });

    Object.values(porUsuario).forEach(u => {
      u.clasificados.sort((a, b) => a.posLabel.localeCompare(b.posLabel));
      u.totalPuntos = u.clasificados.reduce((sum, c) => sum + c.puntos, 0);
    });

    res.json(Object.values(porUsuario));
  } catch (error) {
    console.error('Error obteniendo clasificación knockout:', error);
    res.status(500).json({ error: 'Error obteniendo clasificación knockout' });
  }
});

// GET /clasificacion-final — cuadro final J7 (bracket + campeón/subcampeón/3er)
router.get('/clasificacion-final', verifyToken, async (req, res) => {
  try {
    // Recalcular el bracket virtual desde las semis actuales para evitar datos viejos o mezclados
    const semisQ = await pool.query(`
      SELECT mp.usuario_id, u.nombre as nombre_usuario, u.foto_perfil,
             mp.partido_id, mp.resultado_local, mp.resultado_visitante, mp.quien_avanza,
             p.equipo_local, p.equipo_visitante
      FROM mundial_pronosticos mp
      INNER JOIN usuarios u ON mp.usuario_id = u.id
      INNER JOIN mundial_partidos p ON p.id = mp.partido_id
      INNER JOIN mundial_jornadas mj ON p.jornada_id = mj.id
      WHERE mj.numero = 7 AND p.subtipo = 'semifinal' AND u.rol != 'admin'
      ORDER BY mp.usuario_id, p.id
    `);

    const semisPorUsuario = {};
    semisQ.rows.forEach((row) => {
      if (!semisPorUsuario[row.usuario_id]) {
        semisPorUsuario[row.usuario_id] = {
          usuario_id: row.usuario_id,
          nombre: row.nombre_usuario,
          foto_perfil: row.foto_perfil,
          semis: []
        };
      }
      semisPorUsuario[row.usuario_id].semis.push(row);
    });

    const getGanadorPerdedor = (local, visita, quienAvanza, equipoLocal, equipoVisitante) => {
      const l = Number(local);
      const v = Number(visita);
      let winner;
      let loser;
      if (l > v) {
        winner = equipoLocal;
        loser = equipoVisitante;
      } else if (v > l) {
        winner = equipoVisitante;
        loser = equipoLocal;
      } else {
        winner = quienAvanza || equipoLocal;
        loser = winner === equipoLocal ? equipoVisitante : equipoLocal;
      }
      return { winner, loser };
    };

    const porUsuario = {};
    for (const data of Object.values(semisPorUsuario)) {
      const [semi1, semi2] = data.semis.sort((a, b) => a.partido_id - b.partido_id);
      if (!semi1 || !semi2) continue;

      const r1 = getGanadorPerdedor(
        semi1.resultado_local,
        semi1.resultado_visitante,
        semi1.quien_avanza,
        semi1.equipo_local,
        semi1.equipo_visitante
      );
      const r2 = getGanadorPerdedor(
        semi2.resultado_local,
        semi2.resultado_visitante,
        semi2.quien_avanza,
        semi2.equipo_local,
        semi2.equipo_visitante
      );

      const bracket = {
        1: r1.winner,
        2: r2.winner,
        3: r1.loser,
        4: r2.loser
      };

      for (const [posicion, equipo] of Object.entries(bracket)) {
        await pool.query(
          `INSERT INTO mundial_pronosticos_final_virtual (usuario_id, equipo, posicion, puntos)
           VALUES ($1, $2, $3, 0)
           ON CONFLICT (usuario_id, posicion)
           DO UPDATE SET equipo = EXCLUDED.equipo, actualizado_en = NOW()`,
          [data.usuario_id, equipo, Number(posicion)]
        );
      }

      porUsuario[data.usuario_id] = {
        usuario_id: data.usuario_id,
        nombre: data.nombre,
        foto_perfil: data.foto_perfil,
        bracket,
        pts: { clasificado: 0, campeon: 0, subcampeon: 0, tercero: 0, cuarto: 0 }
      };
    }

    // Partidos reales de Final y 3er Lugar
    const partidos = await pool.query(`
      SELECT p.id, p.equipo_local, p.equipo_visitante, p.resultado_local, p.resultado_visitante, p.quien_avanzo, p.subtipo
      FROM mundial_partidos p INNER JOIN mundial_jornadas mj ON p.jornada_id=mj.id
      WHERE mj.numero=7 AND p.subtipo IN ('final','tercero_lugar')`);
    const finalReal = partidos.rows.find(p => p.subtipo === 'final') || null;
    const terceroReal = partidos.rows.find(p => p.subtipo === 'tercero_lugar') || null;

    const realFinalTeams = finalReal ? new Set([finalReal.equipo_local, finalReal.equipo_visitante]) : new Set();

    // Puntos de clasificación FINAL por usuario
    const ptsQ = await pool.query(`
      SELECT usuario_id, fase, SUM(puntos) puntos FROM mundial_puntos_clasificacion
      WHERE fase LIKE 'FINAL_%' GROUP BY usuario_id, fase`);
    const ptsMap = {};
    ptsQ.rows.forEach(r => {
      if (!ptsMap[r.usuario_id]) ptsMap[r.usuario_id] = { clasificado: 0, campeon: 0, subcampeon: 0, tercero: 0, cuarto: 0 };
      if (r.fase === 'FINAL_CLASIFICADO') ptsMap[r.usuario_id].clasificado += parseInt(r.puntos);
      if (r.fase === 'FINAL_CAMPEON') ptsMap[r.usuario_id].campeon += parseInt(r.puntos);
      if (r.fase === 'FINAL_SUBCAMPEON') ptsMap[r.usuario_id].subcampeon += parseInt(r.puntos);
      if (r.fase === 'FINAL_TERCERO') ptsMap[r.usuario_id].tercero += parseInt(r.puntos);
      if (r.fase === 'FINAL_CUARTO') ptsMap[r.usuario_id].cuarto += parseInt(r.puntos);
    });

    Object.values(porUsuario).forEach(u => {
      const b = u.bracket;
      u.equipo_final_1 = b[1] || null;
      u.equipo_final_2 = b[2] || null;
      u.equipo_tercero_1 = b[3] || null;
      u.equipo_tercero_2 = b[4] || null;
      u.pts = ptsMap[u.usuario_id] || { clasificado: 0, campeon: 0, subcampeon: 0, tercero: 0, cuarto: 0 };
      u.totalPuntos = u.pts.clasificado + u.pts.campeon + u.pts.subcampeon + u.pts.tercero + u.pts.cuarto;
      // Marcar si bracket coincide con real
      u.finalCoincide = finalReal && realFinalTeams.has(b[1]) && realFinalTeams.has(b[2]);
      u.terceroCoincide = terceroReal && new Set([terceroReal.equipo_local, terceroReal.equipo_visitante]).has(b[3]) && new Set([terceroReal.equipo_local, terceroReal.equipo_visitante]).has(b[4]);
    });

    res.json({
      usuarios: Object.values(porUsuario),
      finalReal: finalReal ? { equipo_local: finalReal.equipo_local, equipo_visitante: finalReal.equipo_visitante, resultado_local: finalReal.resultado_local, resultado_visitante: finalReal.resultado_visitante } : null,
      terceroReal: terceroReal ? { equipo_local: terceroReal.equipo_local, equipo_visitante: terceroReal.equipo_visitante, resultado_local: terceroReal.resultado_local, resultado_visitante: terceroReal.resultado_visitante } : null,
    });
  } catch (error) {
    console.error('Error obteniendo clasificación final:', error);
    res.status(500).json({ error: 'Error obteniendo clasificación final' });
  }
});

export default router;

