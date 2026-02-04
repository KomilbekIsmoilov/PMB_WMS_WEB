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
import { ProgressBar } from 'primereact/progressbar';
import { FilterMatchMode } from 'primereact/api';
import Link from 'next/link';
import api from '@/app/api/api';

type BinTransferDocT = {
  _id?: string;
  DocNum: number;
  DocEntry: number;
  OpenedAt?: string | null;
  createdAt?: string | null;
  FromWhsCode?: string | null;
  FromWhsName?: string | null;
  ToWhsCode?: string | null;
  ToWhsName?: string | null;
  U_WorkAreaName?: string | null;
  Status?: string | null;
  DocumentLines?: Array<{
    LineNum?: number | null;
    ItemCode: string;
    ItemName?: string | null;
    Quantity?: number | string | null;
    MovedQuantity?: number | string | null;
    MoveDetails?: Array<{ Qty?: number | string | null }>;
  }>;
};

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmtDate = (v: any) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('ru-RU');
};

export default function BinTransferListPage() {
  const toast = useRef<Toast>(null);
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<BinTransferDocT[]>([]);

  const [globalFilterValue, setGlobalFilterValue] = useState('');
  const [filters, setFilters] = useState<DataTableFilterMeta>({
    global: { value: null, matchMode: FilterMatchMode.CONTAINS },
  });

  const detailHref = (r: BinTransferDocT) => {
    if (r._id) {
      const id = encodeURIComponent(String(r._id));
      return `/wms/bin-transfer/detail?id=${id}`;
    }
    const docEntry = encodeURIComponent(String(r.DocEntry));
    return `/wms/bin-transfer/detail?DocEntry=${docEntry}`;
  };

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get('/getBinToBinApi');
      setRows((res?.data ?? res) as BinTransferDocT[]);
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: e?.response?.data?.message || 'Не удалось загрузить документы',
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

      <div className="flex gap-2">
        <Button label="Новый документ" icon="pi pi-plus" onClick={() => router.push('/wms/bin-transfer/new')} />
        <Button label={loading ? 'Загрузка...' : 'Обновить'} icon="pi pi-refresh" severity="secondary" onClick={load} disabled={loading} />
      </div>
    </div>
  );

  const statusBody = (r: BinTransferDocT) => {
    const s = String(r.Status || '').trim();
    if (!s) return <Tag value="-" severity="secondary" />;
    if (s === 'DONE') return <Tag value="DONE" severity="success" />;
    if (s === 'IN_PROGRESS') return <Tag value="IN_PROGRESS" severity="warning" />;
    if (s === 'CANCELLED') return <Tag value="CANCELLED" severity="danger" />;
    return <Tag value={s} />;
  };

  const progressBody = (r: BinTransferDocT) => {
    const lines = Array.isArray(r.DocumentLines) ? r.DocumentLines : [];
    const total = lines.reduce((s, l) => s + num(l.Quantity), 0);
    const moved = lines.reduce((s, l) => {
      const base = num(l.MovedQuantity);
      if (base > 0) return s + base;
      const details = Array.isArray(l.MoveDetails) ? l.MoveDetails : [];
      const sum = details.reduce((ss, d) => ss + num(d?.Qty), 0);
      return s + sum;
    }, 0);
    const pct = total > 0 ? Math.max(0, Math.min(100, (moved / total) * 100)) : 0;
    return (
      <div style={{ minWidth: 160 }}>
        <div className="text-600 text-sm">{Math.round(pct)}%</div>
        <ProgressBar value={pct} showValue={false} style={{ height: 8 }} />
      </div>
    );
  };

  return (
    <>
      <Toast ref={toast} />
      <Card title="Bin → Bin">
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
          globalFilterFields={['_id', 'DocNum', 'FromWhsCode', 'FromWhsName', 'U_WorkAreaName', 'Status']}
          header={header}
          emptyMessage="Нет данных"
          onRowDoubleClick={(e) => router.push(detailHref(e.data as BinTransferDocT))}
        >
          <Column
            field="DocNum"
            header="DocNum"
            sortable
            style={{ minWidth: 120 }}
            body={(r: BinTransferDocT) => (
              <Link href={detailHref(r)} className="font-semibold text-primary hover:underline">
                {r.DocNum ?? r._id ?? '-'}
              </Link>
            )}
          />
          <Column
            field="OpenedAt"
            header="Дата"
            sortable
            style={{ minWidth: 140 }}
            body={(r: BinTransferDocT) => fmtDate(r.OpenedAt || r.createdAt)}
          />
          <Column
            header="Склад"
            style={{ minWidth: 200 }}
            body={(r: BinTransferDocT) => `${r.FromWhsCode || ''} ${r.FromWhsName || ''}`.trim()}
          />
          <Column
            header="Строк"
            style={{ minWidth: 100, textAlign: 'right' }}
            body={(r: BinTransferDocT) => (Array.isArray(r.DocumentLines) ? r.DocumentLines.length : 0)}
          />
          <Column header="Прогресс" body={progressBody} style={{ minWidth: 200 }} />
          <Column field="U_WorkAreaName" header="WorkArea" style={{ minWidth: 200 }} />
          <Column header="Статус" body={statusBody} style={{ minWidth: 140 }} />
        </DataTable>
      </Card>
    </>
  );
}
