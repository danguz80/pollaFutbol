import express from 'express';
import { pool } from '../db/pool.js';
import { calcularPuntajesSudamericana } from '../services/puntajesSudamericana.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';
import { calcularAvanceSiglas } from '../utils/sudamericanaSiglas.js';

const router = express.Router();

router.post('/guardar-clasificados', verifyToken, async function guardarClasificados(req, res) {
  // Espera body: { clasificadosPorRonda: { "ronda1": ["equipo1", "equipo2"], "ronda2": [...] } }
  // O formato legacy: { ronda: string, clasificados: array }
  // Debe incluir diccionarioSiglas para la correspondencia equipo -> sigla
  const { clasificadosPorRonda, ronda, clasificados, diccionarioSiglas } = req.body;
  const usuarioId = req.usuario.id;
  
  try {
    // Soporte para formato nuevo (todas las rondas de una vez)
    if (clasificadosPorRonda && typeof clasificadosPorRonda === 'object') {
      // TRANSACCIÓN: eliminar todos los pronósticos del usuario y insertar los nuevos
      await pool.query('BEGIN');
      
      try {
        // Eliminar TODOS los pronósticos existentes del usuario
        await pool.query(
          'DELETE FROM clasif_sud_pron WHERE usuario_id = $1',
          [usuarioId]
        );

        console.log(`✅ [GUARDAR CLASIFICADOS] Procesando para usuario ${usuarioId}`);

        let totalInsertados = 0;
        
        // Debug: Mostrar diccionario de siglas recibido
        if (diccionarioSiglas) {
          console.log('📘 [GUARDAR CLASIFICADOS] Diccionario de siglas recibido:', diccionarioSiglas);
        } else {
          console.log('⚠️ [GUARDAR CLASIFICADOS] No se recibió diccionario de siglas');
        }
        
        // Insertar todos los clasificados por ronda
        for (const [rondaNombre, equipos] of Object.entries(clasificadosPorRonda)) {
          if (Array.isArray(equipos)) {
            console.log(`📘 [GUARDAR CLASIFICADOS] Procesando ronda ${rondaNombre} con ${equipos.length} equipos`);
            
            for (const equipo of equipos) {
              if (equipo && equipo.trim()) {
                // Buscar sigla correspondiente en el diccionario
                let siglaEquipo = null;
                
                // Siempre calcular el diccionario de siglas localmente para garantizar que sea completo
                console.log(`🔄 [GUARDAR CLASIFICADOS] Calculando siglas para el usuario ${usuarioId}...`);
                let dicSiglasActualizado = {};
                
                try {
                  // Obtener fixture y pronósticos para determinar siglas
                  const fixtureRes = await pool.query('SELECT * FROM sudamericana_fixtures');
                  const pronosRes = await pool.query('SELECT * FROM pronosticos_sudamericana WHERE usuario_id = $1', [usuarioId]);
                  
                  // Calcular el avance de siglas para encontrar la sigla correspondiente
                  dicSiglasActualizado = calcularAvanceSiglas(fixtureRes.rows, pronosRes.rows);
                  
                  // También verificar el diccionario que vino del frontend
                  if (diccionarioSiglas && Object.keys(diccionarioSiglas).length > 0) {
                    console.log(`✅ [GUARDAR CLASIFICADOS] Combinando con siglas recibidas del frontend`);
                    dicSiglasActualizado = { ...dicSiglasActualizado, ...diccionarioSiglas };
                  }
                  
                  console.log(`✅ [GUARDAR CLASIFICADOS] Siglas finales:`, dicSiglasActualizado);
                } catch (error) {
                  console.error(`❌ [ERROR] Error calculando siglas: ${error.message}`);
                  // Usar el diccionario del frontend como fallback
                  dicSiglasActualizado = diccionarioSiglas || {};
                }
                
                // Buscar sigla para este equipo
                Object.entries(dicSiglasActualizado).forEach(([sigla, nombre]) => {
                  if (nombre === equipo.trim()) {
                    siglaEquipo = sigla;
                    console.log(`✅ [GUARDAR CLASIFICADOS] Encontrada sigla ${sigla} para equipo ${equipo.trim()}`);
                  }
                });
                
                // Caso especial para la Final: asignar siempre Campeón y Subcampeón
                if (rondaNombre === 'Final') {
                  const idx = equipos.indexOf(equipo);
                  if (idx === 0) {
                    siglaEquipo = 'Campeón';
                    console.log(`✅ [GUARDAR CLASIFICADOS] Asignando sigla Campeón para ${equipo.trim()}`);
                  } else if (idx === 1) {
                    siglaEquipo = 'Subcampeón';
                    console.log(`✅ [GUARDAR CLASIFICADOS] Asignando sigla Subcampeón para ${equipo.trim()}`);
                  }
                } 
                // Si todavía no tiene sigla y no es la final, intentar generarla
                else if (!siglaEquipo) {
                  // Asignar siglas basadas en la ronda
                  if (rondaNombre === 'Octavos de Final') {
                    // Buscar el índice en la lista y asignar WO.A, WO.B, etc.
                    const letras = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
                    const idx = equipos.indexOf(equipo);
                    if (idx >= 0 && idx < letras.length) {
                      siglaEquipo = `WO.${letras[idx]}`;
                      console.log(`🔄 [GUARDAR CLASIFICADOS] Generando sigla ${siglaEquipo} para ${equipo.trim()}`);
                    }
                  } else if (rondaNombre === 'Cuartos de Final') {
                    // Asignar WC1, WC2, etc.
                    const idx = equipos.indexOf(equipo);
                    if (idx >= 0 && idx < 4) {
                      siglaEquipo = `WC${idx+1}`;
                      console.log(`🔄 [GUARDAR CLASIFICADOS] Generando sigla ${siglaEquipo} para ${equipo.trim()}`);
                    }
                  } else if (rondaNombre === 'Semifinales') {
                    // Asignar WS1, WS2
                    const idx = equipos.indexOf(equipo);
                    if (idx >= 0 && idx < 2) {
                      siglaEquipo = `WS${idx+1}`;
                      console.log(`🔄 [GUARDAR CLASIFICADOS] Generando sigla ${siglaEquipo} para ${equipo.trim()}`);
                    }
                  }
                }
                
                console.log(`📝 [GUARDAR CLASIFICADOS] Insertando: usuario=${usuarioId}, ronda=${rondaNombre}, equipo=${equipo.trim()}, sigla=${siglaEquipo || 'NULL'}`);
                
                await pool.query(
                  `INSERT INTO clasif_sud_pron (usuario_id, ronda, clasificados, sigla)
                   VALUES ($1, $2, $3, $4)`,
                  [usuarioId, rondaNombre, equipo.trim(), siglaEquipo]
                );
                totalInsertados++;
              }
            }
          }
        }

        await pool.query('COMMIT');
        
        res.json({ 
          ok: true, 
          message: `${totalInsertados} clasificados guardados para todas las rondas`, 
          totalInsertados
        });
      } catch (err) {
        await pool.query('ROLLBACK');
        throw err;
      }
      
    } else if (ronda && Array.isArray(clasificados)) {
      // Formato legacy (una ronda a la vez) - mantener compatibilidad
      if (!ronda || !Array.isArray(clasificados)) {
        res.status(400).json({ error: 'Faltan datos: ronda o clasificados' });
        return;
      }
      
      // Eliminar los pronósticos existentes para esta ronda y usuario
      await pool.query(
        'DELETE FROM clasif_sud_pron WHERE usuario_id = $1 AND ronda = $2',
        [usuarioId, ronda]
      );

      // Insertar cada equipo clasificado como una fila separada
      for (const equipo of clasificados) {
        if (equipo && equipo.trim()) {
          // Obtener fixture y pronósticos para determinar siglas
          const fixtureRes = await pool.query('SELECT * FROM sudamericana_fixtures');
          const pronosRes = await pool.query('SELECT * FROM pronosticos_sudamericana WHERE usuario_id = $1', [usuarioId]);
          
          // Calcular el avance de siglas para encontrar la sigla correspondiente
          const dicSiglas = calcularAvanceSiglas(fixtureRes.rows, pronosRes.rows);
          console.log(`✅ [GUARDAR CLASIFICADOS] Siglas calculadas para usuario ${usuarioId}:`, dicSiglas);
          
          // Buscar la sigla correspondiente al equipo
          let siglaEquipo = null;
          Object.entries(dicSiglas || {}).forEach(([sigla, nombre]) => {
            if (nombre === equipo.trim()) {
              siglaEquipo = sigla;
              console.log(`✅ [GUARDAR CLASIFICADOS] Encontrada sigla ${sigla} para equipo ${equipo.trim()}`);
            }
          });
          
          // Para la final, usar Campeón y Subcampeón
          if (ronda === 'Final') {
            const idx = clasificados.indexOf(equipo);
            if (idx === 0) {
              siglaEquipo = 'Campeón';
              console.log(`✅ [GUARDAR CLASIFICADOS] Asignando sigla Campeón para ${equipo.trim()}`);
            }
            else if (idx === 1) {
              siglaEquipo = 'Subcampeón';
              console.log(`✅ [GUARDAR CLASIFICADOS] Asignando sigla Subcampeón para ${equipo.trim()}`);
            }
          } 
          // Si todavía no tiene sigla y no es final, intentar generar una
          else if (!siglaEquipo) {
            // Asignar siglas basadas en la ronda
            if (ronda === 'Octavos de Final') {
              // Buscar el índice en la lista y asignar WO.A, WO.B, etc.
              const letras = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
              const idx = clasificados.indexOf(equipo);
              if (idx >= 0 && idx < letras.length) {
                siglaEquipo = `WO.${letras[idx]}`;
                console.log(`🔄 [GUARDAR CLASIFICADOS] Generando sigla ${siglaEquipo} para ${equipo.trim()}`);
              }
            } else if (ronda === 'Cuartos de Final') {
              // Asignar WC1, WC2, etc.
              const idx = clasificados.indexOf(equipo);
              if (idx >= 0 && idx < 4) {
                siglaEquipo = `WC${idx+1}`;
                console.log(`🔄 [GUARDAR CLASIFICADOS] Generando sigla ${siglaEquipo} para ${equipo.trim()}`);
              }
            } else if (ronda === 'Semifinales') {
              // Asignar WS1, WS2
              const idx = clasificados.indexOf(equipo);
              if (idx >= 0 && idx < 2) {
                siglaEquipo = `WS${idx+1}`;
                console.log(`🔄 [GUARDAR CLASIFICADOS] Generando sigla ${siglaEquipo} para ${equipo.trim()}`);
              }
            }
          }
          
          await pool.query(
            `INSERT INTO clasif_sud_pron (usuario_id, ronda, clasificados, sigla)
             VALUES ($1, $2, $3, $4)`,
            [usuarioId, ronda, equipo.trim(), siglaEquipo]
          );
        }
      }
      
      res.json({ 
        ok: true, 
        message: `${clasificados.length} clasificados guardados para ${ronda}`, 
        ronda, 
        clasificados 
      });
    } else {
      res.status(400).json({ error: 'Formato inválido: se requiere clasificadosPorRonda o (ronda + clasificados)' });
    }
    
  } catch (err) {
    console.error('Error guardando pronóstico de clasificados:', err);
    res.status(500).json({ error: 'Error guardando pronóstico de clasificados' });
  }
});

