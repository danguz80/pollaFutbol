import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';
import { getWhatsAppService } from '../services/whatsappService.js';
import { generarPdfTestigoBuffer } from '../utils/pdfTestigo.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { calcularTablaOficial, calcularTablaUsuario } from '../utils/calcularClasificadosLibertadores.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Guardar pronóstico de final VIRTUAL (J10)
router.post('/final-virtual', verifyToken, async (req, res) => {
  try {
    const usuario_id = req.usuario.id;
    const { jornada_id, equipo_local, equipo_visita, goles_local, goles_visita, penales_local, penales_visita } = req.body;

    // Verificar si el usuario está activo en Libertadores
    const usuarioCheck = await pool.query(
      'SELECT activo_libertadores FROM usuarios WHERE id = $1',
      [usuario_id]
    );
    // Solo permitir si está explícitamente en true
    if (usuarioCheck.rowCount === 0 || usuarioCheck.rows[0].activo_libertadores !== true) {
      console.log('🚫 Usuario sin acceso a Libertadores (final-virtual):', usuario_id, usuarioCheck.rows[0]);
      return res.status(403).json({ error: 'No tienes acceso para ingresar pronósticos en la Copa Libertadores' });
    }

    // Verificar si la jornada está cerrada
    const jornadaCheck = await pool.query(
      'SELECT cerrada, numero FROM libertadores_jornadas WHERE id = $1',
      [jornada_id]
    );

    if (jornadaCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    if (jornadaCheck.rows[0].cerrada) {
      return res.status(403).json({ error: 'Esta jornada está cerrada' });
    }

    if (jornadaCheck.rows[0].numero !== 10) {
      return res.status(400).json({ error: 'Este endpoint es solo para la jornada 10' });
    }

    // Guardar pronóstico de final virtual
    await pool.query(`
      INSERT INTO libertadores_pronosticos_final_virtual 
      (usuario_id, jornada_id, equipo_local, equipo_visita, goles_local, goles_visita, penales_local, penales_visita)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (usuario_id, jornada_id)
      DO UPDATE SET 
        equipo_local = EXCLUDED.equipo_local,
        equipo_visita = EXCLUDED.equipo_visita,
        goles_local = EXCLUDED.goles_local, 
        goles_visita = EXCLUDED.goles_visita,
        penales_local = EXCLUDED.penales_local,
        penales_visita = EXCLUDED.penales_visita
    `, [usuario_id, jornada_id, equipo_local, equipo_visita, goles_local, goles_visita, penales_local || null, penales_visita || null]);

    // Determinar ganador para predicción de campeón/subcampeón
    let campeon = null;
    let subcampeon = null;
    
    if (goles_local > goles_visita) {
      campeon = equipo_local;
      subcampeon = equipo_visita;
    } else if (goles_local < goles_visita) {
      campeon = equipo_visita;
      subcampeon = equipo_local;
    } else if (penales_local !== null && penales_visita !== null) {
      if (penales_local > penales_visita) {
        campeon = equipo_local;
        subcampeon = equipo_visita;
      } else if (penales_local < penales_visita) {
        campeon = equipo_visita;
        subcampeon = equipo_local;
      }
    }
    
    // Guardar predicción de campeón/subcampeón
    if (campeon && subcampeon) {
      await pool.query(
        `INSERT INTO libertadores_predicciones_campeon (usuario_id, campeon, subcampeon)
         VALUES ($1, $2, $3)
         ON CONFLICT (usuario_id)
         DO UPDATE SET campeon = EXCLUDED.campeon, subcampeon = EXCLUDED.subcampeon, updated_at = CURRENT_TIMESTAMP`,
        [usuario_id, campeon, subcampeon]
      );
    }

    res.json({ 
      mensaje: 'Pronóstico de final virtual guardado exitosamente',
      prediccion_campeon: campeon && subcampeon ? { campeon, subcampeon } : null
    });
  } catch (error) {
    console.error('Error guardando pronóstico de final virtual:', error);
    res.status(500).json({ error: 'Error guardando pronóstico' });
  }
});

// Guardar/Actualizar pronóstico
router.post('/', verifyToken, async (req, res) => {
  try {
    const usuario_id = req.usuario.id;
    const { partido_id, jornada_id, goles_local, goles_visita, penales_local, penales_visita } = req.body;

    // Verificar si el usuario está activo en Libertadores
    const usuarioCheck = await pool.query(
      'SELECT activo_libertadores FROM usuarios WHERE id = $1',
      [usuario_id]
    );
    // Solo permitir si está explícitamente en true
    if (usuarioCheck.rowCount === 0 || usuarioCheck.rows[0].activo_libertadores !== true) {
      console.log('🚫 Usuario sin acceso a Libertadores:', usuario_id, usuarioCheck.rows[0]);
      return res.status(403).json({ error: 'No tienes acceso para ingresar pronósticos en la Copa Libertadores' });
    }

    // Verificar si la jornada está cerrada
    const jornadaCheck = await pool.query(
      'SELECT cerrada FROM libertadores_jornadas WHERE id = $1',
      [jornada_id]
    );

    if (jornadaCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    if (jornadaCheck.rows[0].cerrada) {
      return res.status(403).json({ error: 'Esta jornada está cerrada' });
    }

    // Insertar o actualizar pronóstico (incluyendo penales)
    await pool.query(`
      INSERT INTO libertadores_pronosticos 
      (usuario_id, partido_id, jornada_id, goles_local, goles_visita, penales_local, penales_visita)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (usuario_id, partido_id, jornada_id)
      DO UPDATE SET 
        goles_local = EXCLUDED.goles_local, 
        goles_visita = EXCLUDED.goles_visita,
        penales_local = EXCLUDED.penales_local,
        penales_visita = EXCLUDED.penales_visita
    `, [usuario_id, partido_id, jornada_id, goles_local, goles_visita, penales_local || null, penales_visita || null]);

    res.json({ mensaje: 'Pronóstico guardado exitosamente' });
  } catch (error) {
    console.error('Error guardando pronóstico:', error);
    res.status(500).json({ error: 'Error guardando pronóstico' });
  }
});

// Obtener pronósticos de un usuario para una jornada
router.get('/jornada/:numero', verifyToken, async (req, res) => {
  try {
    const usuario_id = req.usuario.id;
    const { numero } = req.params;

    const result = await pool.query(`
      SELECT p.*
      FROM libertadores_pronosticos p
      JOIN libertadores_jornadas j ON p.jornada_id = j.id
      WHERE p.usuario_id = $1 AND j.numero = $2
    `, [usuario_id, numero]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo pronósticos:', error);
    res.status(500).json({ error: 'Error obteniendo pronósticos' });
  }
});

// Obtener pronóstico de final virtual (J10)
router.get('/final-virtual/:jornada_id', verifyToken, async (req, res) => {
  try {
    const usuario_id = req.usuario.id;
    const { jornada_id } = req.params;

    const result = await pool.query(`
      SELECT *
      FROM libertadores_pronosticos_final_virtual
      WHERE usuario_id = $1 AND jornada_id = $2
    `, [usuario_id, jornada_id]);

    if (result.rows.length === 0) {
      return res.json(null);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obteniendo pronóstico de final virtual:', error);
    res.status(500).json({ error: 'Error obteniendo pronóstico' });
  }
});

// Calcular puntajes de una jornada
router.post('/calcular/:numero', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { numero } = req.params;

    const pronosticos = await pool.query(`
      SELECT p.id, p.usuario_id, p.goles_local, p.goles_visita,
             pa.goles_local AS real_local, pa.goles_visita AS real_visita,
             pa.bonus
      FROM libertadores_pronosticos p
      JOIN libertadores_partidos pa ON p.partido_id = pa.id
      JOIN libertadores_jornadas j ON p.jornada_id = j.id
      WHERE j.numero = $1
    `, [numero]);

    let actualizados = 0;

    for (const p of pronosticos.rows) {
      if (p.real_local === null || p.real_visita === null) {
        continue; // Saltar partidos sin resultado
      }

      let puntosBase = 0;
      const pred_dif = p.goles_local - p.goles_visita;
      const real_dif = p.real_local - p.real_visita;
      const pred_signo = Math.sign(pred_dif);
      const real_signo = Math.sign(real_dif);

      if (p.goles_local === p.real_local && p.goles_visita === p.real_visita) {
        puntosBase = 5; // Resultado exacto
      } else if (pred_dif === real_dif) {
        puntosBase = 3; // Diferencia exacta
      } else if (pred_signo === real_signo && real_signo !== 0) {
        puntosBase = 1; // Solo el signo
      }

      const puntos = puntosBase * (p.bonus || 1);

      await pool.query(
        'UPDATE libertadores_pronosticos SET puntos = $1 WHERE id = $2',
        [puntos, p.id]
      );

      actualizados++;
    }

    res.json({ mensaje: 'Puntajes calculados', actualizados });
  } catch (error) {
    console.error('Error calculando puntajes:', error);
    res.status(500).json({ error: 'Error calculando puntajes' });
  }
});

// Ranking general
router.get('/ranking', async (req, res) => {
  try {
    // Obtener puntos de pronósticos
    const result = await pool.query(`
      SELECT 
        u.id, u.nombre, u.foto_perfil,
        COALESCE(SUM(p.puntos), 0) as puntaje_pronosticos
      FROM usuarios u
      LEFT JOIN libertadores_pronosticos p ON p.usuario_id = u.id
      LEFT JOIN libertadores_usuarios_activos lua ON lua.usuario_id = u.id
      WHERE lua.activo = true OR lua.usuario_id IS NULL
      GROUP BY u.id, u.nombre, u.foto_perfil
      ORDER BY u.nombre
    `);
    
    // Para cada usuario, obtener puntos de clasificados
    const jornadasNumeros = [1, 2, 3, 4, 5, 6];
    const grupos = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    
    // Calcular clasificados oficiales una sola vez
    const clasificadosOficiales = [];
    for (const grupo of grupos) {
      const tabla = await calcularTablaOficial(grupo, jornadasNumeros);
      if (tabla.length >= 2) {
        clasificadosOficiales.push(tabla[0].nombre);
        clasificadosOficiales.push(tabla[1].nombre);
      }
    }
    
    // Para cada usuario, calcular puntos de clasificados
    const ranking = await Promise.all(result.rows.map(async (usuario) => {
      let puntosClasificados = 0;
      
      for (const grupo of grupos) {
        try {
          const tablaUsuario = await calcularTablaUsuario(usuario.id, grupo, jornadasNumeros);
          
          if (tablaUsuario.length >= 2) {
            const equiposUsuario = [tablaUsuario[0].nombre, tablaUsuario[1].nombre];
            equiposUsuario.forEach(equipo => {
              if (clasificadosOficiales.includes(equipo)) {
                puntosClasificados += 2;
              }
            });
          }
        } catch (error) {
          // Si hay error en un grupo, continuar con los demás
          console.error(`Error calculando grupo ${grupo} para usuario ${usuario.id}:`, error.message);
        }
      }
      
      return {
        ...usuario,
        puntaje_clasificados: puntosClasificados,
        puntaje_total: parseInt(usuario.puntaje_pronosticos) + puntosClasificados
      };
    }));
    
    // Ordenar por puntaje total
    ranking.sort((a, b) => {
      if (b.puntaje_total !== a.puntaje_total) return b.puntaje_total - a.puntaje_total;
      return a.nombre.localeCompare(b.nombre);
    });

    res.json(ranking);
  } catch (error) {
    console.error('Error obteniendo ranking:', error);
    res.status(500).json({ error: 'Error obteniendo ranking' });
  }
});

// Ranking de una jornada
router.get('/ranking/jornada/:numero', async (req, res) => {
  try {
    const { numero } = req.params;

    const result = await pool.query(`
      SELECT 
        u.id, u.nombre, u.foto_perfil,
        COALESCE(SUM(p.puntos), 0) as puntaje_jornada
      FROM usuarios u
      LEFT JOIN libertadores_pronosticos p ON p.usuario_id = u.id
      LEFT JOIN libertadores_jornadas j ON p.jornada_id = j.id AND j.numero = $1
      LEFT JOIN libertadores_usuarios_activos lua ON lua.usuario_id = u.id
      WHERE (lua.activo = true OR lua.usuario_id IS NULL)
      GROUP BY u.id, u.nombre, u.foto_perfil
      ORDER BY u.nombre
    `, [numero]);
    
    // Si es jornada 6, agregar puntos de clasificados
    if (parseInt(numero) === 6) {
      const jornadasNumeros = [1, 2, 3, 4, 5, 6];
      const grupos = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      
      // Calcular clasificados oficiales
      const clasificadosOficiales = [];
      for (const grupo of grupos) {
        const tabla = await calcularTablaOficial(grupo, jornadasNumeros);
        if (tabla.length >= 2) {
          clasificadosOficiales.push(tabla[0].nombre);
          clasificadosOficiales.push(tabla[1].nombre);
        }
      }
      
      // Para cada usuario, calcular puntos de clasificados
      const ranking = await Promise.all(result.rows.map(async (usuario) => {
        let puntosClasificados = 0;
        
        for (const grupo of grupos) {
          try {
            const tablaUsuario = await calcularTablaUsuario(usuario.id, grupo, jornadasNumeros);
            
            if (tablaUsuario.length >= 2) {
              const equiposUsuario = [tablaUsuario[0].nombre, tablaUsuario[1].nombre];
              equiposUsuario.forEach(equipo => {
                if (clasificadosOficiales.includes(equipo)) {
                  puntosClasificados += 2;
                }
              });
            }
          } catch (error) {
            console.error(`Error calculando grupo ${grupo} para usuario ${usuario.id}:`, error.message);
          }
        }
        
        return {
          ...usuario,
          puntaje_clasificados: puntosClasificados,
          puntaje_jornada: parseInt(usuario.puntaje_jornada) + puntosClasificados
        };
      }));
      
      // Ordenar por puntaje total
      ranking.sort((a, b) => {
        if (b.puntaje_jornada !== a.puntaje_jornada) return b.puntaje_jornada - a.puntaje_jornada;
        return a.nombre.localeCompare(b.nombre);
      });
      
      return res.json(ranking);
    }

    // Para otras jornadas, ordenar normalmente
    result.rows.sort((a, b) => {
      if (b.puntaje_jornada !== a.puntaje_jornada) return b.puntaje_jornada - a.puntaje_jornada;
      return a.nombre.localeCompare(b.nombre);
    });
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo ranking de jornada:', error);
    res.status(500).json({ error: 'Error obteniendo ranking de jornada' });
  }
});

// Borrar todos los pronósticos de un usuario para una jornada específica
router.delete('/jornada/:numero', verifyToken, async (req, res) => {
  try {
    const usuario_id = req.usuario.id;
    const { numero } = req.params;

    // Verificar si la jornada está cerrada
    const jornadaCheck = await pool.query(
      'SELECT id, cerrada FROM libertadores_jornadas WHERE numero = $1',
      [numero]
    );

    if (jornadaCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    if (jornadaCheck.rows[0].cerrada) {
      return res.status(403).json({ error: 'No puedes borrar pronósticos de una jornada cerrada' });
    }

    const jornadaId = jornadaCheck.rows[0].id;

    // Borrar todos los pronósticos del usuario para esta jornada
    const result = await pool.query(
      'DELETE FROM libertadores_pronosticos WHERE usuario_id = $1 AND jornada_id = $2',
      [usuario_id, jornadaId]
    );

    res.json({ 
      mensaje: 'Pronósticos borrados exitosamente',
      cantidad: result.rowCount
    });
  } catch (error) {
    console.error('Error borrando pronósticos:', error);
    res.status(500).json({ error: 'Error borrando pronósticos' });
  }
});

// GET /todos/jornada/:numero - Obtener todos los pronósticos de todos los usuarios (simulador)
router.get('/todos/jornada/:numero', verifyToken, async (req, res) => {
  try {
    const { numero } = req.params;
    const result = await pool.query(`
      SELECT
        u.id AS usuario_id,
        u.nombre AS usuario,
        u.foto_perfil AS usuario_foto_perfil,
        lp.partido_id,
        lp.goles_local,
        lp.goles_visita,
        p.nombre_local,
        p.nombre_visita,
        p.bonus
      FROM libertadores_pronosticos lp
      JOIN usuarios u ON lp.usuario_id = u.id
      JOIN libertadores_partidos p ON lp.partido_id = p.id
      JOIN libertadores_jornadas lj ON lp.jornada_id = lj.id
      WHERE lj.numero = $1
        AND u.rol != 'admin'
      ORDER BY u.nombre, p.id
    `, [numero]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo todos los pronósticos:', error);
    res.status(500).json({ error: 'Error obteniendo pronósticos' });
  }
});

// GET /resumen/jornada/:jornada - Resumen agrupado de pronósticos por jornada
router.get('/resumen/jornada/:jornada', verifyToken, async (req, res) => {
  const { jornada } = req.params;
  try {
    const result = await pool.query(
      `SELECT 
        lp.partido_id,
        pa.nombre_local,
        pa.nombre_visita,
        pa.fecha,
        lp.goles_local,
        lp.goles_visita,
        u.id as usuario_id,
        u.nombre as usuario_nombre,
        u.foto_perfil
      FROM libertadores_pronosticos lp
      JOIN libertadores_partidos pa ON lp.partido_id = pa.id
      JOIN libertadores_jornadas j ON lp.jornada_id = j.id
      JOIN usuarios u ON lp.usuario_id = u.id
      WHERE j.numero = $1
        AND u.activo_libertadores = true
        AND u.rol != 'admin'
      ORDER BY pa.fecha ASC, pa.id ASC, lp.goles_local, lp.goles_visita`,
      [jornada]
    );

    if (result.rows.length === 0) {
      return res.json({ partidos: [], totalPronosticos: 0 });
    }

    const partidosMap = new Map();
    result.rows.forEach(row => {
      if (!partidosMap.has(row.partido_id)) {
        partidosMap.set(row.partido_id, {
          partido_id: row.partido_id,
          nombre_local: row.nombre_local,
          nombre_visita: row.nombre_visita,
          fecha: row.fecha,
          pronosticos: []
        });
      }
      partidosMap.get(row.partido_id).pronosticos.push({
        goles_local: row.goles_local,
        goles_visita: row.goles_visita,
        usuario_id: row.usuario_id,
        usuario_nombre: row.usuario_nombre,
        foto_perfil: row.foto_perfil
      });
    });

    const partidosAgrupados = Array.from(partidosMap.values()).map(partido => {
      const grupos = new Map();
      partido.pronosticos.forEach(pron => {
        const key = `${pron.goles_local}-${pron.goles_visita}`;
        if (!grupos.has(key)) {
          grupos.set(key, { resultado: key, goles_local: pron.goles_local, goles_visita: pron.goles_visita, cantidad: 0, porcentaje: 0, usuarios: [] });
        }
        const g = grupos.get(key);
        g.cantidad++;
        g.usuarios.push({ id: pron.usuario_id, nombre: pron.usuario_nombre, foto_perfil: pron.foto_perfil });
      });
      grupos.forEach(g => {
        g.porcentaje = ((g.cantidad / partido.pronosticos.length) * 100).toFixed(1);
      });
      return {
        partido_id: partido.partido_id,
        nombre_local: partido.nombre_local,
        nombre_visita: partido.nombre_visita,
        fecha: partido.fecha,
        total_pronosticos: partido.pronosticos.length,
        grupos: Array.from(grupos.values()).sort((a, b) => b.cantidad - a.cantidad)
      };
    });

    res.json({ jornada: parseInt(jornada), partidos: partidosAgrupados, totalPronosticos: result.rows.length });
  } catch (error) {
    console.error('Error obteniendo resumen Libertadores:', error);
    res.status(500).json({ error: 'No se pudo obtener el resumen', detalles: error.message });
  }
});

// Generar PDF con pronósticos de una jornada y enviarlo por email
router.post('/generar-pdf/:numero', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { numero } = req.params;

    console.log(`📄 Generando PDF para jornada Libertadores ${numero}...`);

    // Obtener todos los pronósticos de la jornada
    const pronosticosResult = await pool.query(`
      SELECT 
        u.nombre as usuario,
        u.foto_perfil,
        pa.nombre_local,
        pa.nombre_visita,
        pa.fecha,
        p.goles_local,
        p.goles_visita,
        p.penales_local,
        p.penales_visita,
        pa.goles_local as real_local,
        pa.goles_visita as real_visita,
        p.puntos
      FROM libertadores_pronosticos p
      JOIN usuarios u ON p.usuario_id = u.id
      JOIN libertadores_partidos pa ON p.partido_id = pa.id
      JOIN libertadores_jornadas j ON p.jornada_id = j.id
      WHERE j.numero = $1
      ORDER BY u.nombre, pa.fecha
    `, [numero]);

    if (pronosticosResult.rows.length === 0) {
      return res.status(404).json({ error: 'No hay pronósticos para esta jornada' });
    }

    const pronosticos = pronosticosResult.rows;

    // Obtener lista única de partidos ordenados por fecha
    const partidosUnicos = [];
    const partidosVistos = new Set();
    pronosticos.forEach(p => {
      const key = `${p.nombre_local}|${p.nombre_visita}|${p.fecha}`;
      if (!partidosVistos.has(key)) {
        partidosVistos.add(key);
        partidosUnicos.push({
          nombre_local: p.nombre_local,
          nombre_visita: p.nombre_visita,
          fecha: p.fecha
        });
      }
    });

    // Ordenar partidos por fecha
    partidosUnicos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    // Para J8 (VUELTA de Octavos): traer también el pronóstico y el resultado
    // real de la IDA (J7) de cada cruce, para mostrarlos debajo de cada fila —
    // es lo que realmente decide el marcador global (y por lo tanto si
    // correspondían penales), y sin verlo ahí es imposible auditar por qué el
    // sistema eligió el equipo que eligió.
    const idaPronosticosPorUsuario = {};
    const idaRealPorPartido = {};
    if (String(numero) === '8') {
      const idaPronosticosResult = await pool.query(`
        SELECT u.nombre as usuario, pa.nombre_local, pa.nombre_visita,
               p.goles_local, p.goles_visita
        FROM libertadores_pronosticos p
        JOIN usuarios u ON p.usuario_id = u.id
        JOIN libertadores_partidos pa ON p.partido_id = pa.id
        JOIN libertadores_jornadas j ON p.jornada_id = j.id
        WHERE j.numero = 7
      `);
      idaPronosticosResult.rows.forEach(r => {
        if (!idaPronosticosPorUsuario[r.usuario]) idaPronosticosPorUsuario[r.usuario] = {};
        idaPronosticosPorUsuario[r.usuario][`${r.nombre_local}|${r.nombre_visita}`] = r;
      });

      const idaRealResult = await pool.query(`
        SELECT pa.nombre_local, pa.nombre_visita, pa.goles_local, pa.goles_visita
        FROM libertadores_partidos pa
        JOIN libertadores_jornadas j ON pa.jornada_id = j.id
        WHERE j.numero = 7
      `);
      idaRealResult.rows.forEach(r => {
        idaRealPorPartido[`${r.nombre_local}|${r.nombre_visita}`] = r;
      });
    }

    // Agrupar pronósticos por usuario con foto de perfil
    const pronosticosPorUsuario = {};
    pronosticos.forEach(p => {
      if (!pronosticosPorUsuario[p.usuario]) {
        pronosticosPorUsuario[p.usuario] = {
          foto_perfil: p.foto_perfil,
          pronosticos: {}
        };
      }
      const key = `${p.nombre_local}|${p.nombre_visita}`;

      if (String(numero) === '8') {
        // En la ida (J7), este cruce va con los equipos invertidos.
        const idaKey = `${p.nombre_visita}|${p.nombre_local}`;
        const idaPron = idaPronosticosPorUsuario[p.usuario]?.[idaKey];
        const idaReal = idaRealPorPartido[idaKey];
        const idaPronTxt = idaPron && idaPron.goles_local !== null && idaPron.goles_visita !== null
          ? `${idaPron.goles_local}-${idaPron.goles_visita}` : 'sin pronóstico';
        const idaRealTxt = idaReal && idaReal.goles_local !== null && idaReal.goles_visita !== null
          ? `${idaReal.goles_local}-${idaReal.goles_visita}` : 'pendiente';
        p.notaIda = `Ida (J7) ${p.nombre_visita} vs ${p.nombre_local} — pronosticado: ${idaPronTxt}  ·  real: ${idaRealTxt}`;
      }

      pronosticosPorUsuario[p.usuario].pronosticos[key] = p;
    });

    // Generar PDF con pdfkit (sin Chromium, bajo consumo de memoria)
    console.log('📄 Generando PDF...');

    const pdfBuffer = await generarPdfTestigoBuffer({
      competencia: 'Copa Libertadores',
      jornadaNumero: numero,
      partidosUnicos,
      pronosticosPorUsuario
    });

    console.log('✅ PDF generado exitosamente');

    const nombreArchivo = `Libertadores_Jornada_${numero}_${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Error generando PDF:', error);
    res.status(500).json({ 
      error: 'Error generando PDF',
      detalles: error.message 
    });
  }
});

export default router;
