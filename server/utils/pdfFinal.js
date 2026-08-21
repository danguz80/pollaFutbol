import PDFDocument from 'pdfkit';

// Generador del "PDF Final" (ganadores + rankings + clasificados + cuadro
// final) sin Chromium/Puppeteer. Mismo motivo que pdfTestigo.js: html-pdf-node
// levanta Chromium completo por PDF y en el plan Starter de Render (512MB)
// eso puede tumbar el proceso.
//
// Este módulo es puramente de presentación: no conoce la base de datos ni
// los helpers de logos/fotos. El caller arma toda la data ya formateada
// (strings listos para mostrar) y este módulo solo la dibuja. Por las
// mismas razones que el testigo (las imágenes en producción son URLs a
// Netlify y varias están en .webp/.svg, que pdfkit no puede dibujar), no
// se incrustan logos ni fotos de perfil.

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
 * @param {string} datos.competencia - 'Copa Libertadores' | 'Copa Sudamericana'
 * @param {number} datos.jornadaNumero
 * @param {Array<{nombre:string, puntaje:number}>} datos.ganadores
 * @param {{usuario:string, puntaje_total:number}|null} [datos.ganadorAcumulado] - Solo J10
 * @param {Array<{posicion:number, usuario:string, puntos_jornada:number}>} datos.rankingJornada
 * @param {Array<{posicion:number, usuario:string, puntaje_total:number}>} datos.ranking
 * @param {Array<UsuarioPdfFinal>} datos.usuarios - ver abajo
 *
 * UsuarioPdfFinal = {
 *   nombre: string,
 *   resumenPuntos: string,               // ej: "Partidos: 3 pts" o con clasificación/cuadro final
 *   filasPartidos: Array<[jornada, partido, pronostico, resultado, bonus, puntos]>,
 *   tablaClasificacion: null | { titulo: string, columnas: string[], filas: string[][] },
 *   tablaPartidoFinal: null | { filas: string[][] },   // Solo J10
 *   tablaCuadroFinal: null | { filas: string[][], total: string }, // Solo J10
 * }
 * @returns {Promise<Buffer>}
 */
