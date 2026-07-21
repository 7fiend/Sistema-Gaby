import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, FileSpreadsheet, FileText, RefreshCw } from 'lucide-react';
import type { ReportRecord, ReportType } from '@gaby/shared';
import { REPORT_TYPE_LABELS, reportsApi } from './api';
import { formatDate, formatDateOnly, todayISO, cn } from '@/lib/utils';
import { ApiRequestError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/common/DataTable';

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString('en-CA');
}

type ExportFormat = 'PDF' | 'XLSX' | 'CSV';

export function ReportsPage() {
  const [type, setType] = useState<ReportType>('sales');
  const [from, setFrom] = useState(daysAgoISO(30));
  const [to, setTo] = useState(todayISO());
  const [historyPage, setHistoryPage] = useState(1);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const queryClient = useQueryClient();

  const {
    data: result,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['reports', type, from, to],
    queryFn: () => reportsApi.generate(type, from, to),
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ['reports-history', historyPage],
    queryFn: () => reportsApi.list({ page: historyPage }),
  });

  const handleExport = async (format: ExportFormat) => {
    setExporting(format);
    try {
      await reportsApi.export(type, from, to, format);
      toast.success('Reporte exportado');
      void queryClient.invalidateQueries({ queryKey: ['reports-history'] });
    } catch (e) {
      toast.error(e instanceof ApiRequestError ? e.message : 'Error al exportar el reporte');
    } finally {
      setExporting(null);
    }
  };

  const handleDownload = async (id: string) => {
    try {
      await reportsApi.download(id);
    } catch (e) {
      toast.error(e instanceof ApiRequestError ? e.message : 'Error al descargar el reporte');
    }
  };

  const historyColumns: Column<ReportRecord>[] = [
    { header: 'Tipo', cell: (r) => REPORT_TYPE_LABELS[r.type] },
    { header: 'Formato', cell: (r) => r.format },
    { header: 'Generado por', cell: (r) => r.createdBy },
    { header: 'Fecha', cell: (r) => formatDate(r.createdAt) },
    {
      header: '',
      cell: (r) => (
        <Button variant="ghost" size="sm" onClick={() => void handleDownload(r.id)}>
          <Download className="size-4" /> Descargar
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Reportes</h1>
        <p className="text-sm text-muted-foreground">
          Agregaciones por rango de fechas, exportables a PDF, Excel y CSV.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="report-type" className="text-xs text-muted-foreground">
            Tipo de reporte
          </label>
          <select
            id="report-type"
            value={type}
            onChange={(e) => setType(e.target.value as ReportType)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {Object.entries(REPORT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="report-from" className="text-xs text-muted-foreground">
            Desde
          </label>
          <input
            id="report-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="report-to" className="text-xs text-muted-foreground">
            Hasta
          </label>
          <input
            id="report-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </div>
        <Button onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} /> Generar
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => void handleExport('CSV')} disabled={exporting !== null}>
            CSV
          </Button>
          <Button variant="outline" onClick={() => void handleExport('XLSX')} disabled={exporting !== null}>
            <FileSpreadsheet className="size-4" /> Excel
          </Button>
          <Button variant="outline" onClick={() => void handleExport('PDF')} disabled={exporting !== null}>
            <FileText className="size-4" /> PDF
          </Button>
        </div>
      </div>

      {result && (
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-1 text-sm font-semibold">{result.title}</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            {result.notes ?? `Rango: ${formatDateOnly(result.from)} — ${formatDateOnly(result.to)}`}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  {result.columns.map((c) => (
                    <th
                      key={c.key}
                      className={cn('py-1.5 pr-2 font-medium', c.align === 'right' && 'text-right')}
                    >
                      {c.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.length === 0 && (
                  <tr>
                    <td colSpan={result.columns.length} className="py-6 text-center text-muted-foreground">
                      Sin datos en el rango seleccionado
                    </td>
                  </tr>
                )}
                {result.rows.map((row, idx) => (
                  <tr key={idx} className="border-b last:border-0">
                    {result.columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn('tnum py-1.5 pr-2', c.align === 'right' && 'text-right')}
                      >
                        {row[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {result.summary && (
                <tfoot>
                  <tr className="border-t font-semibold">
                    {result.columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn('tnum py-1.5 pr-2', c.align === 'right' && 'text-right')}
                      >
                        {result.summary?.[c.key]}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold">Historial de reportes generados</h2>
        <DataTable
          columns={historyColumns}
          data={history}
          isLoading={historyLoading}
          page={historyPage}
          onPageChange={setHistoryPage}
          emptyMessage="Aún no se han exportado reportes"
        />
      </section>
    </div>
  );
}
