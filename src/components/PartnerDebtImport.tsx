import { ChangeEvent, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { CheckCircle2, FileSpreadsheet, Upload, X } from 'lucide-react';
import { partnerImportApi } from '../lib/api';
import { formatCurrency, normalizeSearchText } from '../lib/utils';
import { Button } from './ui/Button';

type PartnerType = 'customer' | 'supplier';
type ImportEntity = 'customer_debt' | 'supplier_debt';

type ImportPayload = {
  sourceSystem: string;
  fileName: string;
  entityType: ImportEntity;
  rows: Record<string, unknown>[];
  partnerCode: string;
  meta?: Record<string, unknown>;
};

type ImportPreview = {
  payload: ImportPayload;
  result: {
    stats: {
      totalRows: number;
      documentCount?: number;
      detailCount?: number;
      detailRowCount?: number;
      ignoredRowCount?: number;
      debitTotal?: number;
      creditTotal?: number;
      errorCount: number;
    };
    issues: Array<{ rowNumber: number; message: string; sourceCode?: string }>;
    sample: Record<string, unknown>[];
  };
};

const compactHeader = (value: unknown) => normalizeSearchText(value).replace(/[^a-z0-9]/g, '');
const cellText = (value: unknown) => value instanceof Date ? value.toISOString() : String(value ?? '').trim();

const rowToObject = (headers: unknown[], values: unknown[]) => headers.reduce<Record<string, unknown>>((result, header, index) => {
  const key = cellText(header);
  if (key) result[key] = values[index] ?? '';
  return result;
}, {});

const findHeaderRow = (rows: unknown[][]) => {
  for (let index = 0; index < Math.min(rows.length, 40); index += 1) {
    const headers = rows[index].map(compactHeader).filter(Boolean);
    const hasHeader = (expected: string) => headers.some((value) => value === expected || value.includes(expected));
    if (hasHeader('ghino') && hasHeader('ghico')) return index;
  }
  return -1;
};

const findMetaValue = (rows: unknown[][], labels: string[]) => {
  const expected = labels.map(compactHeader);
  for (const row of rows.slice(0, 20)) {
    const labelIndex = row.findIndex((cell) => expected.includes(compactHeader(cell)));
    if (labelIndex >= 0 && cellText(row[labelIndex + 1])) return cellText(row[labelIndex + 1]);
  }
  return '';
};

const parseDebtWorkbook = async (file: File, partnerType: PartnerType, partnerCode: string): Promise<ImportPayload> => {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('File không có sheet dữ liệu.');
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: '', raw: true });
  const headerIndex = findHeaderRow(rawRows);
  if (headerIndex < 0) throw new Error('Không nhận diện được mẫu công nợ chi tiết Kiot Việt.');
  const sourceCode = findMetaValue(rawRows, partnerType === 'customer'
    ? ['Mã KH', 'Mã khách hàng']
    : ['Mã NCC', 'Mã nhà cung cấp']);
  if (sourceCode && normalizeSearchText(sourceCode) !== normalizeSearchText(partnerCode)) {
    throw new Error(`File đang thuộc mã ${sourceCode}, không khớp với đối tác ${partnerCode}.`);
  }
  const headers = rawRows[headerIndex];
  const rows = rawRows.slice(headerIndex + 1)
    .map((row, index) => ({ row: rowToObject(headers, row), sourceRowNumber: headerIndex + index + 2 }))
    .filter(({ row }) => Object.values(row).some((value) => cellText(value)))
    .map(({ row, sourceRowNumber }) => ({ ...row, __sourceRowNumber: sourceRowNumber }));
  if (!rows.length) throw new Error('File không có dòng dữ liệu để import.');
  return {
    sourceSystem: 'kiot-viet',
    fileName: file.name,
    entityType: partnerType === 'customer' ? 'customer_debt' : 'supplier_debt',
    rows,
    partnerCode,
    meta: { sheetName, headerRow: headerIndex + 1, partnerCode, sourceCode },
  };
};

interface PartnerDebtImportProps {
  partnerType: PartnerType;
  partnerCode: string;
  canImport: boolean;
  onImported?: () => void;
}