export function generarPdfFinalBuffer(datos) {
  const {
    competencia,
    jornadaNumero,
    ganadores = [],
    ganadorAcumulado = null,
    rankingJornada = [],
    ranking = [],
    usuarios = []
  } = datos;

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
        .text(`RESULTADOS ${competencia.toUpperCase()} - JORNADA ${jornadaNumero}`, MARGIN, MARGIN, { width: pageWidth, align: 'center' });
      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(11).fillColor(COLOR_TEXT)
        .text(competencia, { width: pageWidth, align: 'center' });
      const fechaTexto = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' });
      doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_MUTED)
        .text(`Fecha de generación: ${fechaTexto}`, { width: pageWidth, align: 'center' });
      doc.moveDown(0.5);
      doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + pageWidth, doc.y).lineWidth(2).strokeColor(COLOR_PRIMARY).stroke();
      doc.moveDown(0.6);

      // ---- Ganadores de la jornada ----
      if (ganadores.length > 0) {
        asegurarEspacio(doc, 50);
        doc.font('Helvetica-Bold').fontSize(13).fillColor(COLOR_GOLD)
          .text(`GANADOR${ganadores.length > 1 ? 'ES' : ''} DE LA JORNADA ${jornadaNumero}`, MARGIN, doc.y, { width: pageWidth, align: 'center' });
        doc.moveDown(0.3);
        doc.font('Helvetica').fontSize(11).fillColor(COLOR_TEXT);
        const texto = ganadores.map(g => `${g.nombre} (${g.puntaje ?? 0} puntos)`).join('   •   ');
        doc.text(texto, MARGIN, doc.y, { width: pageWidth, align: 'center' });
        doc.moveDown(0.6);
      }

      // ---- Campeón del ranking acumulado (solo J10) ----
      if (ganadorAcumulado) {
        asegurarEspacio(doc, 50);
        doc.font('Helvetica-Bold').fontSize(13).fillColor(COLOR_GOLD)
          .text('CAMPEÓN DEL RANKING ACUMULADO', MARGIN, doc.y, { width: pageWidth, align: 'center' });
        doc.moveDown(0.3);
        doc.font('Helvetica').fontSize(11).fillColor(COLOR_TEXT)
          .text(`${ganadorAcumulado.usuario} (${ganadorAcumulado.puntaje_total} puntos)`, MARGIN, doc.y, { width: pageWidth, align: 'center' });
        doc.moveDown(0.6);
      }

      // ---- Ranking de la jornada ----
      if (rankingJornada.length > 0) {
        dibujarSubtitulo(doc, pageWidth, `RANKING JORNADA ${jornadaNumero}`);
        dibujarTabla(doc, pageWidth,
          [{ h: 'Pos.', f: 0.12, align: 'center' }, { h: 'Jugador', f: 0.63 }, { h: 'Puntos', f: 0.25, align: 'center' }],
          rankingJornada.map(r => ({ cells: [String(r.posicion), r.usuario, String(r.puntos_jornada)], destacada: r.posicion <= 3 }))
        );
      }

      // ---- Ranking acumulado ----
      if (ranking.length > 0) {
        dibujarSubtitulo(doc, pageWidth, `RANKING ACUMULADO (hasta Jornada ${jornadaNumero})`);
        dibujarTabla(doc, pageWidth,
          [{ h: 'Pos.', f: 0.12, align: 'center' }, { h: 'Jugador', f: 0.63 }, { h: 'Puntos Totales', f: 0.25, align: 'center' }],
          ranking.map(r => ({ cells: [String(r.posicion), r.usuario, String(r.puntaje_total)], destacada: r.posicion <= 3 }))
        );
      }

      // ---- Una sección por usuario ----
      usuarios.forEach((u) => {
        asegurarEspacio(doc, 55);
        doc.moveDown(0.4);
        doc.font('Helvetica-Bold').fontSize(13).fillColor(COLOR_PRIMARY)
          .text(u.nombre, MARGIN, doc.y, { width: pageWidth * 0.6, continued: false });
        doc.font('Helvetica').fontSize(9).fillColor(COLOR_MUTED)
          .text(u.resumenPuntos || '', MARGIN, doc.y, { width: pageWidth, align: 'right' });
        doc.moveDown(0.3);

        dibujarTabla(doc, pageWidth,
          [
            { h: 'J.', f: 0.06, align: 'center' },
            { h: 'Partido', f: 0.40 },
            { h: 'Pron.', f: 0.13, align: 'center' },
            { h: 'Result.', f: 0.13, align: 'center' },
            { h: 'Bonus', f: 0.10, align: 'center' },
            { h: 'Puntos', f: 0.18, align: 'center' }
          ],
          u.filasPartidos.map(([jor, partido, pron, res, bonus, pts]) => ({
            cells: [String(jor), partido, pron, res, bonus, String(pts)],
            colorColumna: { 5: Number(pts) > 0 ? COLOR_POSITIVO : COLOR_MUTED }
          }))
        );

        if (u.tablaClasificacion) {
          dibujarSubtitulo(doc, pageWidth, u.tablaClasificacion.titulo, 10);
          dibujarTabla(doc, pageWidth,
            distribuirColumnas(u.tablaClasificacion.columnas),
            filasConColorFinal(u.tablaClasificacion.filas)
          );
        }

        if (u.tablaPartidoFinal) {
          dibujarSubtitulo(doc, pageWidth, 'PARTIDO FINAL', 10);
          dibujarTabla(doc, pageWidth,
            [
              { h: 'Partido', f: 0.40 }, { h: 'Pron.', f: 0.15, align: 'center' },
              { h: 'Result.', f: 0.15, align: 'center' }, { h: 'Bonus', f: 0.10, align: 'center' },
              { h: 'Puntos', f: 0.20, align: 'center' }
            ],
            filasConColorFinal(u.tablaPartidoFinal.filas)
          );
        }

        if (u.tablaCuadroFinal) {
          dibujarSubtitulo(doc, pageWidth, 'CUADRO FINAL', 10);
          dibujarTabla(doc, pageWidth,
            [{ h: 'Posición', f: 0.20 }, { h: 'Equipo Real', f: 0.30 }, { h: 'Pronosticado', f: 0.30 }, { h: 'Puntos', f: 0.20, align: 'center' }],
            filasConColorFinal(u.tablaCuadroFinal.filas)
          );
          asegurarEspacio(doc, 16);
          doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR_PRIMARY)
            .text(`Total Cuadro Final: ${u.tablaCuadroFinal.total} pts`, MARGIN, doc.y, { width: pageWidth, align: 'right' });
          doc.moveDown(0.3);
        }
      });

      // ---- Pie de página ----
      asegurarEspacio(doc, 40);
      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(9).fillColor(COLOR_MUTED)
        .text(`Campeonato Polla Fútbol - ${competencia}`, { width: pageWidth, align: 'center' });
      doc.text('Sistema de Pronósticos Deportivos', { width: pageWidth, align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// Colorea en verde/gris la última columna de cada fila (asumida "Puntos"),
// igual que las clases puntos-positivo/puntos-cero de la versión anterior.
function filasConColorFinal(filas) {
  return filas.map((fila) => {
    const idx = fila.length - 1;
    const valor = Number(String(fila[idx]).replace(/[^\d.-]/g, ''));
    const color = Number.isFinite(valor) && valor > 0 ? COLOR_POSITIVO : COLOR_MUTED;
    return { cells: fila, colorColumna: { [idx]: color } };
  });
}

function distribuirColumnas(nombres) {
  // Primera columna un poco más angosta si son 4+, si son 3 la última centrada de puntos
  if (nombres.length === 3) {
    return [{ h: nombres[0], f: 0.40 }, { h: nombres[1], f: 0.40 }, { h: nombres[2], f: 0.20, align: 'center' }];
  }
  if (nombres.length === 4) {
    return [{ h: nombres[0], f: 0.30 }, { h: nombres[1], f: 0.30 }, { h: nombres[2], f: 0.25 }, { h: nombres[3], f: 0.15, align: 'center' }];
  }
  if (nombres.length === 5) {
    return [{ h: nombres[0], f: 0.20 }, { h: nombres[1], f: 0.30 }, { h: nombres[2], f: 0.25 }, { h: nombres[3], f: 0.10, align: 'center' }, { h: nombres[4], f: 0.15, align: 'center' }];
  }
  // fallback: repartir parejo
  const f = 1 / nombres.length;
  return nombres.map(h => ({ h, f }));
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
 * altura variable (según el texto más largo de cada fila, para que los
 * nombres de partidos largos no se corten).
 *
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
