import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';

const router = express.Router();

// ==================== GESTIÓN DE EQUIPOS ====================

// Obtener todos los equipos
router.get('/equipos', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM libertadores_equipos 
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
    const { equipos } = req.body; // Array de 32 equipos
    
    if (!Array.isArray(equipos) || equipos.length !== 32) {
      return res.status(400).json({ error: 'Se requieren exactamente 32 equipos' });
    }

    // Limpiar equipos existentes
    await pool.query('DELETE FROM libertadores_equipos');

    // Insertar nuevos equipos
    const grupos = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    let index = 0;

    for (const grupo of grupos) {
      for (let pos = 1; pos <= 4; pos++) {
        const equipo = equipos[index];
        if (equipo && equipo.nombre) {
          await pool.query(`
            INSERT INTO libertadores_equipos (nombre, grupo, posicion_grupo, api_id, pais)
            VALUES ($1, $2, $3, $4, $5)
          `, [equipo.nombre, grupo, pos, equipo.api_id || null, equipo.pais || '']);
        }
        index++;
      }
    }

    res.json({ mensaje: 'Equipos guardados exitosamente' });
  } catch (error) {
    console.error('Error guardando equipos:', error);
    res.status(500).json({ error: 'Error guardando equipos' });
  }
});

// ==================== GESTIÓN DE JORNADAS ====================

