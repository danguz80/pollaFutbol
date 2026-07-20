import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db/pool.js';
import { getWhatsAppService } from '../services/whatsappService.js';
import { calcularTablaOficial } from './calcularClasificadosMundial.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Genera un PDF optimizado con PDFKit para una jornada del Mundial
 * @param {number} jornadaNumero - Número de la jornada
 * @returns {Promise<string>} - Ruta del archivo PDF generado
 */
export async function generarPDFMundial(jornadaNumero) {
  try {
    console.log(`📄 Generando PDF Mundial Jornada ${jornadaNumero} con PDFKit...`);

    // 1. Obtener datos necesarios de la BD
    const [pronosticosData, rankingJornada, rankingAcumulado, ganadores, jornada, clasificadosMap] = await Promise.all([
      obtenerPronosticos(jornadaNumero),
      obtenerRankingJornada(jornadaNumero),
      obtenerRankingAcumulado(),
      obtenerGanadores(jornadaNumero),
      obtenerJornada(jornadaNumero),
      jornadaNumero === 3 ? obtenerClasificados() :
      jornadaNumero === 4 ? obtenerClasificadosKnockout(4, '8VOS') :
      jornadaNumero === 5 ? obtenerClasificadosKnockout(5, 'CUARTOS') :
      jornadaNumero === 6 ? obtenerClasificadosKnockout(6, 'SEMIFINALES') :
      jornadaNumero === 7 ? obtenerCuadroFinalJ7() :
      Promise.resolve({})
    ]);

    // 2. Crear documento PDF
    const doc = new PDFDocument({ 
      size: 'LETTER',
      margins: { top: 50, bottom: 50, left: 50, right: 50 }
    });

    // 3. Definir ruta del archivo
    const pdfDir = path.join(__dirname, '..', 'pdfs');
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }
    const pdfPath = path.join(pdfDir, `Mundial_Jornada_${jornadaNumero}.pdf`);
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    // 4. Generar contenido del PDF
    let yPos = 50;

    // Header
    yPos = agregarHeader(doc, jornada, yPos);
    
    // Ganadores
    yPos = agregarGanadores(doc, ganadores, yPos);
    
    // Ranking de Jornada
    yPos = agregarRankingJornada(doc, rankingJornada, jornadaNumero, yPos);
    
    // Ranking Acumulado
    yPos = agregarRankingAcumulado(doc, rankingAcumulado, yPos);
    
    // Pronósticos detallados por jugador
    agregarPronosticos(doc, pronosticosData, clasificadosMap, yPos, jornadaNumero);

    // 5. Finalizar documento
    doc.end();

    // 6. Esperar a que se complete la escritura
    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    console.log(`✅ PDF generado exitosamente: ${pdfPath}`);
    return pdfPath;

  } catch (error) {
    console.error('❌ Error generando PDF Mundial:', error);
    throw error;
  }
}

/**
 * Genera PDF y lo envía por email (opcional)
 */
export async function generarYEnviarPDFMundial(jornadaNumero) {
  try {
    // Generar PDF
    const pdfPath = await generarPDFMundial(jornadaNumero);
    console.log(`✅ PDF Mundial Jornada ${jornadaNumero} generado exitosamente`);

    // Intentar enviar por email usando el mismo servicio que Libertadores/Sudamericana
    try {
      const whatsappService = getWhatsAppService();
      const pdfBuffer = fs.readFileSync(pdfPath);
      const nombreArchivo = `Mundial_Jornada_${jornadaNumero}_${new Date().toISOString().split('T')[0]}.pdf`;
      
      const resultadoEmail = await whatsappService.enviarEmailConPDF(
        pdfBuffer,
        nombreArchivo,
        jornadaNumero,
        'Mundial 2026'
      );
      
      if (resultadoEmail.success) {
        console.log(`📧 ${resultadoEmail.mensaje}`);
      } else {
        console.warn(`⚠️ ${resultadoEmail.mensaje}`);
      }
    } catch (emailError) {
      console.warn('⚠️ No se pudo enviar email (continuando):', emailError.message);
      // No lanzar error, el PDF ya está generado
    }

    return pdfPath;

  } catch (error) {
    console.error('❌ Error generando PDF Mundial:', error);
    throw error;
  }
}

// ==================== FUNCIONES DE CONSULTA A BD ====================

async function obtenerJornada(jornadaNumero) {
  const result = await pool.query(
    'SELECT numero, nombre, fecha_inicio FROM mundial_jornadas WHERE numero = $1',
    [jornadaNumero]
  );
  return result.rows[0];
}

async function obtenerGanadores(jornadaNumero) {
  const result = await pool.query(`
    SELECT 
      u.nombre,
      u.foto_perfil,
      mgj.puntos,
      mgj.posicion
    FROM mundial_ganadores_jornada mgj
    INNER JOIN usuarios u ON u.id = mgj.usuario_id
    WHERE mgj.jornada_numero = $1 AND mgj.posicion = 1
    ORDER BY mgj.puntos DESC, u.nombre ASC
  `, [jornadaNumero]);
  
  return result.rows;
}

async function obtenerRankingJornada(jornadaNumero) {
  const result = await pool.query(`
    SELECT 
      u.nombre,
      u.foto_perfil,
      COALESCE(SUM(mp.puntos), 0) as puntos_jornada
    FROM usuarios u
    LEFT JOIN mundial_pronosticos mp ON u.id = mp.usuario_id
    LEFT JOIN mundial_partidos mpa ON mp.partido_id = mpa.id
    LEFT JOIN mundial_jornadas mj ON mpa.jornada_id = mj.id
    WHERE mj.numero = $1
      AND u.rol != 'admin'
    GROUP BY u.id, u.nombre, u.foto_perfil
    HAVING COALESCE(SUM(mp.puntos), 0) > 0
    ORDER BY puntos_jornada DESC, u.nombre ASC
    LIMIT 10
  `, [jornadaNumero]);
  
  return result.rows;
}

