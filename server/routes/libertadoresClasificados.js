import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';
import { calcularTablaOficial, calcularTablaUsuario } from '../utils/calcularClasificadosLibertadores.js';

const router = express.Router();

// Funciones de cálculo movidas a utils/calcularClasificadosLibertadores.js

// ==================== ENDPOINTS ====================

// GET - Obtener tabla virtual del usuario actual
router.get('/tabla-usuario/:grupo', verifyToken, async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const { grupo } = req.params;
    
    // Jornadas de fase de grupos (J1-J6)
    const jornadas = [1, 2, 3, 4, 5, 6];
    
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
    const grupos = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const jornadas = [1, 2, 3, 4, 5, 6];
    
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
    const jornadasNumeros = [1, 2, 3, 4, 5, 6];
    const clasificados = [];
    const gruposCerrados = [];
    const grupos = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

    for (const grupo of grupos) {
      // Verificar si el grupo está cerrado (todos los partidos de jornadas 1-6 tienen resultado)
      const closedCheck = await pool.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN p.goles_local IS NOT NULL AND p.goles_visita IS NOT NULL THEN 1 ELSE 0 END) as con_resultado
        FROM libertadores_partidos p
        INNER JOIN libertadores_jornadas j ON p.jornada_id = j.id
        WHERE j.numero = ANY($1)
          AND EXISTS (
            SELECT 1 FROM libertadores_equipos el WHERE el.nombre = p.nombre_local AND el.grupo = $2
          )
      `, [jornadasNumeros, grupo]);

      const { total, con_resultado } = closedCheck.rows[0];
      const grupoCerrado = parseInt(total) > 0 && parseInt(total) === parseInt(con_resultado);

      if (grupoCerrado) {
        gruposCerrados.push(grupo);
      }

      // Calcular tabla oficial de cada grupo
      const tabla = await calcularTablaOficial(grupo, jornadasNumeros);

      // Top 2 clasifican a Octavos (solo si el grupo está cerrado)
      if (grupoCerrado && tabla.length >= 2) {
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

      // 3er lugar clasifica a Playoffs Sudamericana (solo si el grupo está cerrado)
      if (grupoCerrado && tabla.length >= 3) {
        clasificados.push({
          grupo,
          posicion: 3,
          equipo_nombre: tabla[2].nombre
        });
      }
    }

    res.json({ clasificados, gruposCerrados });
  } catch (error) {
    console.error('Error calculando clasificados oficiales:', error);
    res.status(500).json({ error: 'Error calculando clasificados oficiales' });
  }
});

// GET - Obtener puntos de clasificados de un usuario específico
router.get('/puntos-clasificados/:usuarioId', verifyToken, async (req, res) => {
  try {
    const { usuarioId } = req.params;
    const jornadasNumeros = [1, 2, 3, 4, 5, 6];
    const grupos = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    
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

export default router;
