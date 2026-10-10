import ExcelJS from 'exceljs';
import { SHIFT_CODES, SHIFT_CODE_LABELS, type ShiftCode } from '@gaby/shared';
import type { IScheduleExporter, ScheduleExportData } from '../../application/ports/IScheduleExporter.js';
import { daysInMonth } from '../../domain/services/shiftSchedule.js';

const MONTHS = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
];
const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Mismos colores que la grilla de /admin/horarios. */
const FILL: Record<ShiftCode, string> = { M: 'FFF4B183', T: 'FFF2F2F2', C: 'FFC6E0B4', D: 'FFBDD7EE' };

const FONT = 'Arial';
const thin = { style: 'thin' as const, color: { argb: 'FFBFBFBF' } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const CENTER = { horizontal: 'center' as const, vertical: 'middle' as const };

/**
 * Formato de la plantilla que usaba el cliente: encabezado de la empresa, fila
 * de días y día de semana, una fila por empleada con color por turno, y la
 * leyenda de horarios a la derecha.
 */
export class ExcelScheduleExporter implements IScheduleExporter {
  async toXlsx(data: ScheduleExportData): Promise<Buffer> {
    const totalDays = daysInMonth(data.year, data.month);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Sistema Gaby';
    const sheet = workbook.addWorksheet(`HORARIO ${MONTHS[data.month - 1]}`, {
      views: [{ showGridLines: false, state: 'frozen', xSplit: 2, ySplit: 7 }],
    });

    const LABEL_COL = 2;
    const FIRST_DAY_COL = 3;
    const lastDayCol = FIRST_DAY_COL + totalDays - 1;

    const title = (row: number, text: string, size: number) => {
      if (!text) return;
      sheet.mergeCells(row, LABEL_COL, row, lastDayCol);
      const cell = sheet.getCell(row, LABEL_COL);
      cell.value = text;
      cell.font = { name: FONT, bold: true, size };
      cell.alignment = CENTER;
    };
    title(2, data.businessName, 14);
    title(3, data.businessNit ? `NIT: ${data.businessNit}` : '', 11);
    title(4, `HORARIO MES DE ${MONTHS[data.month - 1]} DEL ${data.year}`, 11);

    sheet.getColumn(LABEL_COL).width = 16;
    for (let day = 1; day <= totalDays; day++) {
      const col = FIRST_DAY_COL + day - 1;
      sheet.getColumn(col).width = 5;
      const num = sheet.getCell(6, col);
      num.value = day;
      num.font = { name: FONT, bold: true };
      num.alignment = CENTER;
      num.border = BORDER;
      const weekday = sheet.getCell(7, col);
      weekday.value = WEEKDAYS[new Date(Date.UTC(data.year, data.month - 1, day)).getUTCDay()];
      weekday.font = { name: FONT, size: 9 };
      weekday.alignment = CENTER;
      weekday.border = BORDER;
    }

    const codes = new Map(data.assignments.map((a) => [`${a.employeeId}:${a.day}`, a.code]));
    data.employees.forEach((employee, i) => {
      const row = 9 + i;
      const name = sheet.getCell(row, LABEL_COL);
      name.value = employee.fullName.toUpperCase();
      name.font = { name: FONT, bold: true };
      name.border = BORDER;
      for (let day = 1; day <= totalDays; day++) {
        const cell = sheet.getCell(row, FIRST_DAY_COL + day - 1);
        cell.alignment = CENTER;
        cell.border = BORDER;
        cell.font = { name: FONT };
        const code = codes.get(`${employee.id}:${day}`);
        if (code) {
          cell.value = code;
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[code] } };
        }
      }
    });

    const notesRow = 9 + data.employees.length + 1;
    if (data.status === 'DRAFT') {
      const note = sheet.getCell(notesRow, LABEL_COL);
      note.value = 'BORRADOR — aún no publicado en el sistema.';
      note.font = { name: FONT, italic: true, size: 9, color: { argb: 'FFC00000' } };
    }

    // Leyenda a la derecha de la grilla
    const legendCol = lastDayCol + 2;
    const legendTitle = sheet.getCell(2, legendCol);
    legendTitle.value = 'Leyenda de turnos';
    legendTitle.font = { name: FONT, bold: true };
    SHIFT_CODES.forEach((code, i) => {
      const codeCell = sheet.getCell(3 + i, legendCol);
      codeCell.value = code;
      codeCell.font = { name: FONT, bold: true };
      codeCell.alignment = CENTER;
      codeCell.border = BORDER;
      codeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[code] } };
      const desc = sheet.getCell(3 + i, legendCol + 1);
      desc.value = SHIFT_CODE_LABELS[code];
      desc.font = { name: FONT };
    });
    sheet.getColumn(legendCol).width = 5;
    sheet.getColumn(legendCol + 1).width = 48;

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