async function obtenerRankingAcumulado() {
  const result = await pool.query(`
    SELECT 
      u.nombre,
      u.foto_perfil,
      COALESCE(puntos_partidos.total, 0) +
      COALESCE(puntos_clasificacion.total, 0) +
      COALESCE(puntos_campeon.puntos, 0) as puntos_acumulados
    FROM usuarios u
    LEFT JOIN (
      SELECT mp.usuario_id, SUM(mp.puntos) as total
      FROM mundial_pronosticos mp
      GROUP BY mp.usuario_id
    ) puntos_partidos ON u.id = puntos_partidos.usuario_id
    LEFT JOIN (
      SELECT mpc.usuario_id, SUM(mpc.puntos) as total
      FROM mundial_puntos_clasificacion mpc
      GROUP BY mpc.usuario_id
    ) puntos_clasificacion ON u.id = puntos_clasificacion.usuario_id
    LEFT JOIN (
      SELECT usuario_id, puntos
      FROM mundial_predicciones_campeon
    ) puntos_campeon ON u.id = puntos_campeon.usuario_id
    WHERE u.rol != 'admin'
      AND (
        puntos_partidos.total IS NOT NULL
        OR puntos_clasificacion.total IS NOT NULL
        OR puntos_campeon.puntos IS NOT NULL
      )
    ORDER BY puntos_acumulados DESC, u.nombre ASC
    LIMIT 10
  `);
  
  return result.rows;
}

async function obtenerClasificadosKnockout(jornadaNumero, fasePrefijo) {
  const result = await pool.query(`
    SELECT mpc.usuario_id, u.nombre as nombre_usuario, u.foto_perfil,
           mpc.equipo as equipo_pronosticado, mpc.fase, mpc.puntos
    FROM mundial_puntos_clasificacion mpc
    INNER JOIN usuarios u ON mpc.usuario_id = u.id
    WHERE mpc.fase LIKE $1 AND u.rol != 'admin'
    ORDER BY u.nombre, mpc.fase
  `, [`${fasePrefijo}_%`]);

  // Mapa de partidos: partido_id → { avanzado, local, visitante }
  const matchesResult = await pool.query(`
    SELECT p.id, p.equipo_local, p.equipo_visitante,
           p.resultado_local, p.resultado_visitante, p.quien_avanzo
    FROM mundial_partidos p
    INNER JOIN mundial_jornadas mj ON p.jornada_id = mj.id
    WHERE mj.numero = $1
  `, [jornadaNumero]);

  const matchMap = {};
  matchesResult.rows.forEach(m => {
    let avanzado;
    if (m.resultado_local > m.resultado_visitante) avanzado = m.equipo_local;
    else if (m.resultado_visitante > m.resultado_local) avanzado = m.equipo_visitante;
    else avanzado = m.quien_avanzo;
    matchMap[m.id] = { avanzado, local: m.equipo_local, visitante: m.equipo_visitante };
  });

  const porUsuario = {};
  result.rows.forEach(row => {
    if (!porUsuario[row.usuario_id]) {
      porUsuario[row.usuario_id] = { nombre: row.nombre_usuario, foto_perfil: row.foto_perfil, clasificados: [] };
    }
    const matchFase = row.fase.match(new RegExp(`${fasePrefijo}_PARTIDO_(\\d+)`));
    if (matchFase) {
      const partidoId = parseInt(matchFase[1]);
      const match = matchMap[partidoId];
      porUsuario[row.usuario_id].clasificados.push({
        equipo_pronosticado: row.equipo_pronosticado,
        equipo_real: match ? match.avanzado : null,
        puntos: row.puntos,
        posLabel: match ? `${match.local} vs ${match.visitante}` : `Partido ${partidoId}`
      });
    }
  });

  Object.values(porUsuario).forEach(u => {
    u.clasificados.sort((a, b) => a.posLabel.localeCompare(b.posLabel));
    u.totalPuntos = u.clasificados.reduce((sum, c) => sum + c.puntos, 0);
  });
  return porUsuario;
}

async function obtenerCuadroFinalJ7() {
  // Brackets virtuales
  const bracketsQ = await pool.query(`
    SELECT pfv.usuario_id, u.nombre as nombre, pfv.equipo, pfv.posicion
    FROM mundial_pronosticos_final_virtual pfv INNER JOIN usuarios u ON pfv.usuario_id=u.id
    WHERE u.rol!='admin' ORDER BY u.nombre, pfv.posicion`);

  // Pts por fase
  const ptsQ = await pool.query(`SELECT usuario_id, fase, SUM(puntos) p FROM mundial_puntos_clasificacion WHERE fase LIKE 'FINAL_%' GROUP BY usuario_id, fase`);
  const ptsMap = {};
  ptsQ.rows.forEach(r => {
    if (!ptsMap[r.usuario_id]) ptsMap[r.usuario_id] = { clasificado:0, campeon:0, subcampeon:0, tercero:0, cuarto:0 };
    if (r.fase==='FINAL_CLASIFICADO') ptsMap[r.usuario_id].clasificado += parseInt(r.p);
    if (r.fase==='FINAL_CAMPEON') ptsMap[r.usuario_id].campeon += parseInt(r.p);
    if (r.fase==='FINAL_SUBCAMPEON') ptsMap[r.usuario_id].subcampeon += parseInt(r.p);
    if (r.fase==='FINAL_TERCERO') ptsMap[r.usuario_id].tercero += parseInt(r.p);
    if (r.fase==='FINAL_CUARTO') ptsMap[r.usuario_id].cuarto += parseInt(r.p);
  });

  // Partidos reales Final y 3er Lugar
  const partidosQ = await pool.query(`
    SELECT p.equipo_local, p.equipo_visitante, p.resultado_local, p.resultado_visitante, p.quien_avanzo, p.subtipo
    FROM mundial_partidos p INNER JOIN mundial_jornadas mj ON p.jornada_id=mj.id
    WHERE mj.numero=7 AND p.subtipo IN ('final','tercero_lugar')`);
  const finalReal = partidosQ.rows.find(p => p.subtipo === 'final') || null;
  const terceroReal = partidosQ.rows.find(p => p.subtipo === 'tercero_lugar') || null;
  const realFinalTeams = finalReal ? new Set([finalReal.equipo_local, finalReal.equipo_visitante]) : new Set();
  const realTerceroTeams = terceroReal ? new Set([terceroReal.equipo_local, terceroReal.equipo_visitante]) : new Set();

  const porUsuario = {};
  bracketsQ.rows.forEach(row => {
    if (!porUsuario[row.usuario_id]) porUsuario[row.usuario_id] = { nombre: row.nombre, bracket: {}, usuario_id: row.usuario_id };
    porUsuario[row.usuario_id].bracket[row.posicion] = row.equipo;
  });

  Object.values(porUsuario).forEach(u => {
    const b = u.bracket;
    const p = ptsMap[u.usuario_id] || { clasificado:0, campeon:0, subcampeon:0, tercero:0, cuarto:0 };
    u.equipo_final_1 = b[1] || null;
    u.equipo_final_2 = b[2] || null;
    u.equipo_tercero_1 = b[3] || null;
    u.equipo_tercero_2 = b[4] || null;
    u.finalCoincide = finalReal && realFinalTeams.has(b[1]) && realFinalTeams.has(b[2]);
    u.terceroCoincide = terceroReal && realTerceroTeams.has(b[3]) && realTerceroTeams.has(b[4]);
    u.pts = p;
    u.totalPuntos = p.clasificado + p.campeon + p.subcampeon + p.tercero + p.cuarto;
    u.finalReal = finalReal;
    u.terceroReal = terceroReal;
  });
  return porUsuario;
}

