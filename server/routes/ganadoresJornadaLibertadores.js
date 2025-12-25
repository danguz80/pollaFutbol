import express from 'express';
import { pool } from '../db/pool.js';
import verifyToken from '../middleware/verifyToken.js';
import checkRole from '../middleware/checkRole.js';

const router = express.Router();

// POST: Calcular y guardar ganadores de una jornada
router.post('/:jornadaNumero', verifyToken, checkRole(['admin']), async (req, res) => {
  const jornadaNumero = parseInt(req.params.jornadaNumero);
  
  try {
    // 1. Obtener todos los usuarios activos
    const usuariosResult = await pool.query(
      'SELECT id, nombre FROM usuarios WHERE activo = true ORDER BY nombre'
    );
    
    if (usuariosResult.rows.length === 0) {
      return res.status(404).json({ error: 'No hay usuarios activos' });
    }
    
    // 2. Calcular puntos de cada usuario para la jornada
    const puntosUsuarios = [];
    
    for (const usuario of usuariosResult.rows) {
      // Puntos de partidos
      const puntosPartidosResult = await pool.query(`
        SELECT COALESCE(SUM(lp.puntos), 0) as puntos_partidos
        FROM libertadores_pronosticos lp
        INNER JOIN libertadores_partidos lpart ON lp.partido_id = lpart.id
        WHERE lp.usuario_id = $1 AND lpart.jornada_numero = $2
      `, [usuario.id, jornadaNumero]);
      
      // Puntos de clasificación (equipos que avanzan)
      const puntosClasificacionResult = await pool.query(`
        SELECT COALESCE(SUM(lp.puntos_clasificacion), 0) as puntos_clasificacion
        FROM libertadores_pronosticos lp
        INNER JOIN libertadores_partidos lpart ON lp.partido_id = lpart.id
        WHERE lp.usuario_id = $1 AND lpart.jornada_numero = $2
      `, [usuario.id, jornadaNumero]);
      
      // Para jornada 10 (FINAL), también incluir puntos de campeón y subcampeón
      let puntosCampeonSubcampeon = 0;
      if (jornadaNumero === 10) {
        const puntosFinalesResult = await pool.query(`
          SELECT 
            COALESCE(SUM(puntos_campeon), 0) + COALESCE(SUM(puntos_subcampeon), 0) as puntos_finales
          FROM libertadores_predicciones_campeon
          WHERE usuario_id = $1
        `, [usuario.id]);
        
        puntosCampeonSubcampeon = puntosFinalesResult.rows[0].puntos_finales || 0;
      }
      
      const puntosPartidos = parseInt(puntosPartidosResult.rows[0].puntos_partidos || 0);
      const puntosClasificacion = parseInt(puntosClasificacionResult.rows[0].puntos_clasificacion || 0);
      const puntosTotal = puntosPartidos + puntosClasificacion + puntosCampeonSubcampeon;
      
      puntosUsuarios.push({
        usuario_id: usuario.id,
        nombre: usuario.nombre,
        puntaje: puntosTotal
      });
    }
    
    // 3. Encontrar el puntaje máximo
    const puntajeMaximo = Math.max(...puntosUsuarios.map(u => u.puntaje));
    
    // 4. Obtener todos los usuarios con el puntaje máximo (manejo de empates)
    const ganadores = puntosUsuarios.filter(u => u.puntaje === puntajeMaximo);
    
    if (ganadores.length === 0) {
      return res.status(404).json({ error: 'No se pudieron determinar ganadores' });
    }
    
    // 5. Borrar ganadores anteriores de esta jornada (si existen)
    await pool.query(
      'DELETE FROM libertadores_ganadores_jornada WHERE jornada_numero = $1',
      [jornadaNumero]
    );
    
    // 6. Guardar los nuevos ganadores
    for (const ganador of ganadores) {
      await pool.query(
        `INSERT INTO libertadores_ganadores_jornada (jornada_numero, usuario_id, puntaje)
         VALUES ($1, $2, $3)`,
        [jornadaNumero, ganador.usuario_id, ganador.puntaje]
      );
    }
    
    // 7. Retornar los ganadores
    res.json({
      jornadaNumero,
      ganadores: ganadores.map(g => ({
        nombre: g.nombre,
        puntaje: g.puntaje
      })),
      mensaje: ganadores.length === 1 
        ? `El ganador de la jornada ${jornadaNumero} es: ${ganadores[0].nombre}`
        : `Los ganadores de la jornada ${jornadaNumero} son: ${ganadores.map(g => g.nombre).join(', ')}`
    });
    
  } catch (error) {
    console.error('Error calculando ganadores:', error);
    res.status(500).json({ error: 'Error calculando ganadores de la jornada' });
  }
});

// GET: Obtener ganadores de una jornada
router.get('/:jornadaNumero', async (req, res) => {
  const jornadaNumero = parseInt(req.params.jornadaNumero);
  
  try {
    const result = await pool.query(`
      SELECT 
        lgj.jornada_numero,
        lgj.puntaje,
        lgj.fecha_calculo,
        u.id as usuario_id,
        u.nombre
      FROM libertadores_ganadores_jornada lgj
      INNER JOIN usuarios u ON lgj.usuario_id = u.id
      WHERE lgj.jornada_numero = $1
      ORDER BY u.nombre
    `, [jornadaNumero]);
    
    if (result.rows.length === 0) {
      return res.json({ ganadores: [], mensaje: null });
    }
    
    const ganadores = result.rows.map(row => ({
      nombre: row.nombre,
      puntaje: row.puntaje
    }));
    
    const mensaje = ganadores.length === 1 
      ? `El ganador de la jornada ${jornadaNumero} es: ${ganadores[0].nombre}`
      : `Los ganadores de la jornada ${jornadaNumero} son: ${ganadores.map(g => g.nombre).join(', ')}`;
    
    res.json({
      jornadaNumero,
      ganadores,
      mensaje,
      fechaCalculo: result.rows[0].fecha_calculo
    });
    
  } catch (error) {
    console.error('Error obteniendo ganadores:', error);
    res.status(500).json({ error: 'Error obteniendo ganadores de la jornada' });
  }
});

export default router;
