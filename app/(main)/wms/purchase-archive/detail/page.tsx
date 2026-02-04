'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Card } from 'primereact/card';
import { Toast } from 'primereact/toast';
import { Button } from 'primereact/button';
import { Divider } from 'primereact/divider';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';

import api from '@/app/api/api';

type HeaderT = {
  DocEntry: number;
  DocNum: number;
  DocDate?: string | null;
  DocDueDate?: string | null;
  CreateDate?: string | null;
  DocTime?: string | number | null;
  CardCode?: string | null;
  CardName?: string | null;
  Comments?: string | null;
  BPLId?: number | null;
  BPLName?: string | null;
  SlpCode?: number | string | null;
  SlpName?: string | null;
};

type BatchNumberT = { BatchNumber: string; Quantity: number | string };

type LineT = {
  LineNum: number;
  ItemCode: string;
  ItemName?: string | null;
  WhsCode?: string | null;
  Quantity?: number | string | null;
  BatchNumbers?: BatchNumberT[];
};

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmtNum = (v: any, digits = 2) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(num(v));

const fmtDate = (v: any) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('ru-RU');
};

const fmtDateTime = (v: any) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString('ru-RU');
};

const parseSapDocTimeToHHmm = (v: any) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const digits = s.replace(/\D/g, '');
  if (!digits) return null;
  const d4 = digits.padStart(4, '0').slice(-4);
  const hh = d4.slice(0, 2);
  const mm = d4.slice(2, 4);
  const h = Number(hh);
  const m = Number(mm);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${hh}:${mm}`;
};

const buildCreatedAt = (createDate?: any, docTime?: any) => {
  if (!createDate) return null;
  const base = new Date(createDate);
  if (Number.isNaN(base.getTime())) return null;
  const hhmm = parseSapDocTimeToHHmm(docTime);
  if (!hhmm) return base;
  const [hh, mm] = hhmm.split(':').map((x) => Number(x));
  const d = new Date(base);
  d.setHours(hh, mm, 0, 0);
  return d;
};

const escapeHtml = (v: any) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

export default function PurchaseArchiveDetailPage() {
  const toast = useRef<Toast>(null);
  const router = useRouter();
  const sp = useSearchParams();

  const DocEntry = sp.get('DocEntry') || '';

  const [loading, setLoading] = useState(false);
  const [header, setHeader] = useState<HeaderT | null>(null);
  const [lines, setLines] = useState<LineT[]>([]);
  const [printing, setPrinting] = useState(false);

  const totals = useMemo(() => {
    const arr = lines || [];
    const qty = arr.reduce((s, r) => s + num(r.Quantity), 0);
    return { count: arr.length, qty };
  }, [lines]);

  const load = async () => {
    if (!DocEntry) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Внимание',
        detail: 'DocEntry не указан',
        life: 2500,
      });
      return;
    }

    try {
      setLoading(true);
      const res = await api.get('/getPurchaseDeliveryDetailApi', {
        params: { DocEntry },
      });

      const data = (res?.data ?? res) as { header?: HeaderT | null; lines?: LineT[] };
      setHeader(data?.header || null);
      setLines(Array.isArray(data?.lines) ? data.lines : []);
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: e?.response?.data?.message || 'Не удалось загрузить документ',
        life: 3500,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [DocEntry]);

  const batchesBody = (r: LineT) => {
    const list = Array.isArray(r.BatchNumbers) ? r.BatchNumbers : [];
    if (!list.length) return <span className="text-500">-</span>;
    return (
      <div className="flex flex-column gap-1">
        {list.map((b, idx) => (
          <div key={`${b.BatchNumber}-${idx}`} className="text-600 text-sm">
            {b.BatchNumber} • {fmtNum(b.Quantity, 2)}
          </div>
        ))}
      </div>
    );
  };

  const printLabels = async () => {
    if (printing) return;

    const labels: Array<{
      itemCode: string;
      batchNumber: string;
      qty: number;
      docNum: number | string | null;
    }> = [];

    for (const line of lines || []) {
      const batches = Array.isArray(line.BatchNumbers) ? line.BatchNumbers : [];
      for (const b of batches) {
        const bn = String(b?.BatchNumber || '').trim();
        if (!bn) continue;
        labels.push({
          itemCode: String(line.ItemCode || '').trim(),
          batchNumber: bn,
          qty: num(b?.Quantity),
          docNum: header?.DocNum ?? null,
        });
      }
    }

    if (!labels.length) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Печать',
        detail: 'Нет партий для печати',
        life: 2500,
      });
      return;
    }

    try {
      setPrinting(true);
      const { toDataURL } = await import('qrcode');

      const qrList = await Promise.all(
        labels.map((l) =>
          toDataURL(`ITEM:${l.itemCode};BATCH:${l.batchNumber};DOC:${l.docNum ?? ''}`, { margin: 1, width: 180 })
        )
      );

      const html = `
        <html>
          <head>
            <title>Print</title>
            <style>
              @page { size: 3cm 4cm; margin: 0; }
              html, body { margin: 0; padding: 0; }
              body { font-family: Arial, sans-serif; }
              .label { width: 3cm; height: 4cm; box-sizing: border-box; padding: 0.2cm; display: flex; flex-direction: column; align-items: center; gap: 0.1cm; page-break-after: always; }
              .qr { width: 2cm; height: 2cm; flex: 0 0 auto; }
              .qr img { width: 100%; height: 100%; object-fit: contain; }
              .meta { width: 100%; font-size: 9px; line-height: 1.2; display: flex; flex-direction: column; gap: 2px; text-align: center; }
              .meta .item { font-weight: 700; font-size: 10px; }
              .meta .batch { font-size: 10px; }
              .meta .muted { color: #555; }
            </style>
          </head>
          <body>
            ${labels
              .map((l, i) => {
                const qr = qrList[i];
                return `
                  <div class="label">
                    <div class="qr"><img src="${qr}" alt="QR" /></div>
                    <div class="meta">
                      <div class="batch">${escapeHtml(l.batchNumber)}</div>
                      <div class="muted">Кол-во: ${escapeHtml(fmtNum(l.qty, 2))}</div>
                    </div>
                  </div>
                `;
              })
              .join('')}
            <script>window.onload = () => { window.print(); };</script>
          </body>
        </html>
      `;

      const w = window.open('', '_blank', 'width=600,height=800');
      if (!w) {
        toast.current?.show({
          severity: 'error',
          summary: 'Печать',
          detail: 'Не удалось открыть окно печати',
          life: 2500,
        });
        return;
      }
      w.document.open();
      w.document.write(html);
      w.document.close();
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Печать',
        detail: e?.message || 'Ошибка при печати',
        life: 3000,
      });
    } finally {
      setPrinting(false);
    }
  };

  return (
    <>
      <Toast ref={toast} />

      <div className="flex flex-column gap-3">
        <div className="flex align-items-center justify-content-between flex-wrap gap-2">
          <div className="flex align-items-center gap-2 flex-wrap">
            <Button label="Назад" icon="pi pi-arrow-left" severity="secondary" onClick={() => router.back()} />
            <Button label={loading ? 'Загрузка...' : 'Обновить'} icon="pi pi-refresh" severity="secondary" disabled={loading} onClick={load} />
            <Button
              label={printing ? 'Печать...' : 'Печать QR'}
              icon="pi pi-print"
              severity="help"
              disabled={printing || loading}
              onClick={printLabels}
            />
          </div>
          {header ? <Tag value={`DocNum: ${header.DocNum}`} severity="info" /> : null}
        </div>

        <Card
          className="shadow-2 border-round-xl"
          title={
            <div className="flex flex-column gap-1">
              <div className="flex align-items-center gap-2 flex-wrap">
                <span className="text-xl font-semibold">Поступление № {header?.DocNum ?? '-'}</span>
              </div>
              <div className="text-600">
                {header ? `${header.CardCode || ''} • ${header.CardName || ''}` : 'Загрузка данных...'}
              </div>
            </div>
          }
        >
          <div className="grid">
            <div className="col-12 md:col-3">
              <div className="text-600 text-sm">Дата</div>
              <div className="font-semibold">{fmtDate(header?.DocDate)}</div>
            </div>

            <div className="col-12 md:col-3">
              <div className="text-600 text-sm">Срок</div>
              <div className="font-semibold">{fmtDate(header?.DocDueDate)}</div>
            </div>

            <div className="col-12 md:col-3">
              <div className="text-600 text-sm">Создан</div>
              <div className="font-semibold">{fmtDateTime(buildCreatedAt(header?.CreateDate, header?.DocTime))}</div>
            </div>

            <div className="col-12 md:col-3">
              <div className="text-600 text-sm">Менеджер</div>
              <div className="font-semibold">{header?.SlpName || '-'}</div>
              {header?.SlpCode ? <div className="text-500 text-sm">SlpCode: {String(header.SlpCode)}</div> : null}
            </div>

            <div className="col-12 md:col-3">
              <div className="text-600 text-sm">Филиал</div>
              <div className="font-semibold">{header?.BPLName || '-'}</div>
            </div>

            <div className="col-12 md:col-9">
              <div className="text-600 text-sm">Комментарий</div>
              <div className="font-semibold">{header?.Comments || '-'}</div>
            </div>
          </div>

          <Divider className="my-3" />

          <div className="flex align-items-center gap-2 flex-wrap">
            <Tag value={`Строк: ${totals.count}`} />
            <Tag value={`Кол-во: ${fmtNum(totals.qty, 2)}`} severity="info" />
          </div>

          <div className="mt-3">
            <DataTable
              value={lines}
              loading={loading}
              dataKey="LineNum"
              paginator
              rows={20}
              rowsPerPageOptions={[20, 50, 100]}
              stripedRows
              showGridlines
              size="small"
              emptyMessage="Нет данных"
            >
              <Column field="LineNum" header="#" style={{ width: 80 }} />
              <Column field="ItemCode" header="Код товара" style={{ minWidth: 140 }} />
              <Column field="ItemName" header="Товар" style={{ minWidth: 260 }} />
              <Column field="WhsCode" header="Склад" style={{ minWidth: 100 }} />
              <Column header="Кол-во" body={(r: LineT) => fmtNum(r.Quantity, 2)} style={{ minWidth: 120, textAlign: 'right' }} />
              <Column header="Партии" body={batchesBody} style={{ minWidth: 240 }} />
            </DataTable>
          </div>
        </Card>
      </div>
    </>
  );
}
