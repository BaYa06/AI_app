/**
 * PDF отчёта учителя (plan/new/teacher_cabinet.md, Teacher 54): та же раскладка, что у страницы
 * `/r/<код>` (api/_report-page.js). Собирает сервер (pdfkit, чистый JS); шрифт DejaVu Sans с
 * кириллицей и турецкими буквами лежит в api/_fonts (лицензия рядом) и попадает в функцию через
 * includeFiles в vercel.json. Файл начинается с «_», поэтому Vercel не публикует его как роут.
 */
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { groupDigits, reportFigures, reportSubtitle, unitLabel } from './_report-page.js';

const FONT_DIR = path.join(process.cwd(), 'api', '_fonts');
let fonts = null;
function loadFonts() {
  if (!fonts) {
    fonts = {
      regular: fs.readFileSync(path.join(FONT_DIR, 'DejaVuSans.ttf')),
      bold: fs.readFileSync(path.join(FONT_DIR, 'DejaVuSans-Bold.ttf')),
    };
  }
  return fonts;
}

// Цвета брендбука (светлая тема): PDF печатают и пересылают, тёмной темы у него нет
const C = {
  primary: '#6467F2',
  text: '#111827',
  text2: '#6B7280',
  muted: '#F1F5F9',
  border: '#DBDBE6',
  success: '#047857',
  successTint: '#E7F8F2',
  bar1: '#E0E1FC',
  bar2: '#A9ABF7',
};
const PAGE = { width: 595.28, margin: 48 };
const CONTENT = PAGE.width - PAGE.margin * 2;

/** Имя файла: «Отчёт Aiperi Toktogulova.pdf» без символов, запрещённых в именах файлов */
export function reportFilename(report) {
  const who = report.kind === 'group' ? `группа ${report.course}` : report.student;
  const safe = String(who || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return `Отчёт ${safe || 'Flashly'}.pdf`;
}

/** @param {object} r — отчёт (api/_report.js, composeReport) → Promise<Buffer> */
export function buildReportPdf(r) {
  const { regular, bold } = loadFonts();
  const doc = new PDFDocument({
    size: 'A4',
    margin: PAGE.margin,
    info: { Title: reportFilename(r).replace(/\.pdf$/, ''), Creator: 'Flashly' },
  });
  doc.registerFont('regular', regular);
  doc.registerFont('bold', bold);
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const x = PAGE.margin;
  let y = PAGE.margin;
  const overline = (text) => {
    doc.font('bold').fontSize(8).fillColor(C.text2).text(text, x, y, { characterSpacing: 0.8 });
    y = doc.y + 6;
  };

  // Шапка: логотип и период
  doc.roundedRect(x, y, 22, 22, 6).fill(C.primary);
  doc
    .font('bold')
    .fontSize(13)
    .fillColor(C.text)
    .text('Flashly', x + 30, y + 3);
  doc
    .font('regular')
    .fontSize(9)
    .fillColor(C.text2)
    .text(r.periodLabel, x, y + 6, { width: CONTENT, align: 'right' });
  y += 40;

  // Кто
  doc
    .font('bold')
    .fontSize(18)
    .fillColor(C.text)
    .text(r.kind === 'group' ? `Группа ${r.course}` : r.student, x, y, { width: CONTENT });
  y = doc.y + 2;
  const sub = r.kind === 'group' ? r.teacher || '' : reportSubtitle(r);
  if (sub) {
    doc.font('regular').fontSize(10).fillColor(C.text2).text(sub, x, y, { width: CONTENT });
    y = doc.y;
  }
  y += 16;

  // Четыре цифры — сетка 2×2
  const gap = 8;
  const cellW = (CONTENT - gap) / 2;
  const cellH = 56;
  reportFigures(r).forEach(([value, label, ok], i) => {
    const cx = x + (i % 2) * (cellW + gap);
    const cy = y + Math.floor(i / 2) * (cellH + gap);
    doc.roundedRect(cx, cy, cellW, cellH, 8).fill(C.muted);
    doc
      .font('bold')
      .fontSize(17)
      .fillColor(ok ? C.success : C.text)
      .text(value, cx + 12, cy + 9, { width: cellW - 24, lineBreak: false });
    doc
      .font('regular')
      .fontSize(8.5)
      .fillColor(C.text2)
      .text(label, cx + 12, cy + 35, { width: cellW - 24, lineBreak: false });
  });
  y += cellH * 2 + gap + 20;

  // Недели столбиками
  if (r.weeks.length > 0) {
    overline('ОТВЕТОВ ЗА НЕДЕЛЮ');
    const barsH = 70;
    const barGap = 8;
    const barW = (CONTENT - barGap * (r.weeks.length - 1)) / r.weeks.length;
    const top = Math.max(...r.weeks.map((w) => w.share));
    r.weeks.forEach((w, i) => {
      const h = Math.max(3, (barsH * w.share) / 100);
      const bx = x + i * (barW + barGap);
      doc
        .roundedRect(bx, y + barsH - h, barW, h, 3)
        .fill(w.share === top ? C.primary : w.share < 30 ? C.bar1 : C.bar2);
      doc
        .font('regular')
        .fontSize(7.5)
        .fillColor(C.text2)
        .text(`${w.label} · ${groupDigits(w.answers)}`, bx, y + barsH + 5, {
          width: barW,
          align: 'center',
          lineBreak: false,
        });
    });
    y += barsH + 30;
  }

  const row = (left, right, ok) => {
    doc.roundedRect(x, y, CONTENT, 28, 8).fill(ok ? C.successTint : C.muted);
    doc
      .font('bold')
      .fontSize(10)
      .fillColor(C.text)
      .text(left, x + 12, y + 8, { width: CONTENT - 140, lineBreak: false, ellipsis: true });
    doc
      .font('bold')
      .fontSize(10)
      .fillColor(ok ? C.success : C.text2)
      .text(right, x + CONTENT - 132, y + 8, { width: 120, align: 'right', lineBreak: false });
    y += 34;
  };

  if (r.kind === 'parent' && r.units.length > 0) {
    overline('ЮНИТЫ');
    for (const u of r.units.slice(-6)) {
      row(
        unitLabel(u),
        u.correctPct === null ? '—' : `${u.correctPct}% верно`,
        (u.correctPct ?? 0) >= 80
      );
    }
    y += 10;
  }
  if (r.kind === 'group' && r.best.length > 0) {
    overline('ЛУЧШИЕ');
    for (const b of r.best) {
      row(
        b.name,
        `${groupDigits(b.answers)} · ${b.correctPct === null ? '—' : `${b.correctPct}%`}`,
        true
      );
    }
    y += 10;
  }
  if (r.kind === 'group' && r.inactive.length > 0) {
    overline('НЕ ЗАХОДЯТ 7+ ДНЕЙ');
    doc
      .font('regular')
      .fontSize(10)
      .fillColor(C.text2)
      .text(r.inactive.join(', '), x, y, { width: CONTENT });
    y = doc.y + 16;
  }
  if (r.comment) {
    overline('КОММЕНТАРИЙ УЧИТЕЛЯ');
    doc.font('regular').fontSize(11).fillColor(C.text).text(r.comment, x, y, { width: CONTENT });
    y = doc.y + 16;
  }

  doc
    .font('regular')
    .fontSize(8)
    .fillColor(C.text2)
    .text('Отчёт собран учителем в приложении Flashly · flashlycards.app', x, y + 8, {
      width: CONTENT,
      align: 'center',
    });

  doc.end();
  return done;
}
