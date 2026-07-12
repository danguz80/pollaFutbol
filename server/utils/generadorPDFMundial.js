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
  const bracketsQ = await pool.query(`
    SELECT pfv.usuario_id, u.nombre as nombre, pfv.equipo, pfv.posicion
    FROM mundial_pronosticos_final_virtual pfv INNER JOIN usuarios u ON pfv.usuario_id=u.id
    WHERE u.rol!='admin' ORDER BY u.nombre, pfv.posicion`);
  const ptsQ = await pool.query(`SELECT usuario_id, fase, SUM(puntos) p FROM mundial_puntos_clasificacion WHERE fase LIKE 'FINAL_%' GROUP BY usuario_id, fase`);
  const ptsMap = {};
  ptsQ.rows.forEach(r => {
    if (!ptsMap[r.usuario_id]) ptsMap[r.usuario_id] = { clasificado:0, campeon:0, subcampeon:0, tercero:0 };
    if (r.fase==='FINAL_CLASIFICADO') ptsMap[r.usuario_id].clasificado += parseInt(r.p);
    if (r.fase==='FINAL_CAMPEON') ptsMap[r.usuario_id].campeon += parseInt(r.p);
    if (r.fase==='FINAL_SUBCAMPEON') ptsMap[r.usuario_id].subcampeon += parseInt(r.p);
    if (r.fase==='FINAL_TERCERO') ptsMap[r.usuario_id].tercero += parseInt(r.p);
  });
  const porUsuario = {};
  bracketsQ.rows.forEach(row => {
    if (!porUsuario[row.usuario_id]) porUsuario[row.usuario_id] = { nombre: row.nombre, clasificados: [] };
    const posLabels = {1:'Final (equipo 1)', 2:'Final (equipo 2)', 3:'3er Lugar (equipo 1)', 4:'3er Lugar (equipo 2)'};
    const pts = row.posicion <= 2 ? (ptsMap[row.usuario_id]?.clasificado||0) : (ptsMap[row.usuario_id]?.tercero||0);
    porUsuario[row.usuario_id].clasificados.push({
      equipo_pronosticado: row.equipo, posicion: row.posicion,
      posLabel: posLabels[row.posicion], puntos: row.posicion <= 2 ? 0 : 0 // pts shown in total
    });
  });
  Object.values(porUsuario).forEach(u => {
    const p = ptsMap[u.usuario_id] || {};
    u.totalPuntos = (p.clasificado||0) + (p.campeon||0) + (p.subcampeon||0) + (p.tercero||0);
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
      puntos: row.puntos
    });
  });
  
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
      const tieneResultado = pron.real_local !== null && pron.real_visita !== null;
      const puntos = pron.puntos || 0;
      const bgColor = tieneResultado ? (puntos > 0 ? '#d4edda' : '#f8d7da') : '#f8f9fa';

      doc.rect(50, yPos, 512, 22).fill(bgColor);
      doc.rect(50, yPos, 512, 22).strokeColor('#d0d0d0').lineWidth(0.5).stroke();

      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000')
         .text(`${pron.equipo_local} vs ${pron.equipo_visitante}`, 55, yPos + 7, { width: 190, lineBreak: false });

      doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000')
         .text(`${pron.pred_local} - ${pron.pred_visita}`, 255, yPos + 7, { width: 60, align: 'center', lineBreak: false });

      if (tieneResultado) {
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000')
           .text(`${pron.real_local} - ${pron.real_visita}`, 325, yPos + 7, { width: 60, align: 'center', lineBreak: false });
      } else {
        doc.fontSize(9).fillColor('#999999')
           .text('Pendiente', 325, yPos + 7, { width: 60, align: 'center', lineBreak: false });
      }

      const bonusText = pron.bonus > 1 ? `x${pron.bonus}` : '-';
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#ff6b00')
         .text(bonusText, 395, yPos + 7, { width: 40, align: 'center', lineBreak: false });

      if (tieneResultado) {
        doc.fontSize(11).font('Helvetica-Bold').fillColor(puntos > 0 ? '#28a745' : '#dc3545')
           .text(`${puntos} pts`, 445, yPos + 7, { width: 110, align: 'center', lineBreak: false });
      } else {
        doc.fontSize(9).fillColor('#999999')
           .text('-', 445, yPos + 7, { width: 110, align: 'center', lineBreak: false });
      }

      yPos += 22;
    });

      // ==================== TABLA EQUIPOS CLASIFICADOS (J3 y J4) ====================
    if (clasifData && clasifData.clasificados.length > 0) {
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
         .text(`⭐ ${
           jornadaNumero === 4 ? 'EQUIPOS A OCTAVOS DE FINAL' :
           jornadaNumero === 5 ? 'EQUIPOS A CUARTOS DE FINAL' :
           jornadaNumero === 6 ? 'EQUIPOS A SEMIFINALES' :
           jornadaNumero === 7 ? 'CUADRO FINAL' :
           'EQUIPOS CLASIFICADOS A 16VOS'
         } — ${clasifData.totalPuntos} pts`, 55, yPos + 5, { width: 502, lineBreak: false });
      yPos += 20;

      // Sub-headers: 2 columnas + pts
      const colW = [225, 225, 62];
      const colX2 = [50, 275, 500];
      const hdrs = ['Clasificados Pronosticados', 'Clasificados Reales', 'Pts'];
      hdrs.forEach((h, i) => {
        doc.rect(colX2[i], yPos, colW[i], 15).fill('#daa520').stroke('#999');
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#000')
           .text(h, colX2[i] + 3, yPos + 4, { width: colW[i] - 6, align: 'center', lineBreak: false });
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
          doc.rect(colX2[i], yPos, colW[i], 18).fill(bg).stroke('#ccc');
          doc.fontSize(8).font('Helvetica').fillColor(i === 1 && !correcto ? '#cc0000' : '#000')
             .text(txt, colX2[i] + 4, yPos + 5, { width: colW[i] - 8, align: i === 2 ? 'center' : 'left', lineBreak: false });
        });
        yPos += 18;
      });
    }
  });
}

// Función removida - ahora se usa whatsappService.enviarEmailConPDF() directamente
