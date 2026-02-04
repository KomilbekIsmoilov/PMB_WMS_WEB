'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Card } from 'primereact/card';
import { Toast } from 'primereact/toast';
import { DataTable, DataTableFilterMeta } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { Calendar } from 'primereact/calendar';
import { Tag } from 'primereact/tag';
import { FilterMatchMode } from 'primereact/api';
import Link from 'next/link';
import api from '@/app/api/api';

type PurchaseDeliveryArchiveDocT = {
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
  LineCount?: number | string | null;
  TotalQty?: number | string | null;
  U_WorkAreaName?: string | null;
  U_WorkArea?: number | string | null;
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

const fmtDateTime = (v: any) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString('ru-RU');
};

const fmtDateParam = (d: Date | null) => {
  if (!d) return null;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const buildInitialFrom = () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d;
};

export default function PurchaseArchivePage() {
  const toast = useRef<Toast>(null);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PurchaseDeliveryArchiveDocT[]>([]);

  const [fromDate, setFromDate] = useState<Date | null>(buildInitialFrom());
  const [toDate, setToDate] = useState<Date | null>(new Date());

  const [globalFilterValue, setGlobalFilterValue] = useState('');
  const [filters, setFilters] = useState<DataTableFilterMeta>({
    global: { value: null, matchMode: FilterMatchMode.CONTAINS },
  });

  const load = async () => {
    if (!fromDate || !toDate) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Проверка',
        detail: 'Укажите период (от и до)',
        life: 2500,
      });
      return;
    }

    try {
      setLoading(true);
      const res = await api.get('/getPurchaseDeliveryArchiveApi', {
        params: {
          fromDate: fmtDateParam(fromDate),
          toDate: fmtDateParam(toDate),
        },
      });
      setRows((res?.data ?? res) as PurchaseDeliveryArchiveDocT[]);
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: e?.response?.data?.message || 'Не удалось загрузить архив закупок',
        life: 3500,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onGlobalFilterChange = (value: string) => {
    const _filters = { ...filters };
    (_filters['global'] as any).value = value;
    setFilters(_filters);
    setGlobalFilterValue(value);
  };

  const header = (
    <div className="flex flex-wrap align-items-end justify-content-between gap-2">
      <div className="flex flex-wrap gap-2">
        <span className="p-input-icon-left">
          <i className="pi pi-search" />
          <InputText
            value={globalFilterValue}
            onChange={(e) => onGlobalFilterChange(e.target.value)}
            placeholder="Поиск..."
            style={{ width: 320 }}
          />
        </span>

        <Calendar value={fromDate} onChange={(e) => setFromDate(e.value as Date)} placeholder="С даты" dateFormat="yy-mm-dd" />
        <Calendar value={toDate} onChange={(e) => setToDate(e.value as Date)} placeholder="По дату" dateFormat="yy-mm-dd" />
      </div>

      <Button label={loading ? 'Загрузка...' : 'Обновить'} icon="pi pi-refresh" severity="secondary" onClick={load} disabled={loading} />
    </div>
  );

  return (
    <>
      <Toast ref={toast} />
      <Card title="Архив закупок (поступления)">
        <DataTable
          value={rows}
          loading={loading}
          dataKey="DocEntry"
          paginator
          rows={20}
          rowsPerPageOptions={[20, 50, 100]}
          stripedRows
          showGridlines
          size="small"
          filters={filters}
          onFilter={(e) => setFilters(e.filters)}
          globalFilterFields={['DocNum', 'CardCode', 'CardName', 'SlpName', 'BPLName', 'U_WorkAreaName']}
          header={header}
          emptyMessage="Нет данных"
        >
          <Column
            field="DocNum"
            header="DocNum"
            sortable
            style={{ minWidth: 120 }}
            body={(r: PurchaseDeliveryArchiveDocT) => (
              <Link href={`/wms/purchase-archive/detail?DocEntry=${encodeURIComponent(String(r.DocEntry))}`} className="font-semibold text-primary hover:underline">
                {r.DocNum}
              </Link>
            )}
          />
          <Column header="Создан" body={(r: PurchaseDeliveryArchiveDocT) => fmtDateTime(buildCreatedAt(r.CreateDate, r.DocTime))} style={{ minWidth: 170 }} />
          <Column field="DocDate" header="Дата док." sortable style={{ minWidth: 130 }} body={(r: PurchaseDeliveryArchiveDocT) => fmtDate(r.DocDate)} />
          <Column field="DocDueDate" header="Срок" sortable style={{ minWidth: 120 }} body={(r: PurchaseDeliveryArchiveDocT) => fmtDate(r.DocDueDate)} />
          <Column field="CardCode" header="Поставщик (код)" sortable style={{ minWidth: 160 }} />
          <Column field="CardName" header="Поставщик" sortable style={{ minWidth: 220 }} />
          <Column field="SlpName" header="Менеджер" sortable style={{ minWidth: 180 }} />
          <Column field="BPLName" header="Филиал" sortable style={{ minWidth: 160 }} />
          <Column field="U_WorkAreaName" header="Раб. зона" sortable style={{ minWidth: 160 }} />
          <Column field="LineCount" header="Строк" sortable style={{ minWidth: 110, textAlign: 'right' }} />
          <Column header="Кол-во" body={(r: PurchaseDeliveryArchiveDocT) => fmtNum(r.TotalQty, 2)} style={{ minWidth: 120, textAlign: 'right' }} />
          <Column field="Comments" header="Комментарий" style={{ minWidth: 220 }} />
        </DataTable>
      </Card>
    </>
  );
}
