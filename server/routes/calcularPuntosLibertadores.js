import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';

const router = express.Router();

// POST /api/libertadores-calcular/puntos - Calcular y asignar puntos a todos los pronósticos
router.post('/puntos', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    // Obtener reglas de puntuación
    const reglasResult = await pool.query('SELECT * FROM libertadores_puntuacion ORDER BY puntos DESC');
    const reglas = reglasResult.rows;

    // Encontrar puntos para fase de grupos (para partidos individuales)
    const puntosSigno = reglas.find(r => r.fase === 'FASE DE GRUPOS' && r.concepto.includes('Signo 1X2'))?.puntos || 1;
    const puntosDiferencia = reglas.find(r => r.fase === 'FASE DE GRUPOS' && r.concepto.includes('Diferencia de goles'))?.puntos || 3;
    const puntosExacto = reglas.find(r => r.fase === 'FASE DE GRUPOS' && r.concepto.includes('Resultado exacto'))?.puntos || 5;

    // Obtener todos los pronósticos con sus resultados reales
    const pronosticosResult = await pool.query(`
      SELECT 
        lp.id,
        lp.goles_local as pronostico_local,
        lp.goles_visita as pronostico_visita,
        p.goles_local as resultado_local,
        p.goles_visita as resultado_visita,
        lj.numero as jornada_numero
      FROM libertadores_pronosticos lp
      INNER JOIN libertadores_partidos p ON lp.partido_id = p.id
      INNER JOIN libertadores_jornadas lj ON lp.jornada_id = lj.id
      WHERE p.goles_local IS NOT NULL 
        AND p.goles_visita IS NOT NULL
        AND lj.numero <= 6
    `);

    let pronosticosActualizados = 0;
    let puntosAsignados = 0;

    // Calcular puntos para cada pronóstico
    for (const pronostico of pronosticosResult.rows) {
      const {
        id,
        pronostico_local,
        pronostico_visita,
        resultado_local,
        resultado_visita
      } = pronostico;

      let puntosGanados = 0;

      // 1. Verificar resultado exacto (mayor puntuación)
      if (pronostico_local === resultado_local && pronostico_visita === resultado_visita) {
        puntosGanados = puntosExacto;
      }
      // 2. Verificar diferencia de goles
      else if (Math.abs(pronostico_local - pronostico_visita) === Math.abs(resultado_local - resultado_visita)) {
        // Además, debe coincidir el signo (quién gana)
        const signoPronostico = getSigno(pronostico_local, pronostico_visita);
        const signoResultado = getSigno(resultado_local, resultado_visita);
        
        if (signoPronostico === signoResultado) {
          puntosGanados = puntosDiferencia;
        }
      }
      // 3. Verificar solo signo 1X2
      else {
        const signoPronostico = getSigno(pronostico_local, pronostico_visita);
        const signoResultado = getSigno(resultado_local, resultado_visita);
        
        if (signoPronostico === signoResultado) {
          puntosGanados = puntosSigno;
        }
      }

      // Actualizar puntos en la base de datos
      await pool.query(
        'UPDATE libertadores_pronosticos SET puntos = $1 WHERE id = $2',
        [puntosGanados, id]
      );

      if (puntosGanados > 0) {
        pronosticosActualizados++;
        puntosAsignados += puntosGanados;
      }
    }

    res.json({
      mensaje: 'Puntos calculados exitosamente',
      total_pronosticos: pronosticosResult.rows.length,
      pronosticos_con_puntos: pronosticosActualizados,
      puntos_totales_asignados: puntosAsignados
    });
  } catch (error) {
    console.error('Error calculando puntos:', error);
    res.status(500).json({ error: 'Error calculando puntos' });
  }
});

// Función auxiliar para determinar el signo 1X2
function getSigno(golesLocal, golesVisita) {
  if (golesLocal > golesVisita) return '1'; // Gana local
  if (golesLocal < golesVisita) return '2'; // Gana visitante
  return 'X'; // Empate
}

export default router;