async function obtenerClasificados() {
  const result = await pool.query(`
    SELECT mpc.usuario_id, u.nombre as nombre_usuario, u.foto_perfil,
           mpc.equipo, mpc.fase, mpc.puntos
    FROM mundial_puntos_clasificacion mpc
    INNER JOIN usuarios u ON mpc.usuario_id = u.id
    WHERE mpc.fase LIKE '16VOS_%' AND u.rol != 'admin'
    ORDER BY u.nombre, mpc.fase
  `);

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
  const tercR = await pool.query('SELECT equipo, grupo FROM mundial_mejores_terceros');
  tercR.rows.forEach(r => { clasificadosReales[`${r.grupo}_POS3`] = r.equipo; });
  // Real 3rd of each group (for MEJOR_TERCERO display)
  for (const grupo of grupos) {
    const tablaR = await calcularTablaOficial(grupo, [1, 2, 3]);
    if (tablaR.length >= 3) clasificadosReales[`${grupo}_POS3_REAL`] = tablaR[2].nombre;
  }

  const porUsuario = {};
  result.rows.forEach(row => {
    if (!porUsuario[row.usuario_id]) {
      porUsuario[row.usuario_id] = {
        nombre: row.nombre_usuario,
        foto_perfil: row.foto_perfil,
        clasificados: []
      };
    }
    // Formato POS1/POS2
    const matchPos = row.fase.match(/16VOS_GRUPO_([A-Z]+)_POS(\d)/);
    if (matchPos) {
      const grupo = matchPos[1];
      const pos = matchPos[2];
      const posLabel = pos === '1' ? 'Clasificado #1 a 16vos'
        : pos === '2' ? 'Clasificado #2 a 16vos'
        : 'Mejor Tercero (grupo)';
      porUsuario[row.usuario_id].clasificados.push({
        grupo, posicion: parseInt(pos), posLabel,
        equipo_pronosticado: row.equipo,
        equipo_real: clasificadosReales[`${grupo}_POS${pos}`] || null,
        puntos: row.puntos
      });
      return;
    }
    // Formato MEJOR_TERCERO virtual
    const matchTercero = row.fase.match(/16VOS_MEJOR_TERCERO_GRUPO_([A-Z]+)/);
    if (matchTercero) {
      const grupo = matchTercero[1];
      porUsuario[row.usuario_id].clasificados.push({
        grupo, posicion: 3, posLabel: 'Mejor Tercero',
        equipo_pronosticado: row.equipo,
        equipo_real: clasificadosReales[`${grupo}_POS3_REAL`] || null,
        puntos: row.puntos
      });
    }
  });
  Object.values(porUsuario).forEach(u => {
    u.clasificados.sort((a, b) => a.grupo.localeCompare(b.grupo) || a.posicion - b.posicion);
    u.totalPuntos = u.clasificados.reduce((sum, c) => sum + c.puntos, 0);
  });
  return porUsuario; // keyed by usuario_id
}