// POST /api/sudamericana/guardar-clasificados-reales (admin guarda los clasificados reales)
router.post('/guardar-clasificados-reales', verifyToken, authorizeRoles('admin'), async (req, res) => {
  // Espera body: { ronda: string, clasificados: array de nombres }
  const { ronda, clasificados } = req.body;
  if (!ronda || !Array.isArray(clasificados)) {
    return res.status(400).json({ error: 'Faltan datos: ronda o clasificados' });
  }
  
  try {
    // Eliminar clasificados existentes para esta ronda
    await pool.query(
      'DELETE FROM clasif_sud WHERE ronda = $1',
      [ronda]
    );

    // Insertar cada equipo clasificado como una fila separada
    for (const equipo of clasificados) {
      if (equipo && equipo.trim()) {
        // Buscar sigla correspondiente a este equipo
        let siglaEquipo = null;
        
        try {
          // Obtener fixture para calcular siglas
          const fixtureRes = await pool.query('SELECT * FROM sudamericana_fixtures');
          
          // Intentar obtener sigla del fixture para equipos reales
          // Buscar en clasificado -> equipo_local/equipo_visita
          for (const fixture of fixtureRes.rows) {
            if (fixture.clasificado && 
                ((fixture.equipo_local === equipo.trim()) || 
                 (fixture.equipo_visita === equipo.trim()))) {
              siglaEquipo = fixture.clasificado;
              console.log(`✅ [ADMIN CLASIFICADOS] Encontrada sigla ${siglaEquipo} para equipo ${equipo.trim()} en fixture`);
              break;
            }
          }
        } catch (error) {
          console.error(`❌ [ADMIN ERROR] Error buscando sigla en fixture: ${error.message}`);
        }
        
        // Para la final, usar Campeón y Subcampeón siempre
        if (ronda === 'Final') {
          const idx = clasificados.indexOf(equipo);
          if (idx === 0) {
            siglaEquipo = 'Campeón';
            console.log(`✅ [ADMIN CLASIFICADOS] Asignando sigla Campeón para ${equipo.trim()}`);
          }
          else if (idx === 1) {
            siglaEquipo = 'Subcampeón';
            console.log(`✅ [ADMIN CLASIFICADOS] Asignando sigla Subcampeón para ${equipo.trim()}`);
          }
        } 
        // Si todavía no tiene sigla y no es final, intentar generar una
        else if (!siglaEquipo) {
          // Asignar siglas basadas en la ronda y posición
          if (ronda === 'Octavos de Final') {
            const letras = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
            const idx = clasificados.indexOf(equipo);
            if (idx >= 0 && idx < letras.length) {
              siglaEquipo = `WO.${letras[idx]}`;
              console.log(`🔄 [ADMIN CLASIFICADOS] Generando sigla ${siglaEquipo} para ${equipo.trim()}`);
            }
          } else if (ronda === 'Cuartos de Final') {
            const idx = clasificados.indexOf(equipo);
            if (idx >= 0 && idx < 4) {
              siglaEquipo = `WC${idx+1}`;
              console.log(`🔄 [ADMIN CLASIFICADOS] Generando sigla ${siglaEquipo} para ${equipo.trim()}`);
            }
          } else if (ronda === 'Semifinales') {
            const idx = clasificados.indexOf(equipo);
            if (idx >= 0 && idx < 2) {
              siglaEquipo = `WS${idx+1}`;
              console.log(`🔄 [ADMIN CLASIFICADOS] Generando sigla ${siglaEquipo} para ${equipo.trim()}`);
            }
          }
        }
        
        await pool.query(
          `INSERT INTO clasif_sud (ronda, clasificados, sigla)
           VALUES ($1, $2, $3)`,
          [ronda, equipo.trim(), siglaEquipo]
        );
      }
    }
    
    res.json({ 
      ok: true, 
      message: `${clasificados.length} clasificados reales guardados para ${ronda}`, 
      ronda, 
      clasificados 
    });
  } catch (err) {
    console.error('Error guardando clasificados reales:', err);
    res.status(500).json({ error: 'Error guardando clasificados reales' });
  }
});

