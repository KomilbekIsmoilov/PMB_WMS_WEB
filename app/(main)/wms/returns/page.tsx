'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from 'primereact/card';
import { Toast } from 'primereact/toast';
import { DataTable, DataTableFilterMeta } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import { FilterMatchMode } from 'primereact/api';
import Link from 'next/link';
import api from '@/app/api/api';

type ReturnDocT = {
  DocNum: number;
  DocEntry: number;
  DocDate?: string | null;
  DocDueDate?: string | null;
  CardCode?: string | null;
  CardName?: string | null;
  Status?: string | null;
  LinesCount?: number | string | null;
  TotalQty?: number | string | null;
  TotalVolume?: number | string | null;
  TotalWeight?: number | string | null;
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

export default function ReturnsPage() {
  const toast = useRef<Toast>(null);
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ReturnDocT[]>([]);

  const [globalFilterValue, setGlobalFilterValue] = useState('');
  const [filters, setFilters] = useState<DataTableFilterMeta>({
    global: { value: null, matchMode: FilterMatchMode.CONTAINS },
    DocNum: { value: null, matchMode: FilterMatchMode.EQUALS },
    CardCode: { value: null, matchMode: FilterMatchMode.CONTAINS },
    CardName: { value: null, matchMode: FilterMatchMode.CONTAINS },
  });

  const detailHref = (r: ReturnDocT) => {
    const docEntry = encodeURIComponent(String(r.DocEntry));
    const docNum = encodeURIComponent(String(r.DocNum));
    return `/wms/returns/detail?DocEntry=${docEntry}&DocNum=${docNum}`;
  };

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get('/getReturnDocsApi');
      setRows((res?.data ?? res) as ReturnDocT[]);
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: e?.response?.data?.message || 'Не удалось загрузить возвраты',
        life: 3500,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onGlobalFilterChange = (value: string) => {
    const _filters = { ...filters };
    (_filters['global'] as any).value = value;
    setFilters(_filters);
    setGlobalFilterValue(value);
  };

  const header = (
    <div className="flex flex-wrap align-items-center justify-content-between gap-2">
      <span className="p-input-icon-left">
        <i className="pi pi-search" />
        <InputText
          value={globalFilterValue}
          onChange={(e) => onGlobalFilterChange(e.target.value)}
          placeholder="Поиск по документам..."
          style={{ width: 320 }}
        />
      </span>

      <Button label={loading ? 'Загрузка...' : 'Обновить'} icon="pi pi-refresh" severity="secondary" onClick={load} disabled={loading} />
    </div>
  );

  const statusBody = (r: ReturnDocT) => {
    const s = String(r.Status || '').trim();
    if (!s) return <Tag value="-" severity="secondary" />;
    const lower = s.toLowerCase();
    if (lower.includes('закры')) return <Tag value={s} severity="success" />;
    if (lower.includes('в процессе')) return <Tag value={s} severity="warning" />;
    return <Tag value={s} />;
  };

  return (
    <>
      <Toast ref={toast} />
      <Card title="Возвраты">
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
          globalFilterFields={['DocNum', 'CardCode', 'CardName']}
          header={header}
          emptyMessage="Нет данных"
          onRowDoubleClick={(e) => router.push(detailHref(e.data as ReturnDocT))}
        >
          <Column
            field="DocNum"
            header="DocNum"
            sortable
            style={{ minWidth: 120 }}
            body={(r: ReturnDocT) => (
              <Link href={detailHref(r)} className="font-semibold text-primary hover:underline">
                {r.DocNum}
              </Link>
            )}
          />
          <Column field="DocDate" header="Дата" sortable style={{ minWidth: 140 }} body={(r: ReturnDocT) => fmtDate(r.DocDate)} />
          <Column field="CardCode" header="Код клиента" sortable style={{ minWidth: 160 }} />
          <Column field="CardName" header="Клиент" sortable style={{ minWidth: 240 }} />
          <Column header="Статус" body={statusBody} style={{ minWidth: 140 }} />
          <Column header="Строк" body={(r: ReturnDocT) => fmtNum(r.LinesCount, 0)} style={{ minWidth: 100, textAlign: 'right' }} />
          <Column header="Кол-во" body={(r: ReturnDocT) => fmtNum(r.TotalQty, 2)} style={{ minWidth: 120, textAlign: 'right' }} />
          <Column header="Объём" body={(r: ReturnDocT) => fmtNum(r.TotalVolume, 3)} style={{ minWidth: 120, textAlign: 'right' }} />
          <Column header="Вес" body={(r: ReturnDocT) => fmtNum(r.TotalWeight, 3)} style={{ minWidth: 120, textAlign: 'right' }} />
        </DataTable>
      </Card>
    </>
  );
}
