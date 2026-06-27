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
    }
    // Añadir mejores terceros como equipo real para POS3
    const tercR = await pool.query('SELECT equipo, grupo FROM mundial_mejores_terceros');
    tercR.rows.forEach(r => { clasificadosReales[`${r.grupo}_POS3`] = r.equipo; });

    const clasificados = predsResult.rows.map(row => {
      const match = row.fase.match(/16VOS_GRUPO_([A-Z]+)_POS(\d)/);
      if (!match) return null;
      const grupo = match[1];
      const pos = match[2];
      return {
        grupo,
        posicion: parseInt(pos),
        equipo_pronosticado: row.equipo,
        equipo_real: clasificadosReales[`${grupo}_POS${pos}`] || null,
        puntos: row.puntos
      };
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
    }
    // Añadir mejores terceros como equipo real para POS3
    const tercerosTodosR = await pool.query('SELECT equipo, grupo FROM mundial_mejores_terceros');
    tercerosTodosR.rows.forEach(r => { clasificadosReales[`${r.grupo}_POS3`] = r.equipo; });

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
      const match = row.fase.match(/16VOS_GRUPO_([A-Z]+)_POS(\d)/);
      if (!match) return;
      const grupo = match[1];
      const pos = match[2];
      porUsuario[row.usuario_id].clasificados.push({
        grupo,
        posicion: parseInt(pos),
        equipo_pronosticado: row.equipo,
        equipo_real: clasificadosReales[`${grupo}_POS${pos}`] || null,
        puntos: row.puntos
      });
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

export default router;

