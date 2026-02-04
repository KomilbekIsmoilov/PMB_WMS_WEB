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
import { Divider } from 'primereact/divider';
import { FilterMatchMode } from 'primereact/api';
import api from '@/app/api/api';
import * as XLSX from 'xlsx';

type PickHistoryRowT = {
  DocType?: string | null;
  Source?: string | null;
  DocEntry?: number | null;
  DocNum?: number | null;
  DocDate?: string | null;
  DocDueDate?: string | null;
  Comments?: string | null;
  SlpCode?: number | string | null;
  SlpName?: string | null;
  BPLId?: number | null;
  BPLName?: string | null;
  CardCode?: string | null;
  CardName?: string | null;
  ToWhsCode?: string | null;
  ToWhsName?: string | null;
  LineNum?: number | null;
  ItemCode?: string | null;
  ItemName?: string | null;
  WhsCode?: string | null;
  FromWhsCode?: string | null;
  FromWhsName?: string | null;
  BinAbsEntry?: number | null;
  BinCode?: string | null;
  BatchNumber?: string | null;
  Qty?: number | string | null;
  UpdatedAt?: string | null;
  CollectorEmpID?: number | null;
  CollectorName?: string | null;
};

type HistoryApiT = {
  fromDate?: string | null;
  toDate?: string | null;
  total?: number | null;
  skip?: number | null;
  limit?: number | null;
  items?: PickHistoryRowT[];
};

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmtNum = (v: any, digits = 2) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(num(v));

const fmtDateTime = (v: any) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString('ru-RU');
};

const fmtDate = (v: any) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('ru-RU');
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

const docTypeLabel = (v?: string | null) => {
  const t = String(v ?? '').toUpperCase();
  if (t === 'ORDER') return 'Заказ';
  if (t === 'TRANSFER') return 'Перемещение';
  return v || '-';
};

const sourceLabel = (v?: string | null) => {
  const t = String(v ?? '').toUpperCase();
  if (t === 'PICK') return 'Сбор';
  if (t === 'DELIVERY') return 'Доставка';
  return v || '-';
};

