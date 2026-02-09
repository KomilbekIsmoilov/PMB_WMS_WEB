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
import { Dropdown } from 'primereact/dropdown';
import { Calendar } from 'primereact/calendar';
import { Dialog } from 'primereact/dialog';
import { Message } from 'primereact/message';

import api from '@/app/api/api';
import * as XLSX from 'xlsx';

type DeliveryLogT = {
  status?: string | null;
  StartedAt?: string | null;
  CompletedAt?: string | null;
};

type DeliveryDocT = {
  DocType?: string | null;
  ObjType?: string | number | null;
  DocNum?: number | null;
  DocEntry?: number | null;

  DocDate?: string | null;
  DocDueDate?: string | null;

  CardCode?: string | null;
  CardName?: string | null;

  SlpName?: string | null;
  U_State?: string | null;

  Volume?: number | null;
  Weight?: number | null;
  TotalVolume?: number | null;
  TotalWeight?: number | null;
  TotalQty?: number | null;

  deliveryLog?: DeliveryLogT | null;

  // derived for filters
  DocDateObj?: Date | null;
  DocDueDateObj?: Date | null;

  StartedAt?: string | null;
  CompletedAt?: string | null;
};

type DriverOptionT = { id: number; name: string };

type ColDef = {
  field: keyof DeliveryDocT | 'actions';
  header: string;
  sortable?: boolean;
  filter?: boolean;
  style?: React.CSSProperties;
  body?: (row: DeliveryDocT) => React.ReactNode;
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

const toDateObj = (v: any): Date | null => {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

const normalizeState = (v: any) =>
  String(v ?? '')
    .toLowerCase()
    .trim()
    .replace(/[вЂ™`Вґ]/g, "'")
    .replace(/\s+/g, ' ');

const getStatusText = (r: DeliveryDocT) =>
  String(r.deliveryLog?.status ?? (r as any).Status ?? r.U_State ?? '').trim();

const statusRowClass = (r: DeliveryDocT) => {
  const s = normalizeState(getStatusText(r));
  if (!s) return '';
  if (s.includes('ошиб') || s.includes('error') || s.includes('fail')) return 'bg-red-50';
  if (s.includes('достав') || s.includes('done') || s.includes('complete') || s.includes("yig'ib bo")) return 'bg-green-50';
  if (s.includes('в пути') || s.includes('in progress') || s.includes("yig'il") || s.includes('yigil')) return 'bg-yellow-50';
  if (s.includes('назнач') || s.includes('assigned')) return 'bg-blue-50';
  if (s.includes('отмен') || s.includes('cancel')) return 'bg-gray-100';
  return '';
};

const OBJ_DELIVERY = 15;
const OBJ_TRANSFER_REQUEST = 67;

export default function DeliveryDocsPage() {
  const toast = useRef<Toast>(null);
  const dtRef = useRef<DataTable<DeliveryDocT[]>>(null);
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<DeliveryDocT[]>([]);
  const [selectedRows, setSelectedRows] = useState<DeliveryDocT[]>([]);

  const [globalFilterValue, setGlobalFilterValue] = useState('');
  const initFilters = (): DataTableFilterMeta => ({
    global: { value: null, matchMode: FilterMatchMode.CONTAINS },
    DocNum: { value: null, matchMode: FilterMatchMode.EQUALS },
    CardCode: { value: null, matchMode: FilterMatchMode.CONTAINS },
    CardName: { value: null, matchMode: FilterMatchMode.CONTAINS },
    SlpName: { value: null, matchMode: FilterMatchMode.EQUALS },
    U_State: { value: null, matchMode: FilterMatchMode.CONTAINS },
    DocType: { value: null, matchMode: FilterMatchMode.EQUALS },
    DocDateObj: { value: null, matchMode: FilterMatchMode.DATE_IS },
    DocDueDateObj: { value: null, matchMode: FilterMatchMode.DATE_IS },
  });
  const [filters, setFilters] = useState<DataTableFilterMeta>(initFilters);

  const [managerFilter, setManagerFilter] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [docDateFilter, setDocDateFilter] = useState<Date | null>(null);
  const [dueDateFilter, setDueDateFilter] = useState<Date | null>(null);

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [driversLoading, setDriversLoading] = useState(false);
  const [drivers, setDrivers] = useState<DriverOptionT[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<DriverOptionT | null>(null);
  const [assigning, setAssigning] = useState(false);

  const detailHref = useCallback((r: DeliveryDocT) => {
    const docEntry = encodeURIComponent(String(r.DocEntry ?? ''));
    const docNum = encodeURIComponent(String(r.DocNum ?? ''));
    const rawObjType = Number(r.ObjType);
    const type = String(r.DocType ?? '').toUpperCase();
    const resolvedObjType = Number.isFinite(rawObjType)
      ? rawObjType
      : type === 'TRANSFER'
      ? OBJ_TRANSFER_REQUEST
      : OBJ_DELIVERY;
    const objType = encodeURIComponent(String(resolvedObjType));
    const docType = encodeURIComponent(String(r.DocType ?? ''));
    return `/pages/wms/DeliveryDocsDetail?DocEntry=${docEntry}&DocNum=${docNum}&ObjType=${objType}&DocType=${docType}`;
  }, []);

  const setFieldFilter = (field: string, value: any, matchMode: any) => {
    setFilters((prev) => {
      const next: any = { ...(prev || {}) };
      if (!next.global) next.global = { value: globalFilterValue || null, matchMode: FilterMatchMode.CONTAINS };
      next[field] = { value: value ?? null, matchMode };
      return next;
    });
  };

  const normalizeRows = (list: any[]): DeliveryDocT[] =>
    (Array.isArray(list) ? list : []).map((r: any) => {
      const log: DeliveryLogT | null = r?.deliveryLog || null;
      const type = String(r?.DocType ?? '').toUpperCase();
      const isTransfer = type === 'TRANSFER';
      const cardCode = isTransfer ? r?.ToWhsCode : r?.CardCode;
      const cardName = isTransfer ? r?.ToWhsName : r?.CardName;

      return {
        ...r,
        DocType: r?.DocType ?? null,
        CardCode: cardCode ?? null,
        CardName: cardName ?? null,
        DocDateObj: toDateObj(r?.DocDate),
        DocDueDateObj: toDateObj(r?.DocDueDate),
        StartedAt: log?.StartedAt ?? null,
        CompletedAt: log?.CompletedAt ?? null,
      };
    });

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get('/getDeliveryDocsApi');
      const data = (res?.data ?? res) as DeliveryDocT[];
      setRows(normalizeRows(data as any));
      setSelectedRows([]);
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: e?.response?.data?.message || 'Не удалось загрузить доставку',
        life: 3500,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const loadDrivers = async () => {
    try {
      setDriversLoading(true);
      const res = await api.get('/getDeliveryDriversApi');
      const data = (res?.data ?? res) as any[];
      const list: DriverOptionT[] = (Array.isArray(data) ? data : [])
        .map((x) => ({
          id: Number(x.id ?? x.driverId ?? x.DriverID ?? x.EmpID ?? x.empID ?? 0),
          name: String(x.fullName ?? x.FullName ?? x.name ?? x.DriverName ?? '').trim(),
        }))
        .filter((x) => Number.isFinite(x.id) && x.id > 0 && x.name);
      setDrivers(list);
      if (list.length === 1) setSelectedDriver(list[0]);
    } catch {
      setDrivers([]);
    } finally {
      setDriversLoading(false);
    }
  };

  useEffect(() => {
    if (!assignModalOpen) return;
    loadDrivers();
    setSelectedDriver(null);
  }, [assignModalOpen]);

  const managerOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows || []) {
      const name = String(r.SlpName ?? '').trim();
      if (name) s.add(name);
    }
    return Array.from(s).sort().map((x) => ({ label: x, value: x }));
  }, [rows]);

  const stateOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows || []) {
      const name = String(r.U_State ?? '').trim();
      if (name) s.add(name);
    }
    return Array.from(s).sort().map((x) => ({ label: x, value: x }));
  }, [rows]);

  const typeOptions = useMemo(
    () => [
      { label: 'Перемещение', value: 'TRANSFER' },
      { label: 'Заказ', value: 'ORDER' },
    ],
    []
  );

  const totals = useMemo(() => {
    const arr = selectedRows || [];
    return {
      count: arr.length,
      volume: arr.reduce((s, r) => s + num(r.Volume ?? r.TotalVolume), 0),
      weight: arr.reduce((s, r) => s + num(r.Weight ?? r.TotalWeight), 0),
    };
  }, [selectedRows]);

  const selectedDocEntries = useMemo(
    () => (selectedRows || []).map((r) => Number(r.DocEntry)).filter((n) => Number.isFinite(n) && n > 0),
    [selectedRows]
  );

  const selectedDocNums = useMemo(
    () => (selectedRows || []).map((r) => Number(r.DocNum)).filter((n) => Number.isFinite(n) && n > 0),
    [selectedRows]
  );

  const canAssignDriver = selectedDocEntries.length > 0;

  const assignDriver = async () => {
    if (!selectedDriver) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Проверка',
        detail: 'Выберите доставщика',
        life: 2500,
      });
      return;
    }
    if (!selectedDocEntries.length) return;

    try {
      setAssigning(true);
      await api.post('/assignDeliveryDriverApi', {
        docEntries: selectedDocEntries,
        driverId: selectedDriver.id,
        driverName: selectedDriver.name,
      });

      toast.current?.show({
        severity: 'success',
        summary: 'Готово',
        detail: `Назначено: ${selectedDocEntries.length}`,
        life: 2500,
      });

      setAssignModalOpen(false);
      await load();
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: e?.response?.data?.message || 'Не удалось назначить доставщика',
        life: 3500,
      });
    } finally {
      setAssigning(false);
    }
  };

  const exportExcel = () => {
    const processed = (dtRef.current as any)?.processedData as DeliveryDocT[] | undefined;
    const dataToExport = Array.isArray(processed) ? processed : rows;

    const exportRows = dataToExport.map((r) => {
      const out: Record<string, any> = {};
      visibleColumns.forEach((c) => {
        const header = c.header;
        const field = c.field as keyof DeliveryDocT;
        let v: any = (r as any)[field];
        if (field === 'DocDate' || field === 'DocDueDate') v = fmtDate(v);
        if (field === 'StartedAt' || field === 'CompletedAt') v = fmtDateTime(v);
        if (field === 'Volume' || field === 'Weight' || field === 'TotalVolume' || field === 'TotalWeight' || field === 'TotalQty') v = num(v);
        out[header] = v ?? '';
      });
      return out;
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DeliveryDocs');
    XLSX.writeFile(wb, `delivery_docs_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const allColumns: ColDef[] = useMemo(
    () => [
      {
        field: 'DocType',
        header: 'Тип',
        sortable: true,
        filter: true,
        dataType: 'text',
        style: { minWidth: 90 },
        body: (r) => {
          const t = String(r.DocType ?? '').toUpperCase();
          const label = t === 'TRANSFER' ? 'Перемещение' : t === 'ORDER' ? 'Заказ' : t || '-';
          return <Tag value={label} />;
        },
      },
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
      { field: 'CardCode', header: 'Код', sortable: true, filter: true, dataType: 'text', style: { minWidth: 160 } },
      { field: 'CardName', header: 'Наименование', sortable: true, filter: true, dataType: 'text', style: { minWidth: 240 } },
      {
        field: 'SlpName',
        header: 'Менеджер',
        sortable: true,
        filter: true,
        dataType: 'text',
        style: { minWidth: 200 },
        body: (r) => (r.SlpName ? <span className="font-medium">{r.SlpName}</span> : <span className="text-500">-</span>),
      },
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
        field: 'StartedAt',
        header: 'Начато',
        sortable: true,
        filter: false,
        dataType: 'date',
        style: { minWidth: 180 },
        body: (r) => (r.StartedAt ? fmtDateTime(r.StartedAt) : <span className="text-500">-</span>),
      },
      {
        field: 'CompletedAt',
        header: 'Завершено',
        sortable: true,
        filter: false,
        dataType: 'date',
        style: { minWidth: 180 },
        body: (r) => (r.CompletedAt ? fmtDateTime(r.CompletedAt) : <span className="text-500">-</span>),
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

  const header = (
    <div className="flex flex-column gap-2">
      <div className="flex flex-wrap align-items-center justify-content-between gap-2">
        <div className="flex align-items-center gap-2 flex-wrap">
          <Dropdown
            value={typeFilter}
            options={typeOptions}
            onChange={(e) => {
              const v = e.value ?? null;
              setTypeFilter(v);
              setFieldFilter('DocType', v, FilterMatchMode.EQUALS);
            }}
            placeholder="Тип"
            showClear
            style={{ width: 140 }}
          />

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

          <Dropdown
            value={stateFilter}
            options={stateOptions}
            onChange={(e) => {
              const v = e.value ?? null;
              setStateFilter(v);
              setFieldFilter('U_State', v, FilterMatchMode.CONTAINS);
            }}
            placeholder="State"
            showClear
            style={{ width: 180 }}
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
              setTypeFilter(null);
              setManagerFilter(null);
              setStateFilter(null);
              setDocDateFilter(null);
              setDueDateFilter(null);
              setGlobalFilterValue('');
              setFilters(initFilters());
            }}
          />
        </div>

        <div className="flex align-items-center gap-2">
          {canAssignDriver && (
            <Button
              label="Назначить доставщика"
              icon="pi pi-user-plus"
              severity="success"
              onClick={() => setAssignModalOpen(true)}
              tooltip={`Выбрано: ${selectedDocEntries.length}`}
            />
          )}
          <Button label={loading ? 'Загрузка...' : 'Обновить'} icon="pi pi-refresh" onClick={load} severity="secondary" disabled={loading} />
          <Button label="Excel" icon="pi pi-file-excel" onClick={exportExcel} />
        </div>
      </div>

      <div className="flex flex-wrap align-items-center justify-content-between gap-2">
        <div className="flex flex-wrap gap-3 align-items-center">
          <Tag value={`Выбрано: ${totals.count}`} />
          <Tag value={`Объём: ${fmtNum(totals.volume, 3)}`} severity="success" />
          <Tag value={`Вес: ${fmtNum(totals.weight, 3)}`} severity="warning" />
        </div>

        <div className="flex align-items-center gap-2">
          <span className="p-input-icon-left">
            <i className="pi pi-search" />
            <InputText
              value={globalFilterValue}
              onChange={(e) => {
                const v = e.target.value;
                setGlobalFilterValue(v);
                const next = { ...filters };
                (next['global'] as any).value = v;
                setFilters(next);
              }}
              placeholder="Поиск..."
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
      </div>
    </div>
  );

  return (
    <>
      <Toast ref={toast} />

      <Card title="Доставка (документы)">
        <DataTable
          ref={dtRef}
          value={rows}
          loading={loading}
          onRowDoubleClick={(e) => router.push(detailHref(e.data as DeliveryDocT))}
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
          rowClassName={statusRowClass}
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
            'CardCode',
            'CardName',
            'U_State',
            'SlpName',
            'DocType',
          ]}
          selectionMode="checkbox"
          selection={selectedRows}
          onSelectionChange={(e) => setSelectedRows(e.value as DeliveryDocT[])}
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
      </Card>

      <Dialog
        header="Назначить доставщика"
        visible={assignModalOpen}
        onHide={() => setAssignModalOpen(false)}
        style={{ width: '40rem', maxWidth: '95vw' }}
        modal
        draggable={false}
        resizable={false}
      >
        <div className="flex flex-column gap-3">
          <Message severity="info" text={`Документов: ${selectedDocEntries.length}. DocNum: ${selectedDocNums.join(', ')}`} />

          <div>
            <label className="block mb-2">Доставщик</label>
            <Dropdown
              value={selectedDriver}
              options={drivers}
              optionLabel="name"
              placeholder={driversLoading ? 'Загрузка...' : 'Выберите доставщика'}
              onChange={(e) => setSelectedDriver(e.value)}
              filter
              showClear
              className="w-full"
              disabled={driversLoading}
            />
            <small className="text-600">Список доставщиков загружается из справочника.</small>
          </div>

          <div className="flex justify-content-end gap-2">
            <Button label="Отмена" icon="pi pi-times" severity="secondary" onClick={() => setAssignModalOpen(false)} disabled={assigning} />
            <Button label="Назначить" icon="pi pi-check" severity="success" onClick={assignDriver} loading={assigning} disabled={!selectedDriver || assigning} />
          </div>
        </div>
      </Dialog>
    </>
  );
}
