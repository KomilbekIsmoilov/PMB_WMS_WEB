// src/app/(main)/purchase/PurchaseDocsPage.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from 'primereact/card';
import { Toast } from 'primereact/toast';
import { DataTable, DataTableFilterMeta } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import { MultiSelect } from 'primereact/multiselect';
import { Dropdown } from 'primereact/dropdown';
import { Divider } from 'primereact/divider';
import { FilterMatchMode } from 'primereact/api';
import api from '@/app/api/api';
import AssignWorkAreaModal, { WorkAreaOptionT } from '../../components/WorkAreaModal';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';

type PurchaseDocT = {
  DocNum: number;
  DocEntry: number;
  CardCode: string;
  CardName: string;
  DocDate: string;   
  DocDueDate: string;
  Comments?: string | null;
  U_State?: string | null;
  U_DopStatus2?: string | null;
  ObjType?: string | null;
  SlpCode?: number | string | null;
  SlpName?: string | null;
  U_WorkAreaName?: string | null;

  Karobka?: number | null;
  Volume?: number | null;
  Weight?: number | null;
};

type ColDef = {
  field: keyof PurchaseDocT | 'actions';
  header: string;
  sortable?: boolean;
  filter?: boolean;
  style?: React.CSSProperties;
  body?: (row: PurchaseDocT) => React.ReactNode;
  dataType?: 'text' | 'numeric' | 'date';
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

export default function PurchaseDocsPage() {
  const toast = useRef<Toast>(null);
  const dtRef = useRef<DataTable<PurchaseDocT[]>>(null);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PurchaseDocT[]>([]);
  const [selectedRows, setSelectedRows] = useState<PurchaseDocT[]>([]);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const workAreaOptionsForModal: WorkAreaOptionT[] = useMemo(() => {
 
  return [];
}, []);

  const [globalFilterValue, setGlobalFilterValue] = useState('');
  const [filters, setFilters] = useState<DataTableFilterMeta>({
    global: { value: null, matchMode: FilterMatchMode.CONTAINS },

    DocNum: { value: null, matchMode: FilterMatchMode.EQUALS },
    DocEntry: { value: null, matchMode: FilterMatchMode.EQUALS },
    CardCode: { value: null, matchMode: FilterMatchMode.CONTAINS },
    CardName: { value: null, matchMode: FilterMatchMode.CONTAINS },
    Comments: { value: null, matchMode: FilterMatchMode.CONTAINS },
    U_State: { value: null, matchMode: FilterMatchMode.CONTAINS },
    U_DopStatus2: { value: null, matchMode: FilterMatchMode.CONTAINS },
    SlpName: { value: null, matchMode: FilterMatchMode.CONTAINS },
  });


  const router = useRouter();

const detailHref = React.useCallback((r: PurchaseDocT) => {
  const docEntry = encodeURIComponent(String(r.DocEntry));
  const docNum = encodeURIComponent(String(r.DocNum));
  return `/pages/wms/PurchaseDocDetail?DocEntry=${docEntry}&DocNum=${docNum}`;
}, []);

  const allColumns: ColDef[] = useMemo(
    () => [
      {
  field: 'DocNum',
  header: 'DocNum',
  sortable: true,
  filter: true,
  dataType: 'numeric',
  style: { minWidth: 120 },
  body: (r) => (
    <div className="flex align-items-center gap-2">
      <Link href={detailHref(r)} className="font-semibold text-primary hover:underline">
        {r.DocNum}
      </Link>
      <Link href={detailHref(r)} aria-label="Открыть" className="text-500 hover:text-primary">
        <i className="pi pi-external-link" />
      </Link>
    </div>
  ),
},


      { field: 'CardCode', header: 'Код Поставщика', sortable: true, filter: true, dataType: 'text', style: { minWidth: 160 } },
      { field: 'CardName', header: 'Поставщик', sortable: true, filter: true, dataType: 'text', style: { minWidth: 240 } },

      {
        field: 'DocDate',
        header: 'Дата',
        sortable: true,
        filter: true,
        dataType: 'date',
        style: { minWidth: 140 },
        body: (r) => fmtDate(r.DocDate),
      },
      {
        field: 'DocDueDate',
        header: 'Срок',
        sortable: true,
        filter: true,
        dataType: 'date',
        style: { minWidth: 140 },
        body: (r) => fmtDate(r.DocDueDate),
      },

      { field: 'Comments', header: 'Комментарий', sortable: true, filter: true, dataType: 'text', style: { minWidth: 260 } },

      {
        field: 'U_State',
        header: 'State',
        sortable: true,
        filter: true,
        dataType: 'text',
        style: { minWidth: 140 },
        body: (r) => (r.U_State ? <Tag value={String(r.U_State)} /> : null),
      },
      {
        field: 'U_DopStatus2',
        header: 'DopStatus2',
        sortable: true,
        filter: true,
        dataType: 'text',
        style: { minWidth: 160 },
        body: (r) => (r.U_DopStatus2 ? <Tag value={String(r.U_DopStatus2)} severity="info" /> : null),
      },

      { field: 'SlpName', header: 'Менеджер', sortable: true, filter: true, dataType: 'text', style: { minWidth: 200 } },
        { field: 'U_WorkAreaName', header: 'U_WorkAreaName', sortable: true, filter: true, dataType: 'text', style: { minWidth: 200 } },
      {
        field: 'Karobka',
        header: 'Коробка',
        sortable: true,
        filter: true,
        dataType: 'numeric',
        style: { minWidth: 120, textAlign: 'right' },
        body: (r) => <span className="font-medium">{fmtNum(r.Karobka, 2)}</span>,
      },
      {
        field: 'Volume',
        header: 'Объём',
        sortable: true,
        filter: true,
        dataType: 'numeric',
        style: { minWidth: 120, textAlign: 'right' },
        body: (r) => <span className="font-medium">{fmtNum(r.Volume, 3)}</span>,
      },
      {
        field: 'Weight',
        header: 'Вес',
        sortable: true,
        filter: true,
        dataType: 'numeric',
        style: { minWidth: 120, textAlign: 'right' },
        body: (r) => <span className="font-medium">{fmtNum(r.Weight, 3)}</span>,
      },
    ],
    []
  );

  const [visibleFields, setVisibleFields] = useState<string[]>(() => allColumns.map((c) => String(c.field)));

  const visibleColumns = useMemo(() => {
    const set = new Set(visibleFields);
    return allColumns.filter((c) => set.has(String(c.field)));
  }, [allColumns, visibleFields]);

  const columnToggleOptions = useMemo(
    () =>
      allColumns.map((c) => ({
        label: c.header,
        value: String(c.field),
      })),
    [allColumns]
  );

  // load data
  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get('/getPurchaseDocsApi'); 
      setRows((res?.data ?? res) as PurchaseDocT[]);
      setSelectedRows([]);
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

  // global filter
  const onGlobalFilterChange = (value: string) => {
    const _filters = { ...filters };
    (_filters['global'] as any).value = value;
    setFilters(_filters);
    setGlobalFilterValue(value);
  };

  const exportExcel = () => {
    const processed = (dtRef.current as any)?.processedData as PurchaseDocT[] | undefined;
    const dataToExport = Array.isArray(processed) ? processed : rows;

    const fields = visibleColumns.map((c) => String(c.field));

    const exportRows = dataToExport.map((r) => {
      const out: Record<string, any> = {};
      visibleColumns.forEach((c) => {
        const key = c.header;
        const field = c.field as keyof PurchaseDocT;
        let v: any = (r as any)[field];

        if (field === 'DocDate' || field === 'DocDueDate') v = fmtDate(v);
        if (field === 'Karobka' || field === 'Volume' || field === 'Weight') v = num(v);

        out[key] = v ?? '';
      });
      return out;
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PurchaseDocs');
    XLSX.writeFile(wb, `purchase_docs_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  const selectedWithoutWorkArea = useMemo(() => {
  return (selectedRows || []).filter((r) => !String(r.U_WorkAreaName || '').trim());
    }, [selectedRows]);

const canAssignWorkArea = selectedWithoutWorkArea.length > 0;
const selectedDocNumsWithoutWA = useMemo(() => {
return selectedWithoutWorkArea.map((r) => Number(r.DocNum)).filter((n) => Number.isFinite(n));
}, [selectedWithoutWorkArea]);
  const totals = useMemo(() => {
    const arr = selectedRows || [];
    return {
      count: arr.length,
      karobka: arr.reduce((s, r) => s + num(r.Karobka), 0),
      volume: arr.reduce((s, r) => s + num(r.Volume), 0),
      weight: arr.reduce((s, r) => s + num(r.Weight), 0),
    };
  }, [selectedRows]);

  const header = (
    <div className="flex flex-column gap-2">
      <div className="flex flex-wrap align-items-center justify-content-between gap-2">
        <div className="flex align-items-center gap-2">
          <span className="p-input-icon-left">
            <i className="pi pi-search" />
            <InputText
              value={globalFilterValue}
              onChange={(e) => onGlobalFilterChange(e.target.value)}
              placeholder="Поиск по всем колонкам..."
              style={{ width: 320 }}
            />
          </span>

          <MultiSelect
            value={visibleFields}
            options={columnToggleOptions}
            onChange={(e) => setVisibleFields(e.value || [])}
            placeholder="Колонки"
            display="chip"
            className="w-16rem"
          />
        </div>

        <div className="flex align-items-center gap-2">
            {canAssignWorkArea && (
            <Button
                label="Назначить зону"
                icon="pi pi-map-marker"
                severity="success"
                onClick={() => setAssignModalOpen(true)}
                tooltip={`Без зоны: ${selectedWithoutWorkArea.length}`}
            />
            )}
          <Button label={loading ? 'Загрузка...' : 'Обновить'} icon="pi pi-refresh" onClick={load} severity="secondary" disabled={loading} />
          <Button label="Excel" icon="pi pi-file-excel" onClick={exportExcel} />
        </div>
      </div>

      <div className="flex flex-wrap gap-3 align-items-center">
        <Tag value={`Выбрано: ${totals.count}`} />
        <Tag value={`Коробка: ${fmtNum(totals.karobka, 2)}`} severity="info" />
        <Tag value={`Объём: ${fmtNum(totals.volume, 3)}`} severity="success" />
        <Tag value={`Вес: ${fmtNum(totals.weight, 3)}`} severity="warning" />
      </div>
    </div>
  );

  return (
    <>
      <Toast ref={toast} />

      <Card title="Открытые закупки ">
        <DataTable
          ref={dtRef}
          value={rows}
          loading={loading}
          onRowDoubleClick={(e) => router.push(detailHref(e.data as PurchaseDocT))}
          dataKey="DocEntry"
          paginator
          rows={20}
          rowsPerPageOptions={[ 20, 50, 100]}
          stripedRows
          showGridlines
          resizableColumns
          columnResizeMode="expand"
          removableSort
          sortMode="multiple"
          filterDisplay="row"
          scrollHeight='570px'
          size='small'
          filters={filters}
          onFilter={(e) => setFilters(e.filters)}
          globalFilterFields={[
            'DocNum',
            'CardCode',
            'CardName',
            'DocDate',
            'DocDueDate',
            'Comments',
            'U_State',
            'U_DopStatus2',
            'SlpName',
            'U_WorkAreaName'
          ]}
          selectionMode="checkbox"
          selection={selectedRows}
          onSelectionChange={(e) => setSelectedRows(e.value as PurchaseDocT[])}
          header={header}
          emptyMessage="Нет данных"
          className="mt-2"
        >
          <Column selectionMode="multiple" headerStyle={{ width: '3rem' }} />

          {visibleColumns.map((c) => (
            <Column
              key={String(c.field)}
              field={String(c.field)}
              header={c.header}
              sortable={c.sortable}
              filter={c.filter}
              style={c.style}
              body={c.body as any}
              dataType={c.dataType as any}
            />
          ))}
        </DataTable>

        <Divider />
        <AssignWorkAreaModal
            visible={assignModalOpen}
            onHide={() => setAssignModalOpen(false)}
            docNums={selectedDocNumsWithoutWA}
            DocType="PurchaseDoc"
            onSubmit={async ({ workAreaDocEntry, docNums }) => {
                console.log('ASSIGN_WORKAREA =>', { workAreaDocEntry, docNums });

                toast.current?.show({
                severity: 'success',
                summary: 'Готово',
                detail: 'Назначение выведено в console.log (пока без API)',
                life: 2500,
                });
            }}
            />
      </Card>
    </>
  );
}