export default function PickHistoryReportPage() {
  const toast = useRef<Toast>(null);
  const dtRef = useRef<DataTable<PickHistoryRowT[]>>(null);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PickHistoryRowT[]>([]);
  const [total, setTotal] = useState(0);

  const [fromDate, setFromDate] = useState<Date | null>(buildInitialFrom());
  const [toDate, setToDate] = useState<Date | null>(new Date());

  const [page, setPage] = useState({ first: 0, rows: 50 });

  const [globalFilterValue, setGlobalFilterValue] = useState('');
  const [filters, setFilters] = useState<DataTableFilterMeta>({
    global: { value: null, matchMode: FilterMatchMode.CONTAINS },
  });

  const load = async (opts?: { first?: number; rows?: number }) => {
    if (!fromDate || !toDate) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Проверка',
        detail: 'Укажите период (от и до)',
        life: 2500,
      });
      return;
    }

    const nextFirst = opts?.first ?? page.first;
    const nextRows = opts?.rows ?? page.rows;

    try {
      setLoading(true);
      const res = await api.get('/getPickHistoryReportApi', {
        params: {
          fromDate: fmtDateParam(fromDate),
          toDate: fmtDateParam(toDate),
          skip: nextFirst,
          limit: nextRows,
        },
      });

      const data = (res?.data ?? res) as HistoryApiT;
      const list = Array.isArray(data?.items) ? data.items : [];

      setRows(list);
      setTotal(num(data?.total));
      setPage({ first: nextFirst, rows: nextRows });
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: e?.response?.data?.message || 'Не удалось загрузить отчет',
        life: 3500,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load({ first: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load({ first: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate]);

  const onGlobalFilterChange = (value: string) => {
    const _filters = { ...filters };
    (_filters['global'] as any).value = value;
    setFilters(_filters);
    setGlobalFilterValue(value);
  };

  const exportExcel = async () => {
    if (!fromDate || !toDate) return;

    try {
      setLoading(true);
      const res = await api.get('/getPickHistoryReportApi', {
        params: {
          fromDate: fmtDateParam(fromDate),
          toDate: fmtDateParam(toDate),
          skip: 0,
          limit: 10000,
        },
      });

      const data = (res?.data ?? res) as HistoryApiT;
      const list = Array.isArray(data?.items) ? data.items : [];

      const exportRows = list.map((r) => ({
        'Дата/время': fmtDateTime(r.UpdatedAt),
        'Тип док.': docTypeLabel(r.DocType),
        'Источник': sourceLabel(r.Source),
        'DocNum': r.DocNum ?? '',
        'DocEntry': r.DocEntry ?? '',
        'Дата док.': fmtDate(r.DocDate),
        'Срок док.': fmtDate(r.DocDueDate),
        'Комментарий': r.Comments ?? '',
        'Код клиента/склада': r.CardCode ?? r.ToWhsCode ?? '',
        'Клиент/склад': r.CardName ?? r.ToWhsName ?? '',
        'Менеджер': r.SlpName ?? '',
        'BPL': r.BPLName ?? '',
        'Строка': r.LineNum ?? '',
        'Код товара': r.ItemCode ?? '',
        'Название товара': r.ItemName ?? '',
        'Склад': r.WhsCode ?? '',
        'Склад из': r.FromWhsCode ?? '',
        'Склад из (имя)': r.FromWhsName ?? '',
        'Ячейка': r.BinCode ?? '',
        'Партия': r.BatchNumber ?? '',
        'Кол-во': num(r.Qty),
        'Сборщик': r.CollectorName ?? '',
        'EmpID': r.CollectorEmpID ?? '',
      }));

      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'PickHistory');
      XLSX.writeFile(wb, `pick_history_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: e?.response?.data?.message || 'Не удалось выгрузить Excel',
        life: 3500,
      });
    } finally {
      setLoading(false);
    }
  };

  const header = (
    <div className="flex flex-column gap-2">
      <div className="flex flex-wrap align-items-end justify-content-between gap-2">
        <div className="flex flex-wrap gap-2">
          <span className="p-input-icon-left">
            <i className="pi pi-search" />
            <InputText
              value={globalFilterValue}
              onChange={(e) => onGlobalFilterChange(e.target.value)}
              placeholder="Поиск по истории..."
              style={{ width: 280 }}
            />
          </span>

          <Calendar value={fromDate} onChange={(e) => setFromDate(e.value as Date)} placeholder="С даты" dateFormat="yy-mm-dd" />
          <Calendar value={toDate} onChange={(e) => setToDate(e.value as Date)} placeholder="По дату" dateFormat="yy-mm-dd" />
        </div>

        <div className="flex gap-2">
          <Button label={loading ? 'Загрузка...' : 'Показать'} icon="pi pi-refresh" severity="secondary" onClick={() => load({ first: 0 })} disabled={loading} />
          <Button label="Excel" icon="pi pi-file-excel" onClick={exportExcel} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Tag value={`Всего: ${total}`} />
        <Tag value={`Показано: ${rows.length}`} severity="info" />
      </div>
    </div>
  );

  return (
    <>
      <Toast ref={toast} />
      <Card title="История сборов (лог)">
        <DataTable
          ref={dtRef}
          value={rows}
          loading={loading}
          dataKey="UpdatedAt"
          paginator
          first={page.first}
          rows={page.rows}
          totalRecords={total}
          rowsPerPageOptions={[20, 50, 100, 200]}
          onPage={(e) => load({ first: e.first, rows: e.rows })}
          stripedRows
          showGridlines
          size="small"
          filters={filters}
          onFilter={(e) => setFilters(e.filters)}
          globalFilterFields={[
            'DocNum',
            'DocEntry',
            'CardCode',
            'CardName',
            'ToWhsCode',
            'ToWhsName',
            'SlpName',
            'BPLName',
            'ItemCode',
            'ItemName',
            'WhsCode',
            'FromWhsCode',
            'BinCode',
            'BatchNumber',
            'CollectorName',
            'CollectorEmpID',
          ]}
          header={header}
          emptyMessage="Нет данных"
          scrollable
          scrollHeight="600px"
        >
          <Column header="Дата/время" body={(r: PickHistoryRowT) => fmtDateTime(r.UpdatedAt)} style={{ minWidth: 170 }} />
          <Column header="Тип док." body={(r: PickHistoryRowT) => <Tag value={docTypeLabel(r.DocType)} />} style={{ minWidth: 120 }} />
          <Column header="Источник" body={(r: PickHistoryRowT) => <Tag value={sourceLabel(r.Source)} />} style={{ minWidth: 120 }} />
          <Column field="DocNum" header="DocNum" style={{ minWidth: 110 }} />
          <Column field="DocEntry" header="DocEntry" style={{ minWidth: 110 }} />
          <Column header="Дата док." body={(r: PickHistoryRowT) => fmtDate(r.DocDate)} style={{ minWidth: 120 }} />
          <Column header="Срок" body={(r: PickHistoryRowT) => fmtDate(r.DocDueDate)} style={{ minWidth: 120 }} />
          <Column field="CardCode" header="Код клиента/склада" style={{ minWidth: 160 }} />
          <Column field="CardName" header="Клиент/склад" style={{ minWidth: 220 }} />
          <Column field="SlpName" header="Менеджер" style={{ minWidth: 180 }} />
          <Column field="BPLName" header="Филиал" style={{ minWidth: 160 }} />
          <Column field="LineNum" header="Строка" style={{ minWidth: 90 }} />
          <Column field="ItemCode" header="Код товара" style={{ minWidth: 140 }} />
          <Column field="ItemName" header="Товар" style={{ minWidth: 240 }} />
          <Column field="WhsCode" header="Склад" style={{ minWidth: 90 }} />
          <Column field="FromWhsName" header="Склад из (имя)" style={{ minWidth: 160 }} />
          <Column field="FromWhsCode" header="Склад из" style={{ minWidth: 110 }} />
          <Column field="ToWhsCode" header="Склад получатель" style={{ minWidth: 140 }} />
          <Column field="ToWhsName" header="Склад получатель (имя)" style={{ minWidth: 180 }} />
          <Column field="BinCode" header="Ячейка" style={{ minWidth: 110 }} />
          <Column field="BatchNumber" header="Партия" style={{ minWidth: 120 }} />
          <Column header="Кол-во" body={(r: PickHistoryRowT) => fmtNum(r.Qty, 2)} style={{ minWidth: 110, textAlign: 'right' }} />
          <Column field="Comments" header="Комментарий" style={{ minWidth: 220 }} />
          <Column field="CollectorName" header="Сборщик" style={{ minWidth: 200 }} />
          <Column field="CollectorEmpID" header="EmpID" style={{ minWidth: 90 }} />
        </DataTable>
        <Divider className="my-3" />
      </Card>
    </>
  );
}
