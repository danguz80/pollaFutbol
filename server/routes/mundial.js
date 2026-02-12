import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';

const router = express.Router();

// ==================== GESTIÓN DE EQUIPOS ====================

// Obtener todos los grupos
router.get('/grupos', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT grupo FROM mundial_partidos 
      WHERE grupo IS NOT NULL 
      ORDER BY grupo
    `);
    
    const grupos = result.rows.map(r => ({ letra: r.grupo }));
    res.json(grupos);
  } catch (error) {
    console.error('Error obteniendo grupos:', error);
    res.status(500).json({ error: 'Error obteniendo grupos' });
  }
});

// Obtener todos los equipos
router.get('/equipos', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM mundial_equipos 
      ORDER BY grupo, posicion_grupo
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo equipos:', error);
    res.status(500).json({ error: 'Error obteniendo equipos' });
  }
});

// Guardar/Actualizar equipos (Admin)
router.post('/equipos', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { equipos } = req.body;
    
    if (!Array.isArray(equipos) || equipos.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array de equipos' });
    }

    await pool.query('DELETE FROM mundial_equipos');

    const gruposCount = {};
    
    for (const equipo of equipos) {
      if (!equipo.nombre || !equipo.grupo) {
        console.warn('Equipo sin nombre o grupo:', equipo);
        continue;
      }

      const grupo = equipo.grupo.toUpperCase();
      
      if (!gruposCount[grupo]) {
        gruposCount[grupo] = 0;
      }
      gruposCount[grupo]++;
      
      await pool.query(`
        INSERT INTO mundial_equipos (nombre, grupo, posicion_grupo, api_id, pais)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        equipo.nombre,
        grupo,
        gruposCount[grupo],
        equipo.api_id || null,
        equipo.pais || ''
      ]);
    }

    res.json({ mensaje: 'Equipos guardados exitosamente', total: equipos.length });
  } catch (error) {
    console.error('Error guardando equipos:', error);
    res.status(500).json({ error: 'Error guardando equipos', details: error.message });
  }
});

// ==================== GESTIÓN DE JORNADAS ====================

// Obtener todas las jornadas
router.get('/jornadas', async (req, res) => {
  try {
    let result = await pool.query(`
      SELECT * FROM mundial_jornadas 
      ORDER BY numero
    `);

    // Si no hay jornadas, crearlas automáticamente
    if (result.rows.length === 0) {
      const jornadas = [
        { numero: 1, nombre: 'Jornada 1 - Fase de Grupos', activa: false, descripcion: 'Primera fecha de la fase de grupos' },
        { numero: 2, nombre: 'Jornada 2 - Fase de Grupos', activa: false, descripcion: 'Segunda fecha de la fase de grupos' },
        { numero: 3, nombre: 'Jornada 3 - Fase de Grupos', activa: false, descripcion: 'Tercera fecha de la fase de grupos' },
        { numero: 4, nombre: 'Jornada 4 - 16vos de Final', activa: false, descripcion: '16vos de final (16 partidos)' },
        { numero: 5, nombre: 'Jornada 5 - Octavos de Final', activa: false, descripcion: 'Octavos de final (8 partidos)' },
        { numero: 6, nombre: 'Jornada 6 - Cuartos de Final', activa: false, descripcion: 'Cuartos de final (4 partidos)' },
        { numero: 7, nombre: 'Jornada 7 - Finales', activa: false, descripcion: 'Semifinales, tercer lugar y final (5 partidos)' }
      ];

      for (const jornada of jornadas) {
        await pool.query(`
          INSERT INTO mundial_jornadas (numero, nombre, activa, cerrada, descripcion)
          VALUES ($1, $2, $3, false, $4)
          ON CONFLICT (numero) DO NOTHING
        `, [jornada.numero, jornada.nombre, jornada.activa, jornada.descripcion]);
      }

      result = await pool.query(`
        SELECT * FROM mundial_jornadas 
        ORDER BY numero
      `);
    }

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo jornadas:', error);
    res.status(500).json({ error: 'Error obteniendo jornadas' });
  }
});

// Obtener jornada específica
router.get('/jornadas/:numero', async (req, res) => {
  try {
    const { numero } = req.params;
    const jornadaResult = await pool.query(`
      SELECT * FROM mundial_jornadas WHERE numero = $1
    `, [numero]);
    
    if (jornadaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }
    
    const partidosResult = await pool.query(`
      SELECT 
        p.*,
        el.grupo as grupo_local,
        ev.grupo as grupo_visita,
        el.pais as pais_local,
        ev.pais as pais_visita
      FROM mundial_partidos p
      LEFT JOIN mundial_equipos el ON el.nombre = p.equipo_local
      LEFT JOIN mundial_equipos ev ON ev.nombre = p.equipo_visitante
      WHERE p.jornada_id = $1
      ORDER BY p.fecha, p.id
    `, [jornadaResult.rows[0].id]);
    
    res.json({
      ...jornadaResult.rows[0],
      partidos: partidosResult.rows
    });
  } catch (error) {
    console.error('Error obteniendo jornada:', error);
    res.status(500).json({ error: 'Error obteniendo jornada' });
  }
});

