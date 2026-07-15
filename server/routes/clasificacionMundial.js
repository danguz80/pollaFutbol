import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';

const router = express.Router();

// GET /api/mundial-clasificacion/pronosticos - Obtener pronósticos con filtros
router.get('/pronosticos', verifyToken, async (req, res) => {
  try {
    const { usuario_id, partido_id, jornada_numero } = req.query;

    let query = `
      SELECT 
        mp.id,
        mp.usuario_id,
        u.nombre as usuario_nombre,
        u.foto_perfil as usuario_foto_perfil,
        mp.jornada_id,
        mj.numero as jornada_numero,
        mj.nombre as jornada_nombre,
        mj.cerrada as jornada_cerrada,
        mp.partido_id,
        p.equipo_local,
        p.equipo_visitante,
        p.grupo,
        p.subtipo,
        mp.quien_avanza,
        p.fecha as partido_fecha,
        mp.resultado_local as pronostico_local,
        mp.resultado_visitante as pronostico_visita,
        p.resultado_local,
        p.resultado_visitante,
        p.bonus,
        mp.puntos,
        mp.creado_en as fecha_pronostico
      FROM mundial_pronosticos mp
      INNER JOIN usuarios u ON mp.usuario_id = u.id
      INNER JOIN mundial_jornadas mj ON mp.jornada_id = mj.id
      INNER JOIN mundial_partidos p ON mp.partido_id = p.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (usuario_id) {
      query += ` AND mp.usuario_id = $${paramIndex}`;
      params.push(usuario_id);
      paramIndex++;
    }

    if (partido_id) {
      query += ` AND mp.partido_id = $${paramIndex}`;
      params.push(partido_id);
      paramIndex++;
    }

    if (jornada_numero) {
      query += ` AND mj.numero = $${paramIndex}`;
      params.push(jornada_numero);
      paramIndex++;
    }

    query += ` ORDER BY mj.numero, u.nombre, p.fecha`;

    const result = await pool.query(query, params);

    // Transformar datos al formato esperado por el frontend
    const pronosticos = result.rows.map(row => ({
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
        local: { nombre: row.equipo_local },
        visita: { nombre: row.equipo_visitante },
        grupo: row.grupo,
        subtipo: row.subtipo || null,
        fecha: row.partido_fecha,
        resultado: {
          local: row.resultado_local,
          visita: row.resultado_visitante
        },
        bonus: row.bonus
      },
      pronostico: {
        local: row.pronostico_local,
        visita: row.pronostico_visita,
        quien_avanza: row.quien_avanza || null
      },
      puntos: row.puntos,
      fecha_pronostico: row.fecha_pronostico
    }));

    // Si se consulta J7: agregar las predicciones virtuales de Final y 3er Lugar
    if (jornada_numero === '7' || jornada_numero === 7) {
      const j7 = await pool.query(`SELECT id, numero, nombre, cerrada FROM mundial_jornadas WHERE numero=7`);
      const j7Row = j7.rows[0];

      // Predicciones virtuales de score
      const scoresQ = await pool.query(`
        SELECT pvf.usuario_id, pvf.tipo, pvf.resultado_local, pvf.resultado_visitante, pvf.quien_avanza
        FROM mundial_pronosticos_virtual_final pvf
        ${usuario_id ? 'WHERE pvf.usuario_id=$1' : ''}`, usuario_id ? [usuario_id] : []);

      const scoresByUser = {};
      scoresQ.rows.forEach(r => {
        if (!scoresByUser[r.usuario_id]) scoresByUser[r.usuario_id] = {};
        scoresByUser[r.usuario_id][r.tipo] = r;
      });

      const semisByUser = {};
      pronosticos.forEach(row => {
        if (row.partido.subtipo !== 'semifinal') return;
        if (!semisByUser[row.usuario.id]) {
          semisByUser[row.usuario.id] = {
            nombre: row.usuario.nombre,
            foto_perfil: row.usuario.foto_perfil,
            semis: []
          };
        }
        semisByUser[row.usuario.id].semis.push(row);
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

      // Construir pronosticos virtuales en el mismo formato
      for (const [uid, data] of Object.entries(semisByUser)) {
        const userId = parseInt(uid);
        const userScores = scoresByUser[userId] || {};
        const [semi1, semi2] = data.semis.sort((a, b) => a.partido.id - b.partido.id);
        if (!semi1 || !semi2) continue;

        const r1 = getGanadorPerdedor(
          semi1.pronostico.local,
          semi1.pronostico.visita,
          semi1.pronostico.quien_avanza,
          semi1.partido.local.nombre,
          semi1.partido.visita.nombre
        );
        const r2 = getGanadorPerdedor(
          semi2.pronostico.local,
          semi2.pronostico.visita,
          semi2.pronostico.quien_avanza,
          semi2.partido.local.nombre,
          semi2.partido.visita.nombre
        );

        const virtualPartidos = [
          { tipo: 'final', subtipo: 'final_virtual', local: r1.winner, visita: r2.winner, bonus: 2, label: '🏆 Final (virtual)' },
          { tipo: 'tercero_lugar', subtipo: 'tercero_virtual', local: r1.loser, visita: r2.loser, bonus: 1, label: '🥉 3er Lugar (virtual)' }
        ];

        for (const vp of virtualPartidos) {
          if (!vp.local || !vp.visita) continue;
          const score = userScores[vp.tipo];
          pronosticos.push({
            id: `virtual_${vp.tipo}_${userId}`,
            esVirtual: true,
            usuario: { id: userId, nombre: data.nombre, foto_perfil: data.foto_perfil },
            jornada: j7Row ? { id: j7Row.id, numero: 7, nombre: j7Row.nombre, cerrada: j7Row.cerrada } : {},
            partido: {
              id: null,
              local: { nombre: vp.local },
              visita: { nombre: vp.visita },
              grupo: null,
              subtipo: vp.subtipo,
              fecha: null,
              resultado: { local: null, visita: null },
              bonus: vp.bonus
            },
            pronostico: {
              local: score?.resultado_local ?? '—',
              visita: score?.resultado_visitante ?? '—'
            },
            puntos: null,
            fecha_pronostico: null
          });
        }
      }

      // Re-ordenar: semis primero, luego virtuales
      pronosticos.sort((a, b) => {
        if (a.esVirtual && !b.esVirtual) return 1;
        if (!a.esVirtual && b.esVirtual) return -1;
        return (a.usuario.nombre || '').localeCompare(b.usuario.nombre || '');
      });
    }

    res.json(pronosticos);
  } catch (error) {
    console.error('Error obteniendo pronósticos:', error);
    res.status(500).json({ error: 'Error obteniendo pronósticos' });
  }
});

// GET /api/mundial-clasificacion/partidos - Obtener todos los partidos
router.get('/partidos', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.id,
        p.equipo_local,
        p.equipo_visitante,
        p.grupo,
        p.fecha,
        mj.numero as jornada_numero,
        mj.nombre as jornada_nombre
      FROM mundial_partidos p
      INNER JOIN mundial_jornadas mj ON p.jornada_id = mj.id
      ORDER BY mj.numero, p.fecha
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo partidos:', error);
    res.status(500).json({ error: 'Error obteniendo partidos' });
  }
});

// GET /api/mundial-clasificacion/jornadas - Obtener todas las jornadas
router.get('/jornadas', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM mundial_jornadas
      ORDER BY numero
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo jornadas:', error);
    res.status(500).json({ error: 'Error obteniendo jornadas' });
  }
});

// GET /api/mundial-clasificacion/jugadores - Obtener todos los jugadores activos
router.get('/jugadores', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        nombre,
        foto_perfil
      FROM usuarios
      WHERE activo = true AND activo_mundial = true AND rol != 'admin'
      ORDER BY nombre
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo jugadores:', error);
    res.status(500).json({ error: 'Error obteniendo jugadores' });
  }
});

export default router;
