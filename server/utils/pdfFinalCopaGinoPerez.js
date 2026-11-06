import PDFDocument from 'pdfkit';

// Generador del "PDF Final" de la Copa Gino Pérez (igual espíritu que
// server/utils/pdfFinal.js de Libertadores/Sudamericana, pero adaptado a que
// acá no hay jornadas: es un único torneo de 9 partidos + posiciones).
// No conoce la base de datos: el caller (la ruta) arma toda la data ya
// formateada con obtenerDetalleCompletoTorneo() y este módulo solo la dibuja.

const COLOR_PRIMARY = '#1e3c72';
const COLOR_GOLD = '#b8860b';
const COLOR_TEXT = '#222222';
const COLOR_MUTED = '#777777';
const COLOR_POSITIVO = '#1a7a3c';
const COLOR_ROW_BORDER = '#dddddd';
const COLOR_HEADER_BG = '#f0f0f0';

const MARGIN = 36;
const PAD_X = 4;
const PAD_Y = 3;

/**
 * @param {Object} datos
 * @param {Array<{posicion:number, nombre:string, puntosTotal:number}>} datos.ranking
 * @param {Array<Object>} datos.usuarios - ver obtenerDetalleCompletoTorneo()
 * @returns {Promise<Buffer>}
 */
export function generarPdfFinalCopaGinoPerezBuffer(datos) {
  const { ranking = [], usuarios = [] } = datos;

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - MARGIN * 2;

      // ---- Encabezado ----
      doc.font('Helvetica-Bold').fontSize(18).fillColor(COLOR_PRIMARY)
        .text('RESULTADOS COPA GINO PÉREZ', MARGIN, MARGIN, { width: pageWidth, align: 'center' });
      doc.moveDown(0.2);
      const fechaTexto = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' });
      doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_MUTED)
        .text(`Fecha de generación: ${fechaTexto}`, { width: pageWidth, align: 'center' });
      doc.moveDown(0.5);
      doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + pageWidth, doc.y).lineWidth(2).strokeColor(COLOR_PRIMARY).stroke();
      doc.moveDown(0.6);

      // ---- Ganador del torneo ----
      if (ranking.length > 0 && ranking[0].puntosTotal > 0) {
        const puntajeMax = ranking[0].puntosTotal;
        const ganadores = ranking.filter(r => r.puntosTotal === puntajeMax);
        asegurarEspacio(doc, 50);
        doc.font('Helvetica-Bold').fontSize(13).fillColor(COLOR_GOLD)
          .text(`GANADOR${ganadores.length > 1 ? 'ES' : ''} DE LA COPA GINO PÉREZ`, MARGIN, doc.y, { width: pageWidth, align: 'center' });
        doc.moveDown(0.3);
        doc.font('Helvetica').fontSize(11).fillColor(COLOR_TEXT)
          .text(ganadores.map(g => `${g.nombre} (${g.puntosTotal} puntos)`).join('   •   '), MARGIN, doc.y, { width: pageWidth, align: 'center' });
        doc.moveDown(0.6);
      }

      // ---- Ranking final ----
      if (ranking.length > 0) {
        dibujarSubtitulo(doc, pageWidth, 'RANKING FINAL');
        dibujarTabla(doc, pageWidth,
          [{ h: 'Pos.', f: 0.12, align: 'center' }, { h: 'Jugador', f: 0.48 }, { h: 'Puntos Partidos', f: 0.18, align: 'center' }, { h: 'Puntos Posiciones', f: 0.22, align: 'center' }],
          ranking.map((r, idx) => ({
            cells: [String(idx + 1), r.nombre, String(r.totalPartidos), String(r.totalPosiciones)],
            destacada: idx < 3
          }))
        );
      }

      // ---- Una sección por jugador ----
      usuarios.forEach((u) => {
        asegurarEspacio(doc, 55);
        doc.moveDown(0.4);
        doc.font('Helvetica-Bold').fontSize(13).fillColor(COLOR_PRIMARY)
          .text(u.nombre, MARGIN, doc.y, { width: pageWidth * 0.6, continued: false });
        doc.font('Helvetica').fontSize(9).fillColor(COLOR_MUTED)
          .text(`Total: ${u.puntosTotal} pts (Partidos: ${u.totalPartidos} + Posiciones: ${u.totalPosiciones})`, MARGIN, doc.y, { width: pageWidth, align: 'right' });
        doc.moveDown(0.3);

        dibujarSubtitulo(doc, pageWidth, 'Partidos (resultado real vs pronóstico)', 10);
        dibujarTabla(doc, pageWidth,
          [
            { h: 'Partido', f: 0.33 },
            { h: 'Resultado real', f: 0.27 },
            { h: 'Su resultado', f: 0.15, align: 'center' },
            { h: 'Bonus', f: 0.08, align: 'center' },
            { h: 'Puntos', f: 0.17, align: 'center' }
          ],
          u.filasPartidos.map(f => ({
            cells: [f.partido, f.resultadoReal, f.suResultado, f.bonus, String(f.puntos)],
            colorColumna: { 4: Number(f.puntos) > 0 ? COLOR_POSITIVO : COLOR_MUTED }
          }))
        );

        dibujarSubtitulo(doc, pageWidth, 'Posiciones: pronóstico virtual vs real', 10);
        const filasPos = [...u.filasPosGrupo, ...u.filasPosFinal];
        dibujarTabla(doc, pageWidth,
          [
            { h: 'Posición', f: 0.33 },
            { h: 'Pronóstico (virtual)', f: 0.27 },
            { h: 'Real', f: 0.22 },
            { h: 'Puntos', f: 0.18, align: 'center' }
          ],
          filasPos.map(f => ({
            cells: [f.posicion, f.virtual || '—', f.real || 'Pendiente', f.puntos == null ? '—' : String(f.puntos)],
            colorColumna: { 3: Number(f.puntos) > 0 ? COLOR_POSITIVO : COLOR_MUTED }
          }))
        );
      });

      // ---- Pie de página ----
      asegurarEspacio(doc, 40);
      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(9).fillColor(COLOR_MUTED)
        .text('Campeonato Polla Fútbol - Copa Gino Pérez', { width: pageWidth, align: 'center' });
      doc.text('Sistema de Pronósticos Deportivos', { width: pageWidth, align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function asegurarEspacio(doc, alturaNecesaria) {
  const espacioRestante = doc.page.height - doc.page.margins.bottom - doc.y;
  if (espacioRestante < alturaNecesaria) {
    doc.addPage();
  }
}

function dibujarSubtitulo(doc, pageWidth, texto, tamaño = 11) {
  asegurarEspacio(doc, tamaño + 16);
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(tamaño).fillColor(COLOR_PRIMARY)
    .text(texto, MARGIN, doc.y, { width: pageWidth });
  doc.moveDown(0.2);
}

/**
 * Tabla genérica de ancho de página completo, con encabezado y filas de
 * altura variable (según el texto más largo de cada fila).
 * columnas: [{ h: 'Encabezado', f: fracción de pageWidth (0..1), align }]
 * filas: [{ cells: [texto,...], destacada?: bool, colorColumna?: {idx: color} }]
 */
function dibujarTabla(doc, pageWidth, columnas, filas) {
  const anchos = columnas.map(c => c.f * pageWidth);
  const xs = [];
  let acc = MARGIN;
  anchos.forEach(w => { xs.push(acc); acc += w; });

  asegurarEspacio(doc, 20);
  let y = doc.y;
  const headerH = 17;
  doc.rect(MARGIN, y, pageWidth, headerH).fill(COLOR_PRIMARY);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff');
  columnas.forEach((c, i) => {
    doc.text(c.h, xs[i] + PAD_X, y + 4.5, { width: anchos[i] - PAD_X * 2, align: c.align || 'left', lineBreak: false });
  });
  doc.y = y + headerH;
  doc.x = MARGIN;

  doc.font('Helvetica').fontSize(8.5);
  filas.forEach((fila) => {
    const cells = fila.cells;
    const alturas = cells.map((texto, i) =>
      doc.heightOfString(String(texto ?? ''), { width: anchos[i] - PAD_X * 2 }) + PAD_Y * 2
    );
    const rowH = Math.max(...alturas, 14);

    asegurarEspacio(doc, rowH);
    const yRow = doc.y;

    if (fila.destacada) {
      doc.rect(MARGIN, yRow, pageWidth, rowH).fill(COLOR_HEADER_BG);
    }

    cells.forEach((texto, i) => {
      const color = (fila.colorColumna && fila.colorColumna[i]) || COLOR_TEXT;
      doc.font('Helvetica').fontSize(8.5).fillColor(color)
        .text(String(texto ?? ''), xs[i] + PAD_X, yRow + PAD_Y, {
          width: anchos[i] - PAD_X * 2,
          align: columnas[i].align || 'left'
        });
    });

    doc.y = yRow + rowH;
    doc.x = MARGIN;
    doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + pageWidth, doc.y).lineWidth(0.5).strokeColor(COLOR_ROW_BORDER).stroke();
  });

  doc.moveDown(0.4);
}