async function obtenerPronosticos(jornadaNumero) {
  const result = await pool.query(`
    SELECT 
      u.id as usuario_id,
      u.nombre as usuario,
      u.foto_perfil,
      mp.resultado_local as pred_local,
      mp.resultado_visitante as pred_visita,
      mpa.equipo_local,
      mpa.equipo_visitante,
      mpa.resultado_local as real_local,
      mpa.resultado_visitante as real_visita,
      mpa.fecha,
      mpa.bonus,
      mpa.subtipo,
      mp.puntos
    FROM mundial_pronosticos mp
    INNER JOIN usuarios u ON mp.usuario_id = u.id
    INNER JOIN mundial_partidos mpa ON mp.partido_id = mpa.id
    INNER JOIN mundial_jornadas mj ON mpa.jornada_id = mj.id
    WHERE mj.numero = $1
      AND u.rol != 'admin'
    ORDER BY u.nombre, mpa.fecha, mpa.id
  `, [jornadaNumero]);
  
  // Agrupar por usuario
  const grouped = {};
  result.rows.forEach(row => {
    if (!grouped[row.usuario]) {
      grouped[row.usuario] = {
        usuario_id: row.usuario_id,
        nombre: row.usuario,
        foto_perfil: row.foto_perfil,
        pronosticos: []
      };
    }
    grouped[row.usuario].pronosticos.push({
      equipo_local: row.equipo_local,
      equipo_visitante: row.equipo_visitante,
      pred_local: row.pred_local,
      pred_visita: row.pred_visita,
      real_local: row.real_local,
      real_visita: row.real_visita,
      bonus: row.bonus,
      subtipo: row.subtipo,
      puntos: row.puntos,
      esVirtual: false
    });
  });

  // Para J7: agregar pronosticos virtuales para usuarios sin bracket coincidente
  if (jornadaNumero === 7) {
    const scoresQ = await pool.query(`
      SELECT pvf.usuario_id, pvf.tipo, pvf.resultado_local, pvf.resultado_visitante
      FROM mundial_pronosticos_virtual_final pvf
      INNER JOIN usuarios u ON u.id = pvf.usuario_id WHERE u.rol != 'admin'`);
    const scoresByUser = {};
    scoresQ.rows.forEach(r => {
      if (!scoresByUser[r.usuario_id]) scoresByUser[r.usuario_id] = {};
      scoresByUser[r.usuario_id][r.tipo] = r;
    });

    // Obtener brackets y semis para calcular equipos virtuales
    const semisQ = await pool.query(`
      SELECT mp.usuario_id, u.nombre as usuario_nombre, mp.resultado_local, mp.resultado_visitante, mp.quien_avanza,
             p.equipo_local, p.equipo_visitante
      FROM mundial_pronosticos mp
      INNER JOIN usuarios u ON mp.usuario_id = u.id
      INNER JOIN mundial_partidos p ON p.id = mp.partido_id
      INNER JOIN mundial_jornadas mj ON p.jornada_id = mj.id
      WHERE mj.numero = 7 AND p.subtipo = 'semifinal' AND u.rol != 'admin'
      ORDER BY mp.usuario_id, p.id`);

    const semisByUser = {};
    semisQ.rows.forEach(row => {
      if (!semisByUser[row.usuario_id]) semisByUser[row.usuario_id] = { nombre: row.usuario_nombre, semis: [] };
      semisByUser[row.usuario_id].semis.push(row);
    });

    // Partidos reales Final/3er
    const realesQ = await pool.query(`
      SELECT equipo_local, equipo_visitante, subtipo FROM mundial_partidos p
      INNER JOIN mundial_jornadas mj ON p.jornada_id=mj.id
      WHERE mj.numero=7 AND p.subtipo IN ('final','tercero_lugar')`);
    const finalReal = realesQ.rows.find(p => p.subtipo === 'final');
    const terceroReal = realesQ.rows.find(p => p.subtipo === 'tercero_lugar');
    const realFinalTeams = finalReal ? new Set([finalReal.equipo_local, finalReal.equipo_visitante]) : new Set();
    const realTerceroTeams = terceroReal ? new Set([terceroReal.equipo_local, terceroReal.equipo_visitante]) : new Set();

    const getWL = (rl, rv, qa, local, visita) => {
      const l = Number(rl), v = Number(rv);
      if (l > v) return { winner: local, loser: visita };
      if (v > l) return { winner: visita, loser: local };
      const w = qa || local; return { winner: w, loser: w === local ? visita : local };
    };

    // Para cada usuario con semis, si no tiene pronostico real de Final/3er, agregar virtual
    for (const [uid, data] of Object.entries(semisByUser)) {
      const userId = parseInt(uid);
      const userName = data.nombre;
      const userGroup = grouped[userName];
      if (!userGroup) continue;

      const hasRealFinal = userGroup.pronosticos.some(p => p.subtipo === 'final');
      const hasRealTercero = userGroup.pronosticos.some(p => p.subtipo === 'tercero_lugar');

      const [semi1, semi2] = data.semis.sort((a,b) => a.usuario_id - b.usuario_id);
      if (!semi1 || !semi2) continue;
      const r1 = getWL(semi1.resultado_local, semi1.resultado_visitante, semi1.quien_avanza, semi1.equipo_local, semi1.equipo_visitante);
      const r2 = getWL(semi2.resultado_local, semi2.resultado_visitante, semi2.quien_avanza, semi2.equipo_local, semi2.equipo_visitante);

      const userScores = scoresByUser[userId] || {};

      if (!hasRealFinal) {
        const score = userScores['final'];
        const coincide = finalReal && realFinalTeams.has(r1.winner) && realFinalTeams.has(r2.winner);
        userGroup.pronosticos.push({
          equipo_local: r1.winner, equipo_visitante: r2.winner,
          pred_local: score?.resultado_local ?? null, pred_visita: score?.resultado_visitante ?? null,
          real_local: null, real_visita: null,
          bonus: 2, subtipo: 'final_virtual', puntos: null,
          esVirtual: true, coincide
        });
      }
      if (!hasRealTercero) {
        const score = userScores['tercero_lugar'];
        const coincide = terceroReal && realTerceroTeams.has(r1.loser) && realTerceroTeams.has(r2.loser);
        userGroup.pronosticos.push({
          equipo_local: r1.loser, equipo_visitante: r2.loser,
          pred_local: score?.resultado_local ?? null, pred_visita: score?.resultado_visitante ?? null,
          real_local: null, real_visita: null,
          bonus: 1, subtipo: 'tercero_virtual', puntos: null,
          esVirtual: true, coincide
        });
      }
    }
  }
  
  return Object.values(grouped);
}

// ==================== FUNCIONES DE DIBUJO EN PDF ====================

function agregarHeader(doc, jornada, yPos) {
  // Título principal
  doc.fontSize(24)
     .font('Helvetica-Bold')
     .fillColor('#1a5490')
     .text('MUNDIAL 2026', 50, yPos, { align: 'center', width: 512, lineBreak: false });
  
  yPos += 35;
  
  // Jornada
  doc.fontSize(18)
     .fillColor('#333333')
     .text(`${jornada.nombre}`, 50, yPos, { align: 'center', width: 512, lineBreak: false });
  
  yPos += 30;
  
  // Línea separadora
  doc.moveTo(50, yPos)
     .lineTo(562, yPos)
     .strokeColor('#1a5490')
     .lineWidth(2)
     .stroke();
  
  return yPos + 25;
}

