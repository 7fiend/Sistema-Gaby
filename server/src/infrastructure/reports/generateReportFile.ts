import { createWriteStream } from 'node:fs';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { ReportFormat } from '@gaby/shared';
import type { ReportResult } from '@gaby/shared';

function cellText(value: string | number): string {
  return typeof value === 'number' ? value.toLocaleString('es-CO', { maximumFractionDigits: 2 }) : value;
}

async function writeSheet(result: ReportResult, workbook: ExcelJS.Workbook): Promise<void> {
  const sheet = workbook.addWorksheet('Reporte');
  sheet.columns = result.columns.map((c) => ({ header: c.header, key: c.key, width: 22 }));
  sheet.addRows(result.rows);
  if (result.summary) {
    const row = sheet.addRow(result.summary);
    row.font = { bold: true };
  }
  sheet.getRow(1).font = { bold: true };
}

async function writeXlsxOrCsv(result: ReportResult, format: 'XLSX' | 'CSV', filePath: string): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sistema Gaby';
  await writeSheet(result, workbook);
  if (format === 'XLSX') await workbook.xlsx.writeFile(filePath);
  else await workbook.csv.writeFile(filePath);
}

/** Tabla simple posicionada a mano (sin librería de tablas) — suficiente para reportes tabulares. */
async function writePdf(result: ReportResult, filePath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    const stream = createWriteStream(filePath);
    doc.pipe(stream);
    stream.on('finish', resolve);
    stream.on('error', reject);

    doc.fontSize(16).text(result.title, { align: 'left' });
    doc.fontSize(10).fillColor('#555').text(`Rango: ${result.from} — ${result.to} · Generado: ${result.generatedAt}`);
    if (result.notes) doc.fontSize(9).fillColor('#888').text(result.notes);
    doc.moveDown();

    const startX = doc.x;
    const colWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / result.columns.length;
    const rowHeight = 18;

    const drawRow = (values: (string | number)[], y: number, bold: boolean) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor('#000');
      result.columns.forEach((col, i) => {
        doc.text(cellText(values[i] ?? ''), startX + i * colWidth, y, {
          width: colWidth - 4,
          align: col.align ?? 'left',
        });
      });
    };

    let y = doc.y + 4;
    drawRow(result.columns.map((c) => c.header), y, true);
    y += rowHeight;
    doc.moveTo(startX, y - 4).lineTo(doc.page.width - doc.page.margins.right, y - 4).strokeColor('#ccc').stroke();

    for (const row of result.rows) {
      if (y > doc.page.height - doc.page.margins.bottom - rowHeight) {
        doc.addPage({ margin: 40, size: 'A4', layout: 'landscape' });
        y = doc.page.margins.top;
      }
      drawRow(result.columns.map((c) => row[c.key] ?? ''), y, false);
      y += rowHeight;
    }

    if (result.summary) {
      y += 4;
      drawRow(result.columns.map((c) => result.summary?.[c.key] ?? ''), y, true);
    }

    doc.end();
  });
}

export async function writeReportFile(
  result: ReportResult,
  format: ReportFormat,
  filePath: string,
): Promise<void> {
  if (format === 'PDF') return writePdf(result, filePath);
  return writeXlsxOrCsv(result, format, filePath);
}
