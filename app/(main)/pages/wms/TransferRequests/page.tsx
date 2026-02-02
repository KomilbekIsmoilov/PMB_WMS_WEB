// src/app/(main)/pages/wms/TransferRequests/page.tsx
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
import { Divider } from 'primereact/divider';
import { FilterMatchMode } from 'primereact/api';
import api from '@/app/api/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Dropdown } from 'primereact/dropdown';
import { Calendar } from 'primereact/calendar';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';

import * as XLSX from 'xlsx';
import AssignWorkAreaModal, { WorkAreaOptionT } from '../../components/WorkAreaModal';


type TransferDocT = {
  DocNum: number;
  DocEntry: number;

  DocDate?: string | null;
  DocDueDate?: string | null;

  ToWhsCode?: string | null;
  ToWhsName?: string | null;

  Comments?: string | null;
  AssignedAt?: string | null;

  DocTime?: string | number | null; 
  CreateDate?: string | null;   
  DocDateObj?: Date | null;
  DocDueDateObj?: Date | null;
  SlpName?: string | null;        
  SlpCode?: number | string | null;

  BPLName?: string | null;
  U_State?: string | null;

  U_Checker?: number | string | null;
  lastName?: string | null;
  firstName?: string | null;

  U_WorkAreaName?: string | null;

  Volume?: number | null;
  Weight?: number | null;

  StartedAt?: string | null;
  FinishedAt?: string | null;
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

const buildZakazTushganDate = (createDate?: any, docTime?: any) => {
  if (!createDate) return null;

  const base = new Date(createDate);
  if (Number.isNaN(base.getTime())) return null;

  const hhmm = parseSapDocTimeToHHmm(docTime);
  if (!hhmm) return base; // time yo'q bo'lsa faqat sanani ko'rsatamiz

  const [hh, mm] = hhmm.split(':').map((x) => Number(x));
  const d = new Date(base);
  d.setHours(hh, mm, 0, 0);
  return d;
};

const fmtDuration = (ms: number) => {
  if (!Number.isFinite(ms) || ms <= 0) return '-';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m} мин`;
  return `${h} ч ${m} мин`;
};

const toDateObj = (v: any): Date | null => {
  const s = String(v ?? '').trim();
  if (!s) return null;

  const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s;

  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};


type ColDef = {
  field: keyof TransferDocT | 'actions';
  header: string;
  sortable?: boolean;
  filter?: boolean;
  style?: React.CSSProperties;
  body?: (row: TransferDocT) => React.ReactNode;
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

const fmtDateTime = (v: any) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString('ru-RU');
};

const normalizeState = (v: any) =>
  String(v ?? '')
    .toLowerCase()
    .trim()
    .replace(/[’`´]/g, "'")
    .replace(/\s+/g, ' ');

const stateRowClass = (state?: string | null) => {
  const s = normalizeState(state);
  if (!s) return '';

  if (s === "to'liq emas" || s === 'toliq emas' || s.includes("to'liq emas") || s.includes('toliq emas')) return 'bg-red-50';
  if (
    s === "yig'ib bo'lingan" ||
    s === 'yigib bolingan' ||
    s.includes("yig'ib bo") ||
    s.includes('yigib bo')
  )
    return 'bg-green-50';
  if (s === "yig'ilmoqda" || s === 'yigilmoqda' || s.includes("yig'ilmo") || s.includes('yigilmo')) return 'bg-yellow-50';
  if (s === 'yetkazilmoqda' || s.includes('yetkazilmo')) return 'bg-orange-50';
  if (s === 'yetkazildi' || s.includes('yetkazildi')) return 'bg-teal-50';
  if (s === 'yangi' || s.includes('yangi')) return 'bg-blue-50';

  return '';
};

const API_LIST = '/getTransferDocsApi';
const API_BULK_STATUS = '/updateTransferRequestsStatusApi';

export default function TransferRequestsPage() {
  const toast = useRef<Toast>(null);
  const dtRef = useRef<DataTable<TransferDocT[]>>(null);

  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<TransferDocT[]>([]);
  const [selectedRows, setSelectedRows] = useState<TransferDocT[]>([]);

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [managerFilter, setManagerFilter] = useState<string | null>(null);
  const [docDateFilter, setDocDateFilter] = useState<Date | null>(null);
  const [dueDateFilter, setDueDateFilter] = useState<Date | null>(null);

  const managerOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows || []) {
      const name = String(r.SlpName ?? '').trim();
      if (name) s.add(name);
    }
    return Array.from(s).sort().map((x) => ({ label: x, value: x }));
  }, [rows]);

  const setFieldFilter = (field: string, value: any, matchMode: any) => {
    setFilters((prev) => {
      const next: any = { ...(prev || {}) };
      if (!next.global) next.global = { value: globalFilterValue || null, matchMode: FilterMatchMode.CONTAINS };
      next[field] = { value: value ?? null, matchMode };
      return next;
    });
  };