function agregarGanadores(doc, ganadores, yPos) {
  if (!ganadores || ganadores.length === 0) {
    return yPos;
  }

  // Título
  doc.fontSize(16)
     .font('Helvetica-Bold')
     .fillColor('#DAA520')
     .text('*** GANADORES DE LA JORNADA ***', 50, yPos, { lineBreak: false });
  
  yPos += 30;

  // Box para ganadores
  const boxHeight = 40 * ganadores.length + 20;
  doc.rect(50, yPos, 512, boxHeight)
     .fillAndStroke('#FFF8DC', '#DAA520');
  
  yPos += 15;

  ganadores.forEach((ganador, index) => {
    // Intentar agregar foto si existe
    let fotoPath = null;
    
    if (ganador.foto_perfil) {
      const relativePath = ganador.foto_perfil.startsWith('/') 
        ? ganador.foto_perfil.substring(1) 
        : ganador.foto_perfil;
      fotoPath = path.join(__dirname, '..', '..', 'client', 'public', relativePath);
    }
    
    // Si no existe la foto del usuario, usar default
    if (!fotoPath || !fs.existsSync(fotoPath)) {
      fotoPath = path.join(__dirname, '..', '..', 'client', 'public', 'perfil', 'default.png');
    }
    
    // Agregar foto circular
    if (fs.existsSync(fotoPath)) {
      try {
        doc.save();
        doc.circle(77.5, yPos + 12.5, 12.5).clip();
        doc.image(fotoPath, 65, yPos, { width: 25, height: 25 });
        doc.restore();
      } catch (err) {
        console.log('Error cargando foto:', err.message);
      }
    }

    // Texto del ganador
    doc.fontSize(14)
       .font('Helvetica-Bold')
       .fillColor('#000000')
       .text(`${index + 1}`, 100, yPos + 7, { width: 20, lineBreak: false });
    
    doc.fontSize(13)
       .font('Helvetica')
       .text(ganador.nombre, 130, yPos + 7, { width: 280, lineBreak: false });
    
    doc.fontSize(13)
       .font('Helvetica-Bold')
       .fillColor('#DAA520')
       .text(`${ganador.puntos} puntos`, 420, yPos + 7, { width: 130, align: 'right', lineBreak: false });
    
    yPos += 38;
  });
  
  return yPos + 25;
}

function agregarRankingJornada(doc, ranking, jornadaNumero, yPos) {
  // Verificar si hay espacio, si no, nueva página
  if (yPos > 650) {
    doc.addPage();
    yPos = 50;
  }

  // Headers de tabla con título integrado
  doc.rect(50, yPos, 512, 20).fill('#ab402e');
  
  doc.fontSize(12)
     .font('Helvetica-Bold')
     .fillColor('#FFFFFF')
     .text(`RANKING JORNADA ${jornadaNumero}`, 50, yPos + 5, { width: 512, align: 'center', lineBreak: false });
  
  yPos += 20;
  
  // Sub-headers
  doc.fontSize(11)
     .font('Helvetica-Bold')
     .fillColor('#FFFFFF');
  
  doc.rect(50, yPos, 50, 15).fill('#ab402e');
  doc.text('Pos', 55, yPos + 2, { width: 40, align: 'center', lineBreak: false });
  
  doc.rect(100, yPos, 362, 15).fill('#ab402e');
  doc.text('Jugador', 105, yPos + 2, { width: 350, lineBreak: false });
  
  doc.rect(462, yPos, 100, 15).fill('#ab402e');
  doc.text('Puntos', 467, yPos + 2, { width: 90, align: 'center', lineBreak: false });
  
  yPos += 15;

  // Filas de datos
  ranking.slice(0, 10).forEach((jugador, index) => {
    // Verificar salto de página antes de dibujar cada fila
    if (yPos + 30 > 742) {
      doc.addPage();
      yPos = 50;
    }

    const bgColor = index === 0 ? '#ffcccb' : index === 1 ? '#c8e6c9' : index === 2 ? '#d4edda' : '#FFFFFF';
    
    doc.rect(50, yPos, 512, 30).fill(bgColor).stroke('#CCCCCC');
    
    // Posición
    doc.fontSize(13)
       .font('Helvetica-Bold')
       .fillColor('#000000')
       .text(`${index + 1}`, 55, yPos + 10, { width: 40, align: 'center', lineBreak: false });
    
    // Foto de perfil circular
    if (jugador.foto_perfil) {
      const relativePath = jugador.foto_perfil.startsWith('/') 
        ? jugador.foto_perfil.substring(1) 
        : jugador.foto_perfil;
      const fotoPath = path.join(__dirname, '..', '..', 'client', 'public', relativePath);
      
      if (fs.existsSync(fotoPath)) {
        try {
          doc.save();
          doc.circle(115, yPos + 15, 10).clip();
          doc.image(fotoPath, 105, yPos + 5, { width: 20, height: 20 });
          doc.restore();
        } catch (err) {
          console.log('Error foto:', err.message);
        }
      }
    }
    
    // Nombre
    doc.fontSize(13)
       .font('Helvetica-Bold')
       .fillColor('#000000')
       .text(jugador.nombre, 130, yPos + 10, { width: 320, lineBreak: false });
    
    // Puntos
    doc.fontSize(13)
       .font('Helvetica-Bold')
       .text(jugador.puntos_jornada.toString(), 467, yPos + 10, { width: 90, align: 'center', lineBreak: false });
    
    yPos += 30;
  });
  
  return yPos + 15;
}