// Obtener todas las jornadas
router.get('/jornadas', async (req, res) => {
  try {
    let result = await pool.query(`
      SELECT * FROM libertadores_jornadas 
      ORDER BY numero
    `);

    // Si no hay jornadas, crearlas automáticamente
    if (result.rows.length === 0) {
      const jornadas = [
        { numero: 1, nombre: 'Jornada 1', activa: false },
        { numero: 2, nombre: 'Jornada 2', activa: false },
        { numero: 3, nombre: 'Jornada 3', activa: false },
        { numero: 4, nombre: 'Jornada 4', activa: false },
        { numero: 5, nombre: 'Jornada 5', activa: false },
        { numero: 6, nombre: 'Jornada 6', activa: false },
        { numero: 7, nombre: 'Jornada 7', activa: false },
        { numero: 8, nombre: 'Jornada 8', activa: false },
        { numero: 9, nombre: 'Jornada 9', activa: false },
        { numero: 10, nombre: 'Jornada 10', activa: false }
      ];

      for (const jornada of jornadas) {
        await pool.query(`
          INSERT INTO libertadores_jornadas (numero, nombre, activa, cerrada)
          VALUES ($1, $2, $3, false)
          ON CONFLICT (numero) DO NOTHING
        `, [jornada.numero, jornada.nombre, jornada.activa]);
      }

      result = await pool.query(`
        SELECT * FROM libertadores_jornadas 
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
      SELECT * FROM libertadores_jornadas WHERE numero = $1
    `, [numero]);
    
    if (jornadaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }
    
    // Obtener partidos de esta jornada con grupos y países de equipos
    const partidosResult = await pool.query(`
      SELECT 
        p.*,
        el.grupo as grupo_local,
        ev.grupo as grupo_visita,
        el.pais as pais_local,
        ev.pais as pais_visita
      FROM libertadores_partidos p
      LEFT JOIN libertadores_equipos el ON el.nombre = p.nombre_local
      LEFT JOIN libertadores_equipos ev ON ev.nombre = p.nombre_visita
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

// Actualizar fecha de cierre de jornada
router.patch('/jornadas/:numero/cierre', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { numero } = req.params;
    const { fecha_cierre } = req.body;

    const result = await pool.query(`
      UPDATE libertadores_jornadas 
      SET fecha_cierre = $1 
      WHERE numero = $2
      RETURNING *
    `, [fecha_cierre, numero]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    res.json({ mensaje: 'Fecha de cierre actualizada', jornada: result.rows[0] });
  } catch (error) {
    console.error('Error actualizando fecha de cierre:', error);
    res.status(500).json({ error: 'Error actualizando fecha de cierre' });
  }
});

// Cerrar/Abrir jornada
router.patch('/jornadas/:numero/toggle', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { numero } = req.params;
    const { cerrada } = req.body;

    const result = await pool.query(`
      UPDATE libertadores_jornadas 
      SET cerrada = $1 
      WHERE numero = $2
      RETURNING *
    `, [cerrada, numero]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    res.json({ mensaje: `Jornada ${cerrada ? 'cerrada' : 'abierta'}`, jornada: result.rows[0] });
  } catch (error) {
    console.error('Error cambiando estado de jornada:', error);
    res.status(500).json({ error: 'Error cambiando estado de jornada' });
  }
});

// Activar/Desactivar jornada
router.patch('/jornadas/:numero', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { numero } = req.params;
    const { activa } = req.body;

    // Primero intentar actualizar
    let result = await pool.query(`
      UPDATE libertadores_jornadas 
      SET activa = $1 
      WHERE numero = $2
      RETURNING *
    `, [activa, numero]);

    // Si no existe, crearla
    if (result.rows.length === 0) {
      const nombreJornada = numero <= 6 ? `Fecha ${numero} (Grupos)` : 
                           numero === 7 ? 'Octavos de Final' :
                           numero === 8 ? 'Cuartos de Final' :
                           numero === 9 ? 'Semifinales' : 'Final';
      
      result = await pool.query(`
        INSERT INTO libertadores_jornadas (numero, nombre, activa, cerrada)
        VALUES ($1, $2, $3, false)
        RETURNING *
      `, [numero, nombreJornada, activa]);
    }

    res.json({ mensaje: `Jornada ${activa ? 'activada' : 'desactivada'}`, jornada: result.rows[0] });
  } catch (error) {
    console.error('Error cambiando activación de jornada:', error);
    res.status(500).json({ error: 'Error cambiando activación de jornada' });
  }
});

// ==================== GESTIÓN DE PARTIDOS ====================

// Obtener partidos de una jornada
router.get('/jornadas/:numero/partidos', async (req, res) => {
  try {
    const { numero } = req.params;
    
    const result = await pool.query(`
      SELECT p.*, j.numero as jornada_numero, j.cerrada
      FROM libertadores_partidos p
      JOIN libertadores_jornadas j ON p.jornada_id = j.id
      WHERE j.numero = $1
      ORDER BY p.fecha, p.id
    `, [numero]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo partidos:', error);
    res.status(500).json({ error: 'Error obteniendo partidos' });
  }
});

// Guardar partidos manualmente (Admin)
router.post('/jornadas/:numero/partidos', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { numero } = req.params;
    const { equipo_local, equipo_visitante, fecha_hora, bonus } = req.body;

    // Si viene un array de partidos (importación masiva)
    if (req.body.partidos) {
      const { partidos } = req.body;
      
      // Obtener ID de la jornada
      const jornadaResult = await pool.query(
        'SELECT id FROM libertadores_jornadas WHERE numero = $1',
        [numero]
      );

      if (jornadaResult.rows.length === 0) {
        return res.status(404).json({ error: 'Jornada no encontrada' });
      }

      const jornadaId = jornadaResult.rows[0].id;

      // Limpiar partidos existentes de esta jornada
      await pool.query('DELETE FROM libertadores_partidos WHERE jornada_id = $1', [jornadaId]);

      // Insertar nuevos partidos
      for (const partido of partidos) {
        await pool.query(`
          INSERT INTO libertadores_partidos 
          (jornada_id, nombre_local, nombre_visita, fecha, bonus)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          jornadaId,
          partido.equipo_local,
          partido.equipo_visitante,
          partido.fecha_hora || new Date(),
          partido.bonus || 1
        ]);
      }

      return res.json({ mensaje: 'Partidos guardados exitosamente' });
    }

    // Crear un partido individual
    const jornadaResult = await pool.query(
      'SELECT id FROM libertadores_jornadas WHERE numero = $1',
      [numero]
    );

    if (jornadaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    const jornadaId = jornadaResult.rows[0].id;

    const result = await pool.query(`
      INSERT INTO libertadores_partidos 
      (jornada_id, nombre_local, nombre_visita, fecha, bonus)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [jornadaId, equipo_local, equipo_visitante, fecha_hora, bonus || 1]);

    res.json({ mensaje: 'Partido creado exitosamente', partido: result.rows[0] });
  } catch (error) {
    console.error('Error guardando partido:', error);
    res.status(500).json({ error: 'Error guardando partido' });
  }
});

// Actualizar resultados de partidos (Admin)
router.patch('/jornadas/:numero/resultados', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { partidos } = req.body;

    for (const partido of partidos) {
      await pool.query(`
        UPDATE libertadores_partidos
        SET goles_local = $1, goles_visita = $2, bonus = $3
        WHERE id = $4
      `, [partido.goles_local, partido.goles_visita, partido.bonus || 1, partido.id]);
    }

    res.json({ mensaje: 'Resultados guardados exitosamente' });
  } catch (error) {
    console.error('Error guardando resultados:', error);
    res.status(500).json({ error: 'Error guardando resultados' });
  }
});

// Actualizar bonus de un partido (Admin)
router.patch('/partidos/:id/bonus', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { bonus } = req.body;

    if (!bonus || ![1, 2, 3].includes(Number(bonus))) {
      return res.status(400).json({ error: 'Bonus inválido. Debe ser 1, 2 o 3' });
    }

    const result = await pool.query(
      'UPDATE libertadores_partidos SET bonus = $1 WHERE id = $2 RETURNING *',
      [bonus, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Partido no encontrado' });
    }

    res.json({ mensaje: 'Bonus actualizado exitosamente', partido: result.rows[0] });
  } catch (error) {
    console.error('Error actualizando bonus:', error);
    res.status(500).json({ error: 'Error actualizando bonus' });
  }
});

// Eliminar partido (Admin)
router.delete('/partidos/:id', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM libertadores_partidos WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Partido no encontrado' });
    }

    res.json({ mensaje: 'Partido eliminado exitosamente' });
  } catch (error) {
    console.error('Error eliminando partido:', error);
    res.status(500).json({ error: 'Error eliminando partido' });
  }
});

// Eliminar todos los partidos de una jornada (Admin)
router.delete('/jornadas/:numero/partidos', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { numero } = req.params;
    
    // Obtener ID de la jornada
    const jornadaResult = await pool.query(
      'SELECT id FROM libertadores_jornadas WHERE numero = $1',
      [numero]
    );

    if (jornadaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    const jornadaId = jornadaResult.rows[0].id;
    
    // Primero borrar los pronósticos asociados a esta jornada
    await pool.query(
      'DELETE FROM libertadores_pronosticos WHERE jornada_id = $1',
      [jornadaId]
    );
    
    // Luego borrar los partidos
    const result = await pool.query(
      'DELETE FROM libertadores_partidos WHERE jornada_id = $1 RETURNING *',
      [jornadaId]
    );

    res.json({ 
      mensaje: 'Partidos y pronósticos eliminados exitosamente', 
      cantidad: result.rows.length 
    });
  } catch (error) {
    console.error('Error eliminando partidos:', error);
    res.status(500).json({ error: 'Error eliminando partidos' });
  }
});

export default router;
