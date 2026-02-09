'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { Card } from 'primereact/card';
import { Toast } from 'primereact/toast';
import { DataTable, DataTableFilterMeta } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import { MultiSelect } from 'primereact/multiselect';
import { Divider } from 'primereact/divider';
import { FilterMatchMode } from 'primereact/api';

import api from '@/app/api/api';
import AssignWorkAreaModal from '../../pages/components/WorkAreaModal';

type SalesReturnDocT = {
  DocNum?: number | null;
  DocEntry?: number | null;
  DocDate?: string | null;
  DocDueDate?: string | null;
  CardCode?: string | null;
  CardName?: string | null;
  Comments?: string | null;
  U_State?: string | null;
  U_WorkArea?: number | string | null;
  U_WorkAreaName?: string | null;
  SlpCode?: number | string | null;
  SlpName?: string | null;
  Volume?: number | null;
  Weight?: number | null;
  TotalQty?: number | null;
};

type ColDef = {
  field: keyof SalesReturnDocT;
  header: string;
  sortable?: boolean;
  filter?: boolean;
  style?: React.CSSProperties;
  body?: (row: SalesReturnDocT) => React.ReactNode;
  dataType?: 'text' | 'numeric' | 'date';
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmtNum = (v: unknown, digits = 2) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(num(v));

const fmtDate = (v: unknown) => {
  if (!v) return '';
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('ru-RU');
};

const normalizeState = (v: unknown) =>
  String(v ?? '')
    .toLowerCase()
    .trim()
    .replace(/[вЂ™`Вґ]/g, "'")
    .replace(/\s+/g, ' ');

const rowStateClass = (state?: string | null) => {
  const s = normalizeState(state);
  if (!s) return '';

  if (s.includes("yig'ib bo") || s.includes('yigib bo') || s.includes('closed')) return 'bg-green-50';
  if (s.includes("yig'il") || s.includes('yigil') || s.includes('process')) return 'bg-yellow-50';
  if (s.includes('new') || s.includes('yangi')) return 'bg-blue-50';
  return '';
};

export default function ReturnsPage() {
  const toast = useRef<Toast>(null);
  const dtRef = useRef<DataTable<SalesReturnDocT[]>>(null);
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<SalesReturnDocT[]>([]);
  const [selectedRows, setSelectedRows] = useState<SalesReturnDocT[]>([]);
  const [assignModalOpen, setAssignModalOpen] = useState(false);

  const [globalFilterValue, setGlobalFilterValue] = useState('');
  const [filters, setFilters] = useState<DataTableFilterMeta>({
    global: { value: null, matchMode: FilterMatchMode.CONTAINS },
    DocNum: { value: null, matchMode: FilterMatchMode.EQUALS },
    CardCode: { value: null, matchMode: FilterMatchMode.CONTAINS },
    CardName: { value: null, matchMode: FilterMatchMode.CONTAINS },
    U_State: { value: null, matchMode: FilterMatchMode.CONTAINS },
    SlpName: { value: null, matchMode: FilterMatchMode.CONTAINS },
    U_WorkAreaName: { value: null, matchMode: FilterMatchMode.CONTAINS },
  });

  const detailHref = useCallback((r: SalesReturnDocT) => {
    const docEntry = encodeURIComponent(String(r.DocEntry ?? ''));
    const docNum = encodeURIComponent(String(r.DocNum ?? ''));
    return `/wms/returns/detail?DocEntry=${docEntry}&DocNum=${docNum}`;
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
            <Link href={detailHref(r)} aria-label="Open" className="text-500 hover:text-primary">
              <i className="pi pi-external-link" />
            </Link>
          </div>
        ),
      },
      { field: 'DocDate', header: 'Date', sortable: true, filter: true, dataType: 'date', style: { minWidth: 130 }, body: (r) => fmtDate(r.DocDate) },
      { field: 'DocDueDate', header: 'Due', sortable: true, filter: true, dataType: 'date', style: { minWidth: 130 }, body: (r) => fmtDate(r.DocDueDate) },
      { field: 'CardCode', header: 'CardCode', sortable: true, filter: true, dataType: 'text', style: { minWidth: 150 } },
      { field: 'CardName', header: 'CardName', sortable: true, filter: true, dataType: 'text', style: { minWidth: 220 } },
      { field: 'SlpName', header: 'Manager', sortable: true, filter: true, dataType: 'text', style: { minWidth: 170 } },
      { field: 'U_WorkAreaName', header: 'WorkArea', sortable: true, filter: true, dataType: 'text', style: { minWidth: 180 } },
      {
        field: 'U_State',
        header: 'State',
        sortable: true,
        filter: true,
        dataType: 'text',
        style: { minWidth: 140 },
        body: (r) => (r.U_State ? <Tag value={String(r.U_State)} /> : <Tag value="-" severity="secondary" />),
      },
      { field: 'TotalQty', header: 'Qty', sortable: true, filter: true, dataType: 'numeric', style: { minWidth: 110, textAlign: 'right' }, body: (r) => fmtNum(r.TotalQty, 2) },
      { field: 'Volume', header: 'Volume', sortable: true, filter: true, dataType: 'numeric', style: { minWidth: 110, textAlign: 'right' }, body: (r) => fmtNum(r.Volume, 3) },
      { field: 'Weight', header: 'Weight', sortable: true, filter: true, dataType: 'numeric', style: { minWidth: 110, textAlign: 'right' }, body: (r) => fmtNum(r.Weight, 3) },
      { field: 'Comments', header: 'Comments', sortable: true, filter: true, dataType: 'text', style: { minWidth: 240 } },
    ],
    [detailHref]
  );

  const [visibleFields, setVisibleFields] = useState<string[]>(() => allColumns.map((c) => String(c.field)));

  const visibleColumns = useMemo(() => {
    const set = new Set(visibleFields);
    return allColumns.filter((c) => set.has(String(c.field)));
  }, [allColumns, visibleFields]);

  const columnToggleOptions = useMemo(
    () => allColumns.map((c) => ({ label: c.header, value: String(c.field) })),
    [allColumns]
  );

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get('/getSalesReturnDocsApi');
      setRows((res?.data ?? res) as SalesReturnDocT[]);
      setSelectedRows([]);
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

  const selectedWithoutWorkArea = useMemo(
    () => (selectedRows || []).filter((r) => !String(r.U_WorkAreaName || '').trim()),
    [selectedRows]
  );

  const canAssignWorkArea = selectedWithoutWorkArea.length > 0;

  const selectedDocEntriesWithoutWA = useMemo(
    () => selectedWithoutWorkArea.map((r) => Number(r.DocEntry)).filter((n) => Number.isFinite(n) && n > 0),
    [selectedWithoutWorkArea]
  );

  const totals = useMemo(() => {
    const arr = selectedRows || [];
    return {
      count: arr.length,
      qty: arr.reduce((s, r) => s + num(r.TotalQty), 0),
      volume: arr.reduce((s, r) => s + num(r.Volume), 0),
      weight: arr.reduce((s, r) => s + num(r.Weight), 0),
    };
  }, [selectedRows]);

  const exportExcel = () => {
    const processed = (dtRef.current as any)?.processedData as SalesReturnDocT[] | undefined;
    const dataToExport = Array.isArray(processed) ? processed : rows;
    const exportRows = dataToExport.map((r) => {
      const out: Record<string, any> = {};
      visibleColumns.forEach((c) => {
        const key = c.header;
        const field = c.field as keyof SalesReturnDocT;
        let v: any = (r as any)[field];
        if (field === 'DocDate' || field === 'DocDueDate') v = fmtDate(v);
        if (field === 'TotalQty' || field === 'Volume' || field === 'Weight') v = num(v);
        out[key] = v ?? '';
      });
      return out;
    });

    import('xlsx').then((XLSX) => {
      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'SalesReturns');
      XLSX.writeFile(wb, `sales_returns_${new Date().toISOString().slice(0, 10)}.xlsx`);
    });
  };

  const header = (
    <div className="flex flex-column gap-2">
      <div className="flex flex-wrap align-items-center justify-content-between gap-2">
        <div className="flex align-items-center gap-2">
          <span className="p-input-icon-left">
            <i className="pi pi-search" />
            <InputText
              value={globalFilterValue}
              onChange={(e) => {
                const v = e.target.value;
                setGlobalFilterValue(v);
                const next = { ...filters };
                (next.global as { value: string | null }).value = v;
                setFilters(next);
              }}
              placeholder="Search..."
              style={{ width: 320 }}
            />
          </span>

          <MultiSelect
            value={visibleFields}
            options={columnToggleOptions}
            onChange={(e) => setVisibleFields((e.value || []) as string[])}
            placeholder="Columns"
            display="chip"
            className="w-16rem"
          />
        </div>

        <div className="flex align-items-center gap-2">
          {canAssignWorkArea && (
            <Button
              label="Assign WorkArea"
              icon="pi pi-map-marker"
              severity="success"
              onClick={() => setAssignModalOpen(true)}
              tooltip={`Without zone: ${selectedWithoutWorkArea.length}`}
            />
          )}
          <Button label={loading ? 'Loading...' : 'Refresh'} icon="pi pi-refresh" onClick={load} severity="secondary" disabled={loading} />
          <Button label="Excel" icon="pi pi-file-excel" onClick={exportExcel} />
        </div>
      </div>

      <div className="flex flex-wrap gap-3 align-items-center">
        <Tag value={`Selected: ${totals.count}`} />
        <Tag value={`Qty: ${fmtNum(totals.qty, 2)}`} severity="info" />
        <Tag value={`Volume: ${fmtNum(totals.volume, 3)}`} severity="success" />
        <Tag value={`Weight: ${fmtNum(totals.weight, 3)}`} severity="warning" />
      </div>
    </div>
  );

  return (
    <>
      <Toast ref={toast} />

      <Card title="Sales Returns">
        <DataTable
          ref={dtRef}
          value={rows}
          loading={loading}
          onRowDoubleClick={(e) => router.push(detailHref(e.data as SalesReturnDocT))}
          dataKey="DocEntry"
          paginator
          rows={20}
          rowsPerPageOptions={[20, 50, 100]}
          stripedRows
          showGridlines
          resizableColumns
          columnResizeMode="expand"
          removableSort
          sortMode="multiple"
          filterDisplay="row"
          scrollHeight="570px"
          size="small"
          filters={filters}
          rowClassName={(r) => rowStateClass((r as SalesReturnDocT).U_State)}
          onFilter={(e) => setFilters(e.filters)}
          globalFilterFields={[
            'DocNum',
            'CardCode',
            'CardName',
            'DocDate',
            'DocDueDate',
            'Comments',
            'U_State',
            'SlpName',
            'U_WorkAreaName',
          ]}
          selectionMode="checkbox"
          selection={selectedRows}
          onSelectionChange={(e) => setSelectedRows(e.value as SalesReturnDocT[])}
          header={header}
          emptyMessage="No data"
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
          docNums={selectedDocEntriesWithoutWA}
          DocType="SalesReturn"
          onSubmit={async ({ workAreaDocEntry, docNums, collectorEmpIDs }) => {
            try {
              await api.post('/updateSalesReturnWorkAreaApi', { workAreaDocEntry, docNums, collectorEmpIDs });
              toast.current?.show({ severity: 'success', summary: 'Done', detail: `Assigned: ${docNums.length}`, life: 2500 });
              await load();
            } catch (error: any) {
              toast.current?.show({
                severity: 'error',
                summary: 'Error',
                detail: error?.response?.data?.message || error?.response?.data?.error?.error?.message?.value || 'Failed to assign work area',
                life: 3500,
              });
            }
          }}
        />
      </Card>
    </>
  );
}