function agregarRankingAcumulado(doc, ranking, yPos) {
  // Verificar si hay espacio, si no, nueva página
  if (yPos > 650) {
    doc.addPage();
    yPos = 50;
  }

  // Headers de tabla con título integrado
  doc.rect(50, yPos, 512, 20).fill('#4c929c');
  
  doc.fontSize(12)
     .font('Helvetica-Bold')
     .fillColor('#FFFFFF')
     .text('RANKING ACUMULADO', 50, yPos + 5, { width: 512, align: 'center', lineBreak: false });
  
  yPos += 20;
  
  // Sub-headers
  doc.fontSize(11)
     .font('Helvetica-Bold')
     .fillColor('#FFFFFF');
  
  doc.rect(50, yPos, 50, 15).fill('#4c929c');
  doc.text('Pos', 55, yPos + 2, { width: 40, align: 'center', lineBreak: false });
  
  doc.rect(100, yPos, 362, 15).fill('#4c929c');
  doc.text('Jugador', 105, yPos + 2, { width: 350, lineBreak: false });
  
  doc.rect(462, yPos, 100, 15).fill('#4c929c');
  doc.text('Puntos', 467, yPos + 2, { width: 90, align: 'center', lineBreak: false });
  
  yPos += 15;

  // Filas de datos
  ranking.slice(0, 10).forEach((jugador, index) => {
    // Verificar salto de página antes de dibujar cada fila
    if (yPos + 30 > 742) {
      doc.addPage();
      yPos = 50;
    }

    const bgColor = index === 0 ? '#fff8dc' : index === 1 ? '#d0e8ea' : index === 2 ? '#dff0f1' : '#FFFFFF';
    
    doc.rect(50, yPos, 512, 30).fill(bgColor).stroke('#CCCCCC');
    
    // Posición
    doc.fontSize(13)
       .font('Helvetica-Bold')
       .fillColor('#000000')
       .text(`${index + 1}`, 55, yPos + 10, { width: 40, align: 'center', lineBreak: false });
    
    // Foto de perfil circular
    if (jugador.foto_perfil) {
      const relativePath = jugador.foto_perfil.startsWith('/') 
        ? jugador.foto_perfil.substring(1) 
        : jugador.foto_perfil;
      const fotoPath = path.join(__dirname, '..', '..', 'client', 'public', relativePath);
      
      if (fs.existsSync(fotoPath)) {
        try {
          doc.save();
          doc.circle(115, yPos + 15, 10).clip();
          doc.image(fotoPath, 105, yPos + 5, { width: 20, height: 20 });
          doc.restore();
        } catch (err) {
          console.log('Error foto:', err.message);
        }
      }
    }
    
    // Nombre
    doc.fontSize(13)
       .font('Helvetica-Bold')
       .fillColor('#000000')
       .text(jugador.nombre, 130, yPos + 10, { width: 320, lineBreak: false });
    
    // Puntos
    doc.fontSize(13)
       .font('Helvetica-Bold')
       .text(jugador.puntos_acumulados.toString(), 467, yPos + 10, { width: 90, align: 'center', lineBreak: false });
    
    yPos += 30;
  });
  
  return yPos + 20;
}