const selectedDocEntries = useMemo(() => {
  return (selectedRows || [])
    .map((r) => Number(r.DocEntry))
    .filter((n) => Number.isFinite(n) && n > 0);
}, [selectedRows]);

const canChangeStatus = selectedDocEntries.length > 0;


const bulkSetStatus = async (status: string) => {
  try {
    if (!selectedDocEntries.length) return;

    await api.post(API_BULK_STATUS, {
      docEntries: selectedDocEntries,
      status,
    });

    toast.current?.show({
      severity: 'success',
      summary: 'Готово',
      detail: `Статус обновлён: ${status} (шт: ${selectedDocEntries.length})`,
      life: 2500,
    });

    await load(); 
  } catch (e: any) {
    toast.current?.show({
      severity: 'error',
      summary: 'Ошибка',
      detail: e?.response?.data?.message || 'Не удалось обновить статус',
      life: 3500,
    });
  }
};

const confirmBulkStatus = (status: string) => {
  if (!selectedDocEntries.length) return;

  confirmDialog({
    header: 'Подтверждение',
    icon: 'pi pi-exclamation-triangle',
    message: `Вы действительно хотите перевести выбранные документы (${selectedDocEntries.length} шт.) в статус "${status}"?`,
    acceptLabel: 'Да',
    rejectLabel: 'Нет',
    acceptClassName: 'p-button-warning',
    accept: () => bulkSetStatus(status),
  });
};



  const detailHref = React.useCallback((r: TransferDocT) => {
    const docEntry = encodeURIComponent(String(r.DocEntry));
    const docNum = encodeURIComponent(String(r.DocNum));
    return `/pages/wms/TransferRequestsDetail?DocEntry=${docEntry}&DocNum=${docNum}`;
  }, []);

  const [globalFilterValue, setGlobalFilterValue] = useState('');
const initFilters = (): DataTableFilterMeta => ({
  global: { value: null, matchMode: FilterMatchMode.CONTAINS },

  DocNum: { value: null, matchMode: FilterMatchMode.EQUALS },
  DocEntry: { value: null, matchMode: FilterMatchMode.EQUALS },
  ToWhsCode: { value: null, matchMode: FilterMatchMode.CONTAINS },
  ToWhsName: { value: null, matchMode: FilterMatchMode.CONTAINS },

  SlpName: { value: null, matchMode: FilterMatchMode.EQUALS },     
  DocDateObj: { value: null, matchMode: FilterMatchMode.DATE_IS },   
  DocDueDateObj: { value: null, matchMode: FilterMatchMode.DATE_IS }, 

  DocStatus: { value: null, matchMode: FilterMatchMode.CONTAINS },
  BPLName: { value: null, matchMode: FilterMatchMode.CONTAINS },
  Comments: { value: null, matchMode: FilterMatchMode.CONTAINS },
  U_State: { value: null, matchMode: FilterMatchMode.CONTAINS },
  U_Filial: { value: null, matchMode: FilterMatchMode.CONTAINS },
  U_WorkAreaName: { value: null, matchMode: FilterMatchMode.CONTAINS },

  sapStatus: { value: null, matchMode: FilterMatchMode.CONTAINS },
});