export default function PartnerDebtImport({ partnerType, partnerCode, canImport, onImported }: PartnerDebtImportProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setParsing(true);
    try {
      const payload = await parseDebtWorkbook(file, partnerType, partnerCode);
      const result = await partnerImportApi.preview(payload);
      setPreview({ payload, result });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể đọc file công nợ chi tiết.');
    } finally {
      setParsing(false);
    }
  };

  const confirmImport = async () => {
    if (!preview) return;
    setImporting(true);
    setError('');
    try {
      await partnerImportApi.importBatch(preview.payload);
      setPreview(null);
      onImported?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể import công nợ chi tiết.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
      {canImport && (
        <Button
          size="sm"
          variant="outline"
          disabled={parsing}
          onClick={() => inputRef.current?.click()}
          className="h-8 rounded-md px-3 text-xs"
          title="Nhập công nợ chi tiết theo mẫu Kiot Việt"
        >
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          {parsing ? 'Đang đọc...' : 'Nhập công nợ'}
        </Button>
      )}

      {error && (
        <div className="fixed bottom-4 right-4 z-[70] flex max-w-sm items-start gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs text-rose-700 shadow-xl">
          <span>{error}</span>
          <button type="button" className="ml-auto shrink-0" onClick={() => setError('')} aria-label="Đóng thông báo lỗi"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-3 pt-8 sm:p-6">
          <section className="w-full max-w-3xl rounded-lg border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-sky-50 p-2 text-sky-700"><FileSpreadsheet className="h-5 w-5" /></div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Xem trước công nợ chi tiết</h2>
                  <p className="text-xs text-slate-500">{preview.payload.fileName} · {partnerType === 'customer' ? 'khách hàng' : 'nhà cung cấp'} · {partnerCode}</p>
                </div>
              </div>
              <button type="button" onClick={() => setPreview(null)} aria-label="Đóng xem trước"><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="space-y-3 p-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[
                  ['Dòng đọc', preview.result.stats.totalRows],
                  ['Chứng từ', preview.result.stats.documentCount ?? preview.result.stats.detailCount ?? 0],
                  ['Dòng hàng', preview.result.stats.detailRowCount ?? 0],
                  ['Ghi nợ', preview.result.stats.debitTotal ?? 0],
                  ['Ghi có', preview.result.stats.creditTotal ?? 0],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-[11px] text-slate-500">{label}</div>
                    <div className="text-lg font-semibold tabular-nums text-slate-900">{typeof value === 'number' && (label === 'Ghi nợ' || label === 'Ghi có') ? formatCurrency(value) : value}</div>
                  </div>
                ))}
              </div>
              <div className="rounded border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                Các chứng từ và dòng hàng sẽ được lưu vào lịch sử công nợ của đúng đối tác. File chi tiết không cộng lại số dư để tránh trùng với số dư migration.
              </div>
              {preview.result.issues.length > 0 ? (
                <div className="max-h-56 overflow-auto rounded border border-rose-200 bg-rose-50">
                  <div className="border-b border-rose-200 px-3 py-2 text-xs font-semibold text-rose-800">Cần xử lý trước khi import</div>
                  <div className="divide-y divide-rose-100">
                    {preview.result.issues.slice(0, 100).map((issue) => <div key={`${issue.rowNumber}-${issue.message}`} className="px-3 py-2 text-xs text-rose-700">Dòng {issue.rowNumber}: {issue.message}{issue.sourceCode ? ` · ${issue.sourceCode}` : ''}</div>)}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"><CheckCircle2 className="h-4 w-4" />Mẫu hợp lệ, có thể import.</div>
              )}
              {preview.result.stats.ignoredRowCount ? <p className="text-[11px] text-slate-500">Đã bỏ qua {preview.result.stats.ignoredRowCount} dòng trống hoặc chân trang.</p> : null}
              <details className="rounded border border-slate-200">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-700">Xem mẫu chứng từ</summary>
                <pre className="max-h-48 overflow-auto border-t border-slate-100 bg-slate-50 p-3 text-[10px] text-slate-600">{JSON.stringify(preview.result.sample.slice(0, 5), null, 2)}</pre>
              </details>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">
              <Button type="button" size="sm" variant="outline" onClick={() => setPreview(null)}>Hủy</Button>
              <Button type="button" size="sm" disabled={importing || preview.result.issues.length > 0} onClick={() => void confirmImport()}>{importing ? 'Đang import...' : 'Xác nhận import'}</Button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
