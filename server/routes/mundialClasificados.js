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

export default router;