function agregarPronosticos(doc, pronosticosData, clasificadosMap, yPos, jornadaNumero) {
  pronosticosData.forEach((usuario, usuarioIndex) => {
    // Nueva página para cada usuario
    doc.addPage();
    yPos = 50;

    // Calcular total de puntos
    const totalPuntos = usuario.pronosticos.reduce((sum, p) => sum + (p.puntos || 0), 0);
    const clasifData = clasificadosMap[usuario.usuario_id];
    const totalClasif = clasifData ? clasifData.totalPuntos : 0;
    const totalGeneral = totalPuntos + totalClasif;

    // Header de usuario (reducido a 28px)
    doc.rect(50, yPos, 512, 28).fill('#1a5490');
    
    // Foto del usuario circular (más pequeña)
    if (usuario.foto_perfil) {
      const relativePath = usuario.foto_perfil.startsWith('/') 
        ? usuario.foto_perfil.substring(1) 
        : usuario.foto_perfil;
      const fotoPath = path.join(__dirname, '..', '..', 'client', 'public', relativePath);
      
      if (fs.existsSync(fotoPath)) {
        try {
          doc.save();
          doc.circle(65, yPos + 14, 10).clip();
          doc.image(fotoPath, 55, yPos + 4, { width: 20, height: 20 });
          doc.restore();
        } catch (err) {}
      }
    }
    
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .fillColor('#FFFFFF')
       .text(usuario.nombre, 80, yPos + 10, { width: 280, lineBreak: false });
    
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .fillColor('#FFD700')
       .text(`Total jornada: ${totalPuntos} pts`, 360, yPos + 10, { width: 190, align: 'right', lineBreak: false });
    
    yPos += 32;

    // Headers de tabla (reducido a 16px)
    // Dibujar rectángulos primero
    doc.rect(50, yPos, 200, 16).fill('#e0e0e0').stroke('#999999');
    doc.rect(250, yPos, 70, 16).fill('#e0e0e0').stroke('#999999');
    doc.rect(320, yPos, 70, 16).fill('#e0e0e0').stroke('#999999');
    doc.rect(390, yPos, 50, 16).fill('#e0e0e0').stroke('#999999');
    doc.rect(440, yPos, 122, 16).fill('#e0e0e0').stroke('#999999');
    
    // Ahora agregar los textos encima
    doc.fontSize(9)
       .font('Helvetica-Bold')
       .fillColor('#000000');
    
    doc.text('Equipos', 55, yPos + 4, { width: 190, lineBreak: false });
    doc.text('Pronóstico', 255, yPos + 4, { width: 60, align: 'center', lineBreak: false });
    doc.text('Resultado Real', 325, yPos + 4, { width: 60, align: 'center', lineBreak: false });
    doc.text('Bonus', 395, yPos + 4, { width: 40, align: 'center', lineBreak: false });
    doc.text('Puntos', 445, yPos + 4, { width: 110, align: 'center', lineBreak: false });
    
    yPos += 16;

    // Filas de pronósticos (reducido a 22px)
    usuario.pronosticos.forEach((pron) => {
      const esVirtual = pron.esVirtual === true;
      const tieneResultado = pron.real_local !== null && pron.real_visita !== null;
      const puntos = pron.puntos || 0;

      let bgColor;
      if (esVirtual) {
        bgColor = pron.coincide ? '#fff8dc' : '#f8d7da';
      } else {
        bgColor = tieneResultado ? (puntos > 0 ? '#d4edda' : '#f8d7da') : '#f8f9fa';
      }

      // Borde izquierdo de color para virtuales
      if (esVirtual) {
        const borderColor = pron.subtipo === 'final_virtual' ? '#ffd700' : '#cd7f32';
        doc.rect(50, yPos, 4, 22).fill(borderColor);
        doc.rect(54, yPos, 508, 22).fill(bgColor);
        doc.rect(50, yPos, 512, 22).strokeColor('#d0d0d0').lineWidth(0.5).stroke();
      } else {
        doc.rect(50, yPos, 512, 22).fill(bgColor);
        doc.rect(50, yPos, 512, 22).strokeColor('#d0d0d0').lineWidth(0.5).stroke();
      }

      // Nombre del partido
      let partidoLabel = `${pron.equipo_local} vs ${pron.equipo_visitante}`;
      if (pron.subtipo === 'final_virtual') partidoLabel = `FINAL (virtual): ${pron.equipo_local} vs ${pron.equipo_visitante}`;
      else if (pron.subtipo === 'tercero_virtual') partidoLabel = `3er Lugar (virtual): ${pron.equipo_local} vs ${pron.equipo_visitante}`;
      else if (pron.subtipo === 'final') partidoLabel = `FINAL: ${pron.equipo_local} vs ${pron.equipo_visitante}`;
      else if (pron.subtipo === 'tercero_lugar') partidoLabel = `3er Lugar: ${pron.equipo_local} vs ${pron.equipo_visitante}`;

      doc.fontSize(esVirtual ? 8 : 9).font('Helvetica-Bold').fillColor('#000000')
         .text(partidoLabel, 58, yPos + 7, { width: 188, lineBreak: false });

      // Pronóstico
      if (pron.pred_local !== null && pron.pred_visita !== null) {
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000')
           .text(`${pron.pred_local} - ${pron.pred_visita}`, 255, yPos + 7, { width: 60, align: 'center', lineBreak: false });
      } else {
        doc.fontSize(8).fillColor('#999999')
           .text('—', 255, yPos + 7, { width: 60, align: 'center', lineBreak: false });
      }

      // Resultado real
      if (esVirtual) {
        const badge = pron.coincide ? '✓ Coincide' : '✗ No coincide';
        doc.fontSize(7).font('Helvetica-Bold').fillColor(pron.coincide ? '#28a745' : '#dc3545')
           .text(badge, 325, yPos + 7, { width: 60, align: 'center', lineBreak: false });
      } else if (tieneResultado) {
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000')
           .text(`${pron.real_local} - ${pron.real_visita}`, 325, yPos + 7, { width: 60, align: 'center', lineBreak: false });
      } else {
        doc.fontSize(9).fillColor('#999999')
           .text('Pendiente', 325, yPos + 7, { width: 60, align: 'center', lineBreak: false });
      }

      const bonusText = pron.bonus > 1 ? `x${pron.bonus}` : '-';
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#ff6b00')
         .text(bonusText, 395, yPos + 7, { width: 40, align: 'center', lineBreak: false });

      if (esVirtual) {
        doc.fontSize(9).fillColor(pron.coincide ? '#999999' : '#dc3545')
           .text(pron.coincide ? '—' : '0', 445, yPos + 7, { width: 110, align: 'center', lineBreak: false });
      } else if (tieneResultado) {
        doc.fontSize(11).font('Helvetica-Bold').fillColor(puntos > 0 ? '#28a745' : '#dc3545')
           .text(`${puntos} pts`, 445, yPos + 7, { width: 110, align: 'center', lineBreak: false });
      } else {
        doc.fontSize(9).fillColor('#999999')
           .text('-', 445, yPos + 7, { width: 110, align: 'center', lineBreak: false });
      }

      yPos += 22;
    });

      // ==================== TABLA CUADRO FINAL DETALLADA (J7) ====================
      if (jornadaNumero === 7 && clasifData) {
        if (yPos > 580) { doc.addPage(); yPos = 50; } else { yPos += 12; }

        const fr = clasifData.finalReal;
        const tr = clasifData.terceroReal;

        // Título
        doc.rect(50, yPos, 512, 20).fill('#b8860b');
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#FFFFFF')
           .text(`+P CUADRO FINAL — ${clasifData.totalPuntos} pts`, 55, yPos + 5, { width: 502, lineBreak: false });
        yPos += 20;

        // Headers
        const colX = [50, 200, 330, 455];
        const colW = [150, 130, 125, 107];
        const hdrs = ['Concepto', 'Predicción', 'Real', 'Pts'];
        hdrs.forEach((h, i) => {
          doc.rect(colX[i], yPos, colW[i], 14).fill('#daa520').stroke('#999');
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#000')
             .text(h, colX[i]+3, yPos+3, { width: colW[i]-6, align: 'center', lineBreak: false });
        });
        yPos += 14;

        const getWinner = (p) => {
          if (!p || p.resultado_local === null) return null;
          return p.resultado_local > p.resultado_visitante ? p.equipo_local : p.equipo_visitante;
        };
        const getLoser = (p) => {
          if (!p || p.resultado_local === null) return null;
          return p.resultado_local > p.resultado_visitante ? p.equipo_visitante : p.equipo_local;
        };

        const rows = [
          {
            concepto: 'Finalista 1',
            pred: clasifData.equipo_final_1,
            real: fr ? fr.equipo_local : null,
            pts: (clasifData.equipo_final_1 && fr && (fr.equipo_local===clasifData.equipo_final_1 || fr.equipo_visitante===clasifData.equipo_final_1)) ? 5 : 0
          },
          {
            concepto: 'Finalista 2',
            pred: clasifData.equipo_final_2,
            real: fr ? fr.equipo_visitante : null,
            pts: (clasifData.equipo_final_2 && fr && (fr.equipo_local===clasifData.equipo_final_2 || fr.equipo_visitante===clasifData.equipo_final_2)) ? 5 : 0
          },
          { concepto: 'Campeon (1er lugar)',  pred: clasifData.equipo_final_1,   real: getWinner(fr), pts: clasifData.pts.campeon },
          { concepto: 'Subcampeon (2do)',     pred: clasifData.equipo_final_2,   real: getLoser(fr),  pts: clasifData.pts.subcampeon },
          { concepto: '3er Lugar',            pred: clasifData.equipo_tercero_1, real: getWinner(tr), pts: clasifData.pts.tercero },
          { concepto: '4o Lugar',             pred: clasifData.equipo_tercero_2, real: getLoser(tr),  pts: clasifData.pts.cuarto },
        ];

        rows.forEach(row => {
          if (yPos + 18 > 742) { doc.addPage(); yPos = 50; }
          const correcto = row.pts > 0;
          const bg = correcto ? '#d4edda' : '#f8d7da';
          doc.rect(colX[0], yPos, colW[0], 18).fill(bg).stroke('#ccc');
          doc.rect(colX[1], yPos, colW[1], 18).fill(bg).stroke('#ccc');
          doc.rect(colX[2], yPos, colW[2], 18).fill(bg).stroke('#ccc');
          doc.rect(colX[3], yPos, colW[3], 18).fill(bg).stroke('#ccc');
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#000')
             .text(row.concepto, colX[0]+4, yPos+5, { width: colW[0]-8, lineBreak: false });
          doc.fontSize(8).font('Helvetica').fillColor('#000')
             .text(row.pred || '—', colX[1]+4, yPos+5, { width: colW[1]-8, align: 'center', lineBreak: false });
          doc.fontSize(8).font('Helvetica').fillColor(row.real ? '#000' : '#999')
             .text(row.real || (fr ? 'Pendiente' : '—'), colX[2]+4, yPos+5, { width: colW[2]-8, align: 'center', lineBreak: false });
          doc.fontSize(9).font('Helvetica-Bold').fillColor(correcto ? '#28a745' : '#dc3545')
             .text(`${row.pts}`, colX[3]+4, yPos+5, { width: colW[3]-8, align: 'center', lineBreak: false });
          yPos += 18;
        });

        // Total cuadro final (suma de filas calculadas)
        const totalFilas = rows.reduce((s, r) => s + (r.pts || 0), 0);
        doc.rect(50, yPos, 512, 18).fill('#1a5490');
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#FFD700')
           .text(`TOTAL CUADRO FINAL: ${totalFilas} pts`, 55, yPos+4, { width: 502, align: 'right', lineBreak: false });
        yPos += 18;
      }
      // Tabla clasificados J3-J6 (no J7, que ya tiene su tabla propia arriba)
      if (jornadaNumero !== 7 && clasifData && clasifData.clasificados && clasifData.clasificados.length > 0) {
      // Verificar espacio — si queda poco, nueva página
      if (yPos > 600) {
        doc.addPage();
        yPos = 50;
      } else {
        yPos += 15;
      }

      // Título de la sección
      doc.rect(50, yPos, 512, 20).fill('#b8860b');
      doc.fontSize(11)
         .font('Helvetica-Bold')
         .fillColor('#FFFFFF')
         .text(`** ${
           jornadaNumero === 4 ? 'EQUIPOS A OCTAVOS DE FINAL' :
           jornadaNumero === 5 ? 'EQUIPOS A CUARTOS DE FINAL' :
           jornadaNumero === 6 ? 'EQUIPOS A SEMIFINALES' :
           'EQUIPOS CLASIFICADOS A 16VOS'
         } — ${clasifData.totalPuntos} pts`, 55, yPos + 5, { width: 502, lineBreak: false });
      yPos += 20;

      // Sub-headers: 2 columnas + pts
      const colWc = [225, 225, 62];
      const colX2c = [50, 275, 500];
      const hdrsc = ['Clasificados Pronosticados', 'Clasificados Reales', 'Pts'];
      hdrsc.forEach((h, i) => {
        doc.rect(colX2c[i], yPos, colWc[i], 15).fill('#daa520').stroke('#999');
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#000')
           .text(h, colX2c[i] + 3, yPos + 4, { width: colWc[i] - 6, align: 'center', lineBreak: false });
      });
      yPos += 15;

      // Ordenar: aciertos (verde) primero, errores (rojo) al final
      const sortedClasif = [...clasifData.clasificados]
        .sort((a, b) => b.puntos - a.puntos || a.equipo_pronosticado.localeCompare(b.equipo_pronosticado));

      sortedClasif.forEach((c) => {
        if (yPos + 18 > 742) {
          doc.addPage();
          yPos = 50;
        }
        const correcto = c.puntos > 0;
        const bg = correcto ? '#d4edda' : '#f8d7da';
        const pronosticado = c.equipo_pronosticado || '-';
        const real = correcto ? `${pronosticado} ✓` : 'No clasificó';

        [pronosticado, real, c.puntos.toString()].forEach((txt, i) => {
          doc.rect(colX2c[i], yPos, colWc[i], 18).fill(bg).stroke('#ccc');
          doc.fontSize(8).font('Helvetica').fillColor(i === 1 && !correcto ? '#cc0000' : '#000')
             .text(txt, colX2c[i] + 4, yPos + 5, { width: colWc[i] - 8, align: i === 2 ? 'center' : 'left', lineBreak: false });
        });
        yPos += 18;
      });
      } // end if jornadaNumero !== 7
  });
}

// Función removida - ahora se usa whatsappService.enviarEmailConPDF() directamente
