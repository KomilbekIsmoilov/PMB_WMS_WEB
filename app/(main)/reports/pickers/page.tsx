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

type CollectorRowT = {
  empID: number;
  fullName?: string | null;
  totalQty?: number | string | null;
  totalVolume?: number | string | null;
  orders?: {
    qty?: number | string | null;
    volume?: number | string | null;
  } | null;
  transfers?: {
    qty?: number | string | null;
    volume?: number | string | null;
  } | null;
};

type TotalsT = {
  totalQty?: number | string | null;
  totalVolume?: number | string | null;
  orders?: {
    qty?: number | string | null;
    volume?: number | string | null;
  } | null;
  transfers?: {
    qty?: number | string | null;
    volume?: number | string | null;
  } | null;
};

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmtNum = (v: any, digits = 2) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(num(v));

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

const safeTotals = (raw: any): TotalsT => ({
  totalQty: num(raw?.totalQty),
  totalVolume: num(raw?.totalVolume),
  orders: {
    qty: num(raw?.orders?.qty),
    volume: num(raw?.orders?.volume),
  },
  transfers: {
    qty: num(raw?.transfers?.qty),
    volume: num(raw?.transfers?.volume),
  },
});

export default function CollectorsEfficiencyReportPage() {
  const toast = useRef<Toast>(null);
  const dtRef = useRef<DataTable<CollectorRowT[]>>(null);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CollectorRowT[]>([]);
  const [totals, setTotals] = useState<TotalsT>(() => safeTotals(null));

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
      const res = await api.get('/getCollectorsReportApi', {
        params: {
          fromDate: fmtDateParam(fromDate),
          toDate: fmtDateParam(toDate),
        },
      });

      const data = (res?.data ?? res) as { totals?: TotalsT; collectors?: CollectorRowT[] };
      const list = Array.isArray(data?.collectors) ? data.collectors : [];

      setRows(list);
      setTotals(safeTotals(data?.totals));
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
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onGlobalFilterChange = (value: string) => {
    const _filters = { ...filters };
    (_filters['global'] as any).value = value;
    setFilters(_filters);
    setGlobalFilterValue(value);
  };

  const fullName = (r: CollectorRowT) => {
    return String(r.fullName ?? '').trim() || 'Без имени';
  };

  const exportExcel = () => {
    const processed = (dtRef.current as any)?.processedData as CollectorRowT[] | undefined;
    const dataToExport = Array.isArray(processed) ? processed : rows;

    const exportRows = dataToExport.map((r) => ({
      'ID': r.empID ?? '',
      'Сборщик': fullName(r),
      'Всего, кол-во': fmtNum(r.totalQty, 2),
      'Всего, объём': fmtNum(r.totalVolume, 3),
      'Заказы, кол-во': fmtNum(r.orders?.qty, 2),
      'Заказы, объём': fmtNum(r.orders?.volume, 3),
      'Перемещения, кол-во': fmtNum(r.transfers?.qty, 2),
      'Перемещения, объём': fmtNum(r.transfers?.volume, 3),
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CollectorsEfficiency');
    XLSX.writeFile(wb, `collectors_efficiency_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
              placeholder="Поиск по сборщикам..."
              style={{ width: 260 }}
            />
          </span>

          <Calendar value={fromDate} onChange={(e) => setFromDate(e.value as Date)} placeholder="С даты" dateFormat="yy-mm-dd" />
          <Calendar value={toDate} onChange={(e) => setToDate(e.value as Date)} placeholder="По дату" dateFormat="yy-mm-dd" />
        </div>

        <div className="flex gap-2">
          <Button label={loading ? 'Загрузка...' : 'Показать'} icon="pi pi-refresh" severity="secondary" onClick={load} disabled={loading} />
          <Button label="Excel" icon="pi pi-file-excel" onClick={exportExcel} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Tag value={`Всего qty: ${fmtNum(totals.totalQty, 2)}`} />
        <Tag value={`Всего vol: ${fmtNum(totals.totalVolume, 3)}`} severity="info" />
        <Tag value={`Заказы qty: ${fmtNum(totals.orders?.qty, 2)}`} severity="success" />
        <Tag value={`Заказы vol: ${fmtNum(totals.orders?.volume, 3)}`} severity="success" />
        <Tag value={`Перемещения qty: ${fmtNum(totals.transfers?.qty, 2)}`} severity="warning" />
        <Tag value={`Перемещения vol: ${fmtNum(totals.transfers?.volume, 3)}`} severity="warning" />
      </div>
    </div>
  );

  return (
    <>
      <Toast ref={toast} />
      <Card title="Эффективность сборщиков">
        <DataTable
          ref={dtRef}
          value={rows}
          loading={loading}
          dataKey="empID"
          paginator
          rows={20}
          rowsPerPageOptions={[20, 50, 100]}
          stripedRows
          showGridlines
          size="small"
          filters={filters}
          onFilter={(e) => setFilters(e.filters)}
          globalFilterFields={['empID', 'fullName']}
          header={header}
          emptyMessage="Нет данных"
        >
          <Column field="empID" header="ID" style={{ width: 100 }} />
          <Column header="Сборщик" body={(r: CollectorRowT) => fullName(r)} style={{ minWidth: 220 }} />
          <Column header="Всего, кол-во" body={(r: CollectorRowT) => fmtNum(r.totalQty, 2)} style={{ minWidth: 140, textAlign: 'right' }} />
          <Column header="Всего, объём" body={(r: CollectorRowT) => fmtNum(r.totalVolume, 3)} style={{ minWidth: 140, textAlign: 'right' }} />
          <Column
            header="Заказы, кол-во"
            body={(r: CollectorRowT) => fmtNum(r.orders?.qty, 2)}
            style={{ minWidth: 150, textAlign: 'right' }}
          />
          <Column
            header="Заказы, объём"
            body={(r: CollectorRowT) => fmtNum(r.orders?.volume, 3)}
            style={{ minWidth: 150, textAlign: 'right' }}
          />
          <Column
            header="Перемещения, кол-во"
            body={(r: CollectorRowT) => fmtNum(r.transfers?.qty, 2)}
            style={{ minWidth: 170, textAlign: 'right' }}
          />
          <Column
            header="Перемещения, объём"
            body={(r: CollectorRowT) => fmtNum(r.transfers?.volume, 3)}
            style={{ minWidth: 170, textAlign: 'right' }}
          />
        </DataTable>
        <Divider className="my-3" />
      </Card>
    </>
  );
}
