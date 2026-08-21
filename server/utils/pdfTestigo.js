import PDFDocument from 'pdfkit';

// Generador de PDF "Documento Testigo" sin Chromium/Puppeteer.
//
// html-pdf-node levanta una instancia completa de Chromium headless por cada
// PDF, lo que en el plan Starter de Render (512MB de RAM) puede quedarse sin
// memoria y tumbar el proceso (502 Bad Gateway). pdfkit arma el PDF de forma
// nativa en JS, sin navegador, con un costo de memoria muchísimo menor.
//
// Por simplicidad y para evitar otro problema (los logos de equipos en
// producción son URLs a Netlify — client/public no existe en el filesystem
// del backend — y varios están en .webp/.svg, formatos que pdfkit no puede
// dibujar), esta versión no incrusta logos ni fotos: solo texto. Es un
// documento testigo, no necesita ser vistoso, necesita ser confiable.

const COLOR_PRIMARY = '#0066cc';
const COLOR_TEXT = '#222222';
const COLOR_MUTED = '#888888';
const COLOR_ROW_BORDER = '#dddddd';

const MARGIN = 40;
const ROW_HEIGHT = 20;
const HEADER_ROW_HEIGHT = 22;

/**
 * Genera el PDF testigo de una jornada y devuelve un Buffer.
 *
 * @param {Object} params
 * @param {string} params.competencia - Nombre de la competencia (ej: 'Copa Libertadores')
 * @param {number|string} params.jornadaNumero
 * @param {string} [params.jornadaNombre] - Nombre descriptivo opcional (ej: 'Octavos de Final')
 * @param {Array<{nombre_local:string, nombre_visita:string, tipo_partido?:string}>} params.partidosUnicos
 * @param {Object} params.pronosticosPorUsuario - { [nombreUsuario]: { pronosticos: { 'local|visita': { goles_local, goles_visita, penales_local, penales_visita, tipo_partido? } } } }
 * @returns {Promise<Buffer>}
 */
export function generarPdfTestigoBuffer({
  competencia,
  jornadaNumero,
  jornadaNombre,
  partidosUnicos,
  pronosticosPorUsuario
}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - MARGIN * 2;

      // ---- Encabezado ----
      doc.font('Helvetica-Bold').fontSize(20).fillColor(COLOR_PRIMARY)
        .text(`Pronósticos ${competencia}`, MARGIN, MARGIN, { width: pageWidth, align: 'center' });
      doc.moveDown(0.2);
      const lineaJornada = jornadaNombre ? `${jornadaNombre} (Jornada ${jornadaNumero})` : `Jornada ${jornadaNumero}`;
      doc.font('Helvetica').fontSize(12).fillColor(COLOR_TEXT)
        .text(lineaJornada, { width: pageWidth, align: 'center' });
      doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_TEXT)
        .text('Documento Testigo - Pronósticos Registrados', { width: pageWidth, align: 'center' });
      const fechaTexto = new Date().toLocaleDateString('es-ES', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      doc.font('Helvetica').fontSize(9).fillColor(COLOR_MUTED)
        .text(`Fecha de generación: ${fechaTexto}`, { width: pageWidth, align: 'center' });

      doc.moveDown(0.6);
      doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + pageWidth, doc.y)
        .lineWidth(2).strokeColor(COLOR_PRIMARY).stroke();
      doc.moveDown(0.8);

      // ---- Una sección por usuario, orden alfabético ----
      const usuarios = Object.keys(pronosticosPorUsuario).sort((a, b) => a.localeCompare(b, 'es'));

      usuarios.forEach((usuario) => {
        const userData = pronosticosPorUsuario[usuario];

        asegurarEspacio(doc, HEADER_ROW_HEIGHT + ROW_HEIGHT + 30);

        doc.font('Helvetica-Bold').fontSize(13).fillColor(COLOR_PRIMARY)
          .text(usuario, MARGIN, doc.y, { width: pageWidth });
        doc.moveDown(0.3);

        dibujarFilaEncabezado(doc, pageWidth, ['Partido', 'Pronóstico']);

        partidosUnicos.forEach((partido) => {
          asegurarEspacio(doc, ROW_HEIGHT + 2);

          const key = `${partido.nombre_local}|${partido.nombre_visita}`;
          const p = userData.pronosticos[key];
          const esFinal = partido.tipo_partido === 'FINAL';
          const nombrePartido = `${partido.nombre_local} vs ${partido.nombre_visita}${esFinal ? '  [FINAL]' : ''}`;

          let textoPronostico;
          let colorPronostico = COLOR_TEXT;
          if (!p || p.goles_local === null || p.goles_visita === null) {
            textoPronostico = 'Sin pronóstico';
            colorPronostico = COLOR_MUTED;
          } else {
            textoPronostico = `${p.goles_local}-${p.goles_visita}`;
            const tipoPartido = p.tipo_partido || partido.tipo_partido;
            const esVueltaOFinal = tipoPartido === 'VUELTA' || tipoPartido === 'FINAL' || !tipoPartido;
            if (esVueltaOFinal && p.penales_local !== null && p.penales_visita !== null &&
                p.penales_local !== undefined && p.penales_visita !== undefined) {
              textoPronostico += ` (${p.penales_local}-${p.penales_visita} pen.)`;
            }
          }

          dibujarFilaDatos(doc, pageWidth, nombrePartido, textoPronostico, colorPronostico);
        });

        doc.moveDown(0.7);
      });

      // ---- Pie de página ----
      asegurarEspacio(doc, 40);
      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(9).fillColor(COLOR_MUTED)
        .text(`Campeonato Polla Fútbol - ${competencia}`, { width: pageWidth, align: 'center' });
      doc.text('Este documento certifica los pronósticos registrados antes del inicio de la jornada',
        { width: pageWidth, align: 'center' });

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

function dibujarFilaEncabezado(doc, pageWidth, [colA, colB]) {
  const y = doc.y;
  const colAWidth = pageWidth * 0.65;
  const colBWidth = pageWidth * 0.35;

  doc.rect(MARGIN, y, pageWidth, HEADER_ROW_HEIGHT).fill(COLOR_PRIMARY);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff');
  doc.text(colA, MARGIN + 6, y + 6, { width: colAWidth - 12, lineBreak: false });
  doc.text(colB, MARGIN + colAWidth + 6, y + 6, { width: colBWidth - 12, lineBreak: false });

  doc.y = y + HEADER_ROW_HEIGHT;
  doc.x = MARGIN;
}

function dibujarFilaDatos(doc, pageWidth, colA, colB, colorColB) {
  const y = doc.y;
  const colAWidth = pageWidth * 0.65;
  const colBWidth = pageWidth * 0.35;

  doc.font('Helvetica').fontSize(9.5).fillColor(COLOR_TEXT);
  doc.text(colA, MARGIN + 6, y + 5, { width: colAWidth - 12, lineBreak: false });
  doc.font('Helvetica-Bold').fillColor(colorColB || COLOR_TEXT);
  doc.text(colB, MARGIN + colAWidth + 6, y + 5, { width: colBWidth - 12, lineBreak: false });

  doc.y = y + ROW_HEIGHT;
  doc.x = MARGIN;
  doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + pageWidth, doc.y)
    .lineWidth(0.5).strokeColor(COLOR_ROW_BORDER).stroke();
}