// Obtener todos los partidos de todas las jornadas
router.get('/partidos', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.*,
        j.numero as jornada_numero,
        j.nombre as jornada_nombre,
        el.grupo as grupo_local,
        ev.grupo as grupo_visita,
        el.pais as pais_local,
        ev.pais as pais_visita
      FROM mundial_partidos p
      INNER JOIN mundial_jornadas j ON j.id = p.jornada_id
      LEFT JOIN mundial_equipos el ON el.nombre = p.equipo_local
      LEFT JOIN mundial_equipos ev ON ev.nombre = p.equipo_visitante
      ORDER BY j.numero, p.fecha, p.id
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo partidos:', error);
    res.status(500).json({ error: 'Error obteniendo partidos' });
  }
});

// Guardar fixture de una jornada (Admin)
router.post('/jornadas/:numero/fixture', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { numero } = req.params;
    const { partidos } = req.body;

    const jornadaResult = await pool.query(
      'SELECT id FROM mundial_jornadas WHERE numero = $1',
      [numero]
    );

    if (jornadaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    const jornadaId = jornadaResult.rows[0].id;
    
    // Eliminar partidos existentes de esta jornada
    await pool.query('DELETE FROM mundial_partidos WHERE jornada_id = $1', [jornadaId]);

    // Insertar nuevos partidos
    for (const partido of partidos) {
      await pool.query(`
        INSERT INTO mundial_partidos (
          jornada_id, equipo_local, equipo_visitante, fecha, 
          estadio, api_id, partido_numero, grupo, bonus
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        jornadaId,
        partido.equipo_local,
        partido.equipo_visitante,
        partido.fecha || null,
        partido.estadio || null,
        partido.api_id || null,
        partido.partido_numero || null,
        partido.grupo || null,
        partido.bonus || 1
      ]);
    }

    res.json({ mensaje: 'Fixture guardado exitosamente', partidos: partidos.length });
  } catch (error) {
    console.error('Error guardando fixture:', error);
    res.status(500).json({ error: 'Error guardando fixture', details: error.message });
  }
});

// Actualizar resultados de partidos (Admin)
router.patch('/partidos/:id', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { resultado_local, resultado_visitante, bonus } = req.body;

    // Construir la query dinámicamente según los campos enviados
    const updates = [];
    const values = [];
    let paramCounter = 1;

    if (resultado_local !== undefined) {
      updates.push(`resultado_local = $${paramCounter}`);
      values.push(resultado_local);
      paramCounter++;
    }

    if (resultado_visitante !== undefined) {
      updates.push(`resultado_visitante = $${paramCounter}`);
      values.push(resultado_visitante);
      paramCounter++;
    }

    if (bonus !== undefined) {
      updates.push(`bonus = $${paramCounter}`);
      values.push(bonus);
      paramCounter++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    values.push(id);

    const result = await pool.query(`
      UPDATE mundial_partidos 
      SET ${updates.join(', ')}
      WHERE id = $${paramCounter}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Partido no encontrado' });
    }

    res.json({ mensaje: 'Partido actualizado', partido: result.rows[0] });
  } catch (error) {
    console.error('Error actualizando partido:', error);
    res.status(500).json({ error: 'Error actualizando partido' });
  }
});

// Activar/desactivar jornada (Admin)
router.patch('/jornadas/:numero/toggle', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { numero } = req.params;

    const result = await pool.query(`
      UPDATE mundial_jornadas 
      SET activa = NOT activa
      WHERE numero = $1
      RETURNING *
    `, [numero]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    res.json({ mensaje: 'Estado de jornada actualizado', jornada: result.rows[0] });
  } catch (error) {
    console.error('Error actualizando jornada:', error);
    res.status(500).json({ error: 'Error actualizando jornada' });
  }
});

// Cerrar jornada (Admin)
router.patch('/jornadas/:numero/cerrar', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { numero } = req.params;

    const result = await pool.query(`
      UPDATE mundial_jornadas 
      SET cerrada = true, activa = false
      WHERE numero = $1
      RETURNING *
    `, [numero]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    res.json({ mensaje: 'Jornada cerrada exitosamente', jornada: result.rows[0] });
  } catch (error) {
    console.error('Error cerrando jornada:', error);
    res.status(500).json({ error: 'Error cerrando jornada' });
  }
});

