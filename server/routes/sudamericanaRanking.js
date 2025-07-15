import express from 'express';
import { pool } from '../db/pool.js';
import { calcularPuntajesSudamericana } from '../services/puntajesSudamericana.js';
import { basePoints } from '../utils/sudamericanaBasePoints.js';
import { basePlayers } from '../utils/sudamericanaBasePlayers.js';
import { reemplazarSiglasPorNombres, calcularAvanceSiglas } from '../utils/sudamericanaSiglas.js';

const router = express.Router();

// GET /api/sudamericana/ranking
router.get('/ranking', async (req, res) => {
  try {
    // Obtener todos los usuarios con pronósticos en Sudamericana
    const usuariosRes = await pool.query(
      `SELECT DISTINCT u.id as usuario_id, u.nombre as nombre_usuario, u.foto_perfil
       FROM pronosticos_sudamericana p
       JOIN usuarios u ON p.usuario_id = u.id`
    );
    const usuarios = usuariosRes.rows;
    // Obtener fixture y resultados
    const fixtureRes = await pool.query('SELECT * FROM sudamericana_fixtures');
    const fixture = fixtureRes.rows;
    // Obtener todos los pronósticos
    const pronosRes = await pool.query('SELECT * FROM pronosticos_sudamericana');
    const pronos = pronosRes.rows;
    // Obtener resultados oficiales (de fixture)
    const resultados = fixture.map(f => ({
      fixture_id: f.fixture_id,
      goles_local: f.goles_local,
      goles_visita: f.goles_visita,
      ganador: f.ganador,
      equipo_local: f.equipo_local,
      equipo_visita: f.equipo_visita,
      ronda: f.ronda,
      bonus: f.bonus
    }));
    // Obtener fotos de perfil de todos los jugadores base
    const fotosRes = await pool.query(
      `SELECT nombre, foto_perfil, id as usuario_id FROM usuarios WHERE upper(nombre) = ANY($1)`,
      [basePlayers.map(j => j.nombre.toUpperCase())]
    );
    const fotosMap = Object.fromEntries(fotosRes.rows.map(f => [f.nombre.toUpperCase(), f]));
    
    // === NUEVO: Función para crear diccionario desde clasif_sud_pron ===
    function crearDiccionarioDesdeClasificados(clasificadosUsuario) {
      const dic = {};
      
      // Mapear clasificados por ronda hacia siglas predefinidas
      if (clasificadosUsuario['Cuartos de Final']) {
        const cuartos = clasificadosUsuario['Cuartos de Final'];
        if (cuartos[0]) dic['WC1'] = cuartos[0];
        if (cuartos[1]) dic['WC2'] = cuartos[1];
        if (cuartos[2]) dic['WC3'] = cuartos[2];
        if (cuartos[3]) dic['WC4'] = cuartos[3];
      }
      
      if (clasificadosUsuario['Semifinales']) {
        const semis = clasificadosUsuario['Semifinales'];
        if (semis[0]) dic['WS1'] = semis[0];
        if (semis[1]) dic['WS2'] = semis[1];
      }
      
      if (clasificadosUsuario['Final']) {
        const final = clasificadosUsuario['Final'];
        // El ganador de la final es el campeón
        if (final[0]) dic['CHAMPION'] = final[0];
      }
      
      return dic;
    }
    
    // Diccionario de siglas usando resultados oficiales (para mostrar estado real)
    const dicSiglasOficiales = calcularAvanceSiglas(fixture, []);
    // === FIN NUEVO ===
    
    // Obtener todos los pronósticos de clasificados una vez
    const allPronClasifRes = await pool.query('SELECT usuario_id, ronda, clasificados FROM clasif_sud_pron');
    const pronClasifMap = {};
    for (const row of allPronClasifRes.rows) {
      if (!pronClasifMap[row.usuario_id]) pronClasifMap[row.usuario_id] = {};
      if (!pronClasifMap[row.usuario_id][row.ronda]) pronClasifMap[row.usuario_id][row.ronda] = [];
      if (row.clasificados && row.clasificados.trim()) {
        pronClasifMap[row.usuario_id][row.ronda].push(row.clasificados.trim());
      }
    }

    // Obtener clasificados reales una vez
    const realClasifRes = await pool.query('SELECT ronda, clasificados FROM clasif_sud');
    const realMap = {};
    for (const row of realClasifRes.rows) {
      if (!realMap[row.ronda]) realMap[row.ronda] = [];
      if (row.clasificados && row.clasificados.trim()) {
        realMap[row.ronda].push(row.clasificados.trim());
      }
    }

    const puntosPorRonda = {
      'Knockout Round Play-offs': 2,
      'Octavos de Final': 3,
      'Cuartos de Final': 3,
      'Semifinales': 5,
      'Final': 0 // especial
    };

    // Mapear todos los jugadores base, aunque no tengan pronósticos
    const ranking = basePlayers.map(j => {
      const nombreKey = j.nombre.toUpperCase();
      const user = usuarios.find(u => (u.nombre_usuario || '').toUpperCase() === nombreKey);
      const foto = fotosMap[nombreKey]?.foto_perfil || null;
      const usuario_id = fotosMap[nombreKey]?.usuario_id || (user && user.usuario_id) || null;
      const base = basePoints[nombreKey] || 0;
      
      // === NUEVO: Usar diccionario específico para cada usuario desde clasif_sud_pron ===
      let fixtureConNombres, pronosUsuario;
      
      if (user) {
        // Crear diccionario de siglas del usuario desde sus clasificados guardados
        const clasificadosUsuario = pronClasifMap[user.usuario_id] || {};
        const dicSiglasUsuario = crearDiccionarioDesdeClasificados(clasificadosUsuario);
        
        // Reemplazar siglas usando el diccionario del usuario
        fixtureConNombres = reemplazarSiglasPorNombres(fixture, dicSiglasUsuario);
        pronosUsuario = pronos.filter(p => p.usuario_id === user.usuario_id);
        pronosUsuario = reemplazarSiglasPorNombres(pronosUsuario, dicSiglasUsuario);
      } else {
        // Si no hay usuario, usar fixture original sin reemplazos
        fixtureConNombres = fixture;
        pronosUsuario = [];
      }
      // === FIN NUEVO ===
      
      // Calcular puntos de partidos
      const puntosPartidos = user ? (calcularPuntajesSudamericana(fixtureConNombres, pronosUsuario, resultados, user.usuario_id).total) : 0;
      
      // Calcular puntos de clasificados
      let puntosClasificados = 0;
      if (user) {
        const pronMap = pronClasifMap[user.usuario_id] || {};

        // Calcular puntos por ronda de clasificados
        const rondas = ['Knockout Round Play-offs', 'Octavos de Final', 'Cuartos de Final', 'Semifinales', 'Final'];
        for (const ronda of rondas) {
          const misClasificados = pronMap[ronda] || [];
          const reales = realMap[ronda] || [];

          if (ronda === 'Final') {
            // Campeón y subcampeón
            if (misClasificados[0] && reales[0] && misClasificados[0] === reales[0]) {
              puntosClasificados += 15; // campeón
            }
            if (misClasificados[1] && reales[1] && misClasificados[1] === reales[1]) {
              puntosClasificados += 10; // subcampeón
            }
          } else {
            // Rondas normales
            const puntajePorAcierto = puntosPorRonda[ronda] || 0;
            for (const miEquipo of misClasificados) {
              if (reales.includes(miEquipo)) {
                puntosClasificados += puntajePorAcierto;
              }
            }
          }
        }
      }
      
      const puntos_sudamericana = puntosPartidos + puntosClasificados;
      return {
        usuario_id,
        nombre_usuario: j.nombre,
        foto_perfil: foto,
        total: base + puntos_sudamericana,
        base,
        puntos_sudamericana
      };
    });
    // Ordenar por puntaje descendente y nombre ascendente
    ranking.sort((a, b) => b.total - a.total || a.nombre_usuario.localeCompare(b.nombre_usuario));
    res.json(ranking);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