const [filters, setFilters] = useState<DataTableFilterMeta>(initFilters);



  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get(API_LIST);
      const data = (res?.data ?? res) as TransferDocT[];

      const normalized = (Array.isArray(data) ? data : []).map((r) => ({
        ...r,
        DocDateObj: toDateObj(r.DocDate),
        DocDueDateObj: toDateObj(r.DocDueDate),
      }));

      setRows(normalized);
      setSelectedRows([]);
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: e?.response?.data?.message || 'Не удалось загрузить заказы',
        life: 3500,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
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

      { field: 'ToWhsCode', header: 'Код склада', sortable: true, filter: true, dataType: 'text', style: { minWidth: 160 } },
      { field: 'ToWhsName', header: 'Склад назначения', sortable: true, filter: true, dataType: 'text', style: { minWidth: 260 } },
      {
        field: 'SlpName',
        header: 'Менеджер',
        sortable: true,
        filter: false,
        dataType: 'text',
        style: { minWidth: 200 },
        body: (r) => (r.SlpName ? <span className="font-medium">{r.SlpName}</span> : <span className="text-500">-</span>),
},


      {
        field: 'DocDate',
        header: 'Дата',
        sortable: true,
        filter: false,
        dataType: 'date',
        style: { minWidth: 140 },
        body: (r) => fmtDate(r.DocDate),
      },
      {
        field: 'DocDueDate',
        header: 'Срок',
        sortable: true,
        filter: false,
        dataType: 'date',
        style: { minWidth: 140 },
        body: (r) => fmtDate(r.DocDueDate),
      },
      {
        field: 'CreateDate',
        header: 'Заказ поступил',
        sortable: true,
        filter: false,
        dataType: 'date',
        style: { minWidth: 190 },
        body: (r) => {
            const d = buildZakazTushganDate(r.CreateDate, r.DocTime);
            return d ? d.toLocaleString('ru-RU') : <span className="text-500">-</span>;
        },
        },
      { field: 'BPLName', header: 'Филиал (BPL)', sortable: true, filter: true, dataType: 'text', style: { minWidth: 200 } },
      {
        field: 'U_State',
        header: 'State',
        sortable: true,
        filter: true,
        dataType: 'text',
        style: { minWidth: 160 },
        body: (r) => (r.U_State ? <Tag value={String(r.U_State)} /> : <Tag value="-" severity="secondary" />),
      },
      {
        field: 'U_Checker',
        header: 'Checker',
        sortable: true,
        filter: false,
        dataType: 'text',
        style: { minWidth: 220 },
        body: (r) => {
          const name = `${String(r.lastName || '').trim()} ${String(r.firstName || '').trim()}`.trim();
          const emp = String(r.U_Checker || '').trim();
          if (!name && !emp) return <span className="text-500">-</span>;
          return (
            <div className="flex flex-column">
              <span className="font-medium">{name || '-'}</span>
            </div>
          );
        },
      },
      { field: 'U_WorkAreaName', header: 'Зона', sortable: true, filter: true, dataType: 'text', style: { minWidth: 220 } },
      { field: 'Comments', header: 'Комментарий', sortable: true, filter: true, dataType: 'text', style: { minWidth: 280 } },
      {
        field: 'Volume',
        header: 'Объём',
        sortable: true,
        filter: false,
        dataType: 'numeric',
        style: { minWidth: 120, textAlign: 'right' },
        body: (r) => <span className="font-medium">{fmtNum(r.Volume, 3)}</span>,
      },
      {
        field: 'Weight',
        header: 'Вес',
        sortable: true,
        filter: false,
        dataType: 'numeric',
        style: { minWidth: 120, textAlign: 'right' },
        body: (r) => <span className="font-medium">{fmtNum(r.Weight, 3)}</span>,
      },

      {
        field: 'AssignedAt',
        header: 'Назначено',
        sortable: true,
        filter: false,
        dataType: 'date',
        style: { minWidth: 180 },
        body: (r : any) => (r.AssignedAt ? fmtDateTime(r.AssignedAt) : <span className="text-500">-</span>),
      },
      {
        field: 'StartedAt',
        header: 'Начато',
        sortable: true,
        filter: false,
        dataType: 'date',
        style: { minWidth: 180 },
        body: (r) => (r.StartedAt ? fmtDateTime(r.StartedAt) : <span className="text-500">-</span>),
      },
      {
        field: 'FinishedAt',
        header: 'Завершено',
        sortable: true,
        filter: false,
        dataType: 'date',
        style: { minWidth: 180 },
        body: (r) => (r.FinishedAt ? fmtDateTime(r.FinishedAt) : <span className="text-500">-</span>),
      },
    ],
    [detailHref]
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

  const totals = useMemo(() => {
    const arr = selectedRows || [];
    return {
      count: arr.length,
      volume: arr.reduce((s, r) => s + num(r.Volume), 0),
      weight: arr.reduce((s, r) => s + num(r.Weight), 0),
    };
  }, [selectedRows]);

  const selectedWithoutWorkArea = useMemo(() => {
    return (selectedRows || []).filter((r) => !String(r.U_WorkAreaName || '').trim());
  }, [selectedRows]);

  const canAssignWorkArea = selectedWithoutWorkArea.length > 0;