// Abrir jornada (Admin)
router.patch('/jornadas/:numero/abrir', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { numero } = req.params;

    const result = await pool.query(`
      UPDATE mundial_jornadas 
      SET cerrada = false
      WHERE numero = $1
      RETURNING *
    `, [numero]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    res.json({ mensaje: 'Jornada abierta exitosamente', jornada: result.rows[0] });
  } catch (error) {
    console.error('Error abriendo jornada:', error);
    res.status(500).json({ error: 'Error abriendo jornada' });
  }
});

// Eliminar fixture de una jornada (Admin)
router.delete('/jornadas/:numero/fixture', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { numero } = req.params;

    const jornadaResult = await pool.query(
      'SELECT id FROM mundial_jornadas WHERE numero = $1',
      [numero]
    );

    if (jornadaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    const jornadaId = jornadaResult.rows[0].id;
    await pool.query('DELETE FROM mundial_partidos WHERE jornada_id = $1', [jornadaId]);
    await pool.query('DELETE FROM mundial_pronosticos WHERE jornada_id = $1', [jornadaId]);
    await pool.query('DELETE FROM mundial_ganadores_jornada WHERE jornada_numero = $1', [numero]);

    res.json({ mensaje: 'Fixture eliminado exitosamente' });
  } catch (error) {
    console.error('Error eliminando fixture:', error);
    res.status(500).json({ error: 'Error eliminando fixture' });
  }
});

// ==================== GESTIÓN DE PRONÓSTICOS ====================

// Obtener pronósticos del usuario para una jornada
router.get('/pronosticos/:numero', verifyToken, async (req, res) => {
  try {
    const { numero } = req.params;
    const usuario_id = req.usuario.id;

    const jornadaResult = await pool.query(
      'SELECT id FROM mundial_jornadas WHERE numero = $1',
      [numero]
    );

    if (jornadaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    const jornadaId = jornadaResult.rows[0].id;

    const result = await pool.query(`
      SELECT p.*, 
             part.equipo_local, 
             part.equipo_visitante,
             part.resultado_local as resultado_real_local,
             part.resultado_visitante as resultado_real_visitante
      FROM mundial_pronosticos p
      INNER JOIN mundial_partidos part ON part.id = p.partido_id
      WHERE p.usuario_id = $1 AND p.jornada_id = $2
      ORDER BY part.id
    `, [usuario_id, jornadaId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo pronósticos:', error);
    res.status(500).json({ error: 'Error obteniendo pronósticos' });
  }
});

// Guardar pronósticos del usuario para una jornada
router.post('/pronosticos/:numero', verifyToken, async (req, res) => {
  try {
    const { numero } = req.params;
    const usuario_id = req.usuario.id;
    const { pronosticos } = req.body;

    // Verificar si el usuario está activo en Mundial
    const usuarioCheck = await pool.query(
      'SELECT activo_mundial FROM usuarios WHERE id = $1',
      [usuario_id]
    );
    
    // Solo permitir si está explícitamente en true
    if (usuarioCheck.rowCount === 0 || usuarioCheck.rows[0].activo_mundial !== true) {
      console.log('🚫 Usuario sin acceso al Mundial:', usuario_id, usuarioCheck.rows[0]);
      return res.status(403).json({ error: 'No tienes acceso para ingresar pronósticos en el Mundial 2026' });
    }

    if (!Array.isArray(pronosticos) || pronosticos.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array de pronósticos' });
    }

    // Verificar que la jornada existe y está activa
    const jornadaResult = await pool.query(
      'SELECT id, activa, cerrada FROM mundial_jornadas WHERE numero = $1',
      [numero]
    );

    if (jornadaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    const jornada = jornadaResult.rows[0];

    if (jornada.cerrada) {
      return res.status(403).json({ error: 'Esta jornada está cerrada, no se pueden modificar pronósticos' });
    }

    if (!jornada.activa) {
      return res.status(403).json({ error: 'Esta jornada no está activa para ingresar pronósticos' });
    }

    // Guardar cada pronóstico
    for (const pronostico of pronosticos) {
      await pool.query(`
        INSERT INTO mundial_pronosticos 
        (usuario_id, jornada_id, partido_id, resultado_local, resultado_visitante)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (usuario_id, partido_id)
        DO UPDATE SET 
          resultado_local = EXCLUDED.resultado_local,
          resultado_visitante = EXCLUDED.resultado_visitante,
          actualizado_en = NOW()
      `, [
        usuario_id,
        jornada.id,
        pronostico.partido_id,
        pronostico.resultado_local,
        pronostico.resultado_visitante
      ]);
    }

    res.json({ 
      mensaje: 'Pronósticos guardados exitosamente',
      total: pronosticos.length 
    });
  } catch (error) {
    console.error('Error guardando pronósticos:', error);
    res.status(500).json({ error: 'Error guardando pronósticos', details: error.message });
  }
});

export default router;