// GET /api/sudamericana/puntajes/:usuarioId
router.get('/puntajes/:usuarioId', verifyToken, async (req, res) => {
  const { usuarioId } = req.params;
  

  // Verificar que el usuarioId de la URL coincida con el usuario autenticado
  if (req.usuario.id !== parseInt(usuarioId)) {
    return res.status(403).json({ error: "No autorizado: solo puedes consultar tus propios puntajes" });
  }

  // Verificar que el usuario tenga activo_sudamericana = true
  if (!req.usuario.activo_sudamericana) {
    return res.status(403).json({ 
      error: "No tienes autorización para consultar puntajes de Sudamericana. Contacta al administrador." 
    });
  }
  try {
    // Obtener fixture (partidos)
    const fixtureRes = await pool.query('SELECT * FROM sudamericana_fixtures');
    // Obtener pronósticos del usuario
    const pronosRes = await pool.query('SELECT * FROM pronosticos_sudamericana WHERE usuario_id = $1', [usuarioId]);

    // APLICAR REEMPLAZO DE SIGLAS A LOS FIXTURES
    // Obtener clasificados de todas las rondas para mapear siglas
    const clasificadosRes = await pool.query('SELECT ronda, clasificados FROM clasif_sud');
    const clasificadosMap = {};
    for (const row of clasificadosRes.rows) {
      if (!clasificadosMap[row.ronda]) clasificadosMap[row.ronda] = [];
      clasificadosMap[row.ronda].push(row.clasificados);
    }
    
    // Crear mapeo de siglas a nombres reales basado en clasificados
    const siglaToNombre = {};
    const rondasSiglas = ['Knockout Round Play-offs', 'Octavos de Final', 'Cuartos de Final', 'Semifinales'];
    const siglas = [
      ['WP1', 'WP2', 'WP3', 'WP4', 'WP5', 'WP6', 'WP7', 'WP8'], // Play-offs
      ['WO1', 'WO2', 'WO3', 'WO4', 'WO5', 'WO6', 'WO7', 'WO8'], // Octavos
      ['WC1', 'WC2', 'WC3', 'WC4'], // Cuartos
      ['WS1', 'WS2'] // Semifinales
    ];
    
    for (let i = 0; i < rondasSiglas.length; i++) {
      const ronda = rondasSiglas[i];
      const siglasRonda = siglas[i];
      const clasificadosRonda = clasificadosMap[ronda] || [];
      
      for (let j = 0; j < siglasRonda.length && j < clasificadosRonda.length; j++) {
        siglaToNombre[siglasRonda[j]] = clasificadosRonda[j];
      }
    }
    
    // Función para reemplazar siglas en un string
    const reemplazarSiglas = (texto) => {
      if (!texto) return texto;
      let resultado = texto;
      for (const [sigla, nombre] of Object.entries(siglaToNombre)) {
        resultado = resultado.replace(sigla, nombre);
      }
      return resultado;
    };
    
    // Debug: log del mapeo de siglas para verificar

    // Obtener puntos por partidos (aplicando reemplazo de siglas)
    const resultados = fixtureRes.rows.map(f => {
      const equipoLocalOriginal = f.equipo_local;
      const equipoVisitaOriginal = f.equipo_visita;
      const equipoLocalNuevo = reemplazarSiglas(f.equipo_local);
      const equipoVisitaNuevo = reemplazarSiglas(f.equipo_visita);
      
      // Debug: log de reemplazos para semifinales
      if (f.ronda === 'Semifinales') {
      }
      
      return {
        fixture_id: f.fixture_id,
        goles_local: f.goles_local,
        goles_visita: f.goles_visita,
        ganador: f.clasificado, // CORREGIDO: usar 'clasificado' en lugar de 'ganador'
        equipo_local: equipoLocalNuevo,
        equipo_visita: equipoVisitaNuevo,
        ronda: f.ronda
      };
    });
    const puntajePartidos = calcularPuntajesSudamericana(fixtureRes.rows, pronosRes.rows, resultados);
    
    // Debug: mostrar pronósticos del usuario para semifinales
    if (usuarioId === '2') {
      const pronosticosSemi = pronosRes.rows.filter(p => {
        const fixture = fixtureRes.rows.find(f => f.fixture_id === p.fixture_id);
        return fixture && fixture.ronda === 'Semifinales';
      });
      pronosticosSemi.forEach(p => {
        console.log(`🏆 [DEBUG] Pronóstico Semi usuario ${usuarioId}: fixture_id=${p.fixture_id}, local=${p.equipo_local}, visita=${p.equipo_visita}, g_local=${p.goles_local}, g_visita=${p.goles_visita}`);
      });
    }

    // === CLASIFICADOS ===
    // 1. Obtener todas las rondas únicas
    const rondasRes = await pool.query('SELECT DISTINCT ronda FROM sudamericana_fixtures ORDER BY ronda ASC');
    const rondas = rondasRes.rows.map(r => r.ronda);

    // 2. Obtener pronósticos de clasificados del usuario (desde clasif_sud_pron)
    const pronClasifRes = await pool.query(
      'SELECT ronda, clasificados, sigla FROM clasif_sud_pron WHERE usuario_id = $1',
      [usuarioId]
    );
    const pronMap = {};
    for (const row of pronClasifRes.rows) {
      if (!pronMap[row.ronda]) pronMap[row.ronda] = [];
      if (row.clasificados && row.clasificados.trim()) {
        pronMap[row.ronda].push(row.clasificados.trim());
      }
    }

    // 3. Obtener clasificados reales (desde clasif_sud)
    const realClasifRes = await pool.query(
      'SELECT ronda, clasificados, sigla FROM clasif_sud'
    );
    const realMap = {};
    for (const row of realClasifRes.rows) {
      if (!realMap[row.ronda]) realMap[row.ronda] = [];
      if (row.clasificados && row.clasificados.trim()) {
        realMap[row.ronda].push(row.clasificados.trim());
      }
    }

    // 4. Definir puntaje por ronda
    const puntosPorRonda = {
      'Knockout Round Play-offs': 2,
      'Octavos de Final': 3,
      'Cuartos de Final': 3,
      'Semifinales': 5,
      'Final': 0 // especial, ver abajo
    };

    // 5. Calcular puntos por ronda de clasificados
    let totalClasif = 0;
    const detalleClasif = [];
    for (const ronda of rondas) {
      const misClasificados = pronMap[ronda] || [];
      const reales = realMap[ronda] || [];
      let puntos = 0;
      let aciertos = 0;

      if (ronda === 'Final') {
        // Especial: campeón y subcampeón
        if (misClasificados[0] && reales[0] && misClasificados[0] === reales[0]) {
          puntos += 15; // campeón
          aciertos++;
        }
        if (misClasificados[1] && reales[1] && misClasificados[1] === reales[1]) {
          puntos += 10; // subcampeón
          aciertos++;
        }
      } else {
        // Rondas normales: buscar coincidencias sin importar el orden
        const puntajePorAcierto = puntosPorRonda[ronda] || 0;
        for (const miEquipo of misClasificados) {
          if (reales.includes(miEquipo)) {
            aciertos++;
            puntos += puntajePorAcierto;
          }
        }
      }
      
      totalClasif += puntos;
      detalleClasif.push({
        ronda,
        misClasificados,
        clasificadosReales: reales,
        aciertos,
        puntos
      });
    }

    // Sumar total general (partidos + clasificados)
    const total = (puntajePartidos?.total || 0) + totalClasif;

    res.json({
      partidos: puntajePartidos,
      clasificados: {
        detalle: detalleClasif,
        total: totalClasif
      },
      total
    });
  } catch (error) {
    console.error('Error calculando puntajes Sudamericana:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