const selectedDocEntriesWithoutWA = useMemo(() => {
  return selectedWithoutWorkArea
    .map((r) => Number(r.DocEntry))
    .filter((n) => Number.isFinite(n) && n > 0);
}, [selectedWithoutWorkArea]);

  const exportExcel = () => {
    const processed = (dtRef.current as any)?.processedData as TransferDocT[] | undefined;
    const dataToExport = Array.isArray(processed) ? processed : rows;

    const exportRows = dataToExport.map((r) => {
      const out: Record<string, any> = {};
      visibleColumns.forEach((c) => {
        const header = c.header;
        const field = c.field as keyof TransferDocT;
        let v: any = (r as any)[field];

        if (field === 'DocDate' || field === 'DocDueDate') v = fmtDate(v);
        if (field === 'AssignedAt' || field === 'StartedAt' || field === 'FinishedAt') v = fmtDateTime(v);

        if (field === 'Volume' || field === 'Weight') v = num(v);

        out[header] = v ?? '';
      });
      return out;
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transfers');
    XLSX.writeFile(wb, `transfer_requests_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const header = (
    <div className="flex flex-column gap-2">
      <div className="flex flex-wrap align-items-center justify-content-between gap-2">
<div className="flex align-items-center gap-2 flex-wrap">
  <Dropdown
    value={managerFilter}
    options={managerOptions}
    onChange={(e) => {
      const v = e.value ?? null;
      setManagerFilter(v);
      setFieldFilter('SlpName', v, FilterMatchMode.EQUALS);
    }}
    placeholder="Менеджер"
    showClear
    style={{ width: 220 }}
  />

  <Calendar
    value={docDateFilter}
    onChange={(e) => {
      const v = (e.value as Date) ?? null;
      setDocDateFilter(v);
      setFieldFilter('DocDateObj', v, FilterMatchMode.DATE_IS);
    }}
    dateFormat="dd.mm.yy"
    placeholder="Дата"
    showIcon
    showButtonBar
  />

  <Calendar
    value={dueDateFilter}
    onChange={(e) => {
      const v = (e.value as Date) ?? null;
      setDueDateFilter(v);
      setFieldFilter('DocDueDateObj', v, FilterMatchMode.DATE_IS);
    }}
    dateFormat="dd.mm.yy"
    placeholder="Срок"
    showIcon
    showButtonBar
  />

  <Button
    label="Сброс"
    icon="pi pi-times"
    severity="secondary"
    outlined
    onClick={() => {
      setManagerFilter(null);
      setDocDateFilter(null);
      setDueDateFilter(null);
      setGlobalFilterValue('');
      setFilters(initFilters());
    }}
  />
</div>


        <div className="flex align-items-center gap-2">
        {canChangeStatus && (
            <Button
              label="To‘liq emas"
              icon="pi pi-exclamation-triangle"
              severity="warning"
              onClick={() => confirmBulkStatus("To'liq emas")}
              tooltip={`Выбрано: ${selectedDocEntries.length}`}
            />
          )}
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
        <Tag value={`Объём: ${fmtNum(totals.volume, 3)}`} severity="success" />
        <Tag value={`Вес: ${fmtNum(totals.weight, 3)}`} severity="warning" />
      </div>
    </div>
  );

  return (
    <>
      <Toast ref={toast} />
        <ConfirmDialog />
      <Card title="Запросы на перемещение">
        <DataTable
          ref={dtRef}
          value={rows}
          loading={loading}
          onRowDoubleClick={(e) => router.push(detailHref(e.data as TransferDocT))}
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
          rowClassName={(r) => stateRowClass(r.U_State)}
          onFilter={(e) => {
            setFilters((prev) => {
              const next: any = { ...(e.filters || {}) };
              if (!next.global) next.global = prev?.global || { value: globalFilterValue || null, matchMode: FilterMatchMode.CONTAINS };
              return next;
            });
          }}

         globalFilterFields={[
            'DocDateObj',
            'DocDueDateObj',
            'DocNum',
            'ToWhsCode',
            'ToWhsName',
            'Comments',
            'U_State',
            'BPLName',
            'U_WorkAreaName',
            'SlpName',
            'CreateDate',
            ]}
          selectionMode="checkbox"
          selection={selectedRows}
          onSelectionChange={(e) => setSelectedRows(e.value as TransferDocT[])}
          header={header}
          emptyMessage="Нет данных"
          className="mt-2"
        >
          <Column selectionMode="multiple" headerStyle={{ width: '3rem' }} />
          <Column field="DocDateObj" hidden dataType="date" />
          <Column field="DocDueDateObj" hidden dataType="date" />
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
          DocType="SalesOrder"
          onSubmit={async ({ workAreaDocEntry, docNums }) => {
            try { 
              await api.post('/updateTransfersworkArea', { workAreaDocEntry, docNums })

            console.log('ASSIGN_WORKAREA_ORDERS =>', { workAreaDocEntry, docNums });

            toast.current?.show({
              severity: 'success',
              summary: 'Готово',
              detail: 'Назначение выведено в console.log (пока без API)',
              life: 2500,
            });
            } catch (error : any) {
              console.log('ERROR_ASSIGN_WORKAREA_ORDERS =>', error);
              toast.current?.show({
                severity: 'error',
                summary: 'Ошибка',
                detail: error.response?.data?.error.error.message.value || 'Не удалось назначить рабочую зону',
                life: 3500,
              });
            }
           
          }}
        />
      </Card>
    </>
  );
}
