'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import { DataTable, DataTableFilterMeta } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { Dropdown } from 'primereact/dropdown';
import { Tag } from 'primereact/tag';
import { FilterMatchMode } from 'primereact/api';
import { Toast } from 'primereact/toast';
import api from '@/app/api/api';

export type ItemPickerRowT = {
  ItemCode: string;
  ItemName?: string | null;
  WhsCode?: string | null;
  WhsName?: string | null;
  OnHand?: number | string | null;
  UomCode?: string | null;
  Barcode?: string | null;
  uiKey?: string;
};

export type PickedItemT = {
  ItemCode: string;
  ItemName?: string | null;
  WhsCode?: string | null;
  WhsName?: string | null;
  Quantity: number;
  OnHand?: number | string | null;
  UomCode?: string | null;
  Barcode?: string | null;
};

type ItemsPickerModalProps = {
  visible: boolean;
  onHide: () => void;
  title?: string;
  endpoint: string;
  params?: Record<string, any>;
  onSubmit: (items: PickedItemT[]) => Promise<void> | void;
  preselected?: PickedItemT[];
};

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const unwrap = <T,>(res: any): T => {
  if (res && typeof res === 'object' && 'data' in res) return res.data as T;
  return res as T;
};

const buildKey = (r: ItemPickerRowT) => `${String(r.ItemCode || '').trim()}|||${String(r.WhsCode || '').trim()}`;

export default function ItemsPickerModal({
  visible,
  onHide,
  title = 'Выбор товаров',
  endpoint,
  params,
  onSubmit,
  preselected,
}: ItemsPickerModalProps) {
  const toast = useRef<Toast>(null);
  const dtRef = useRef<DataTable<ItemPickerRowT[]>>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<ItemPickerRowT[]>([]);
  const [selectedRows, setSelectedRows] = useState<ItemPickerRowT[]>([]);
  const [selectedWhs, setSelectedWhs] = useState<string>('');

  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});

  const [globalFilterValue, setGlobalFilterValue] = useState('');
  const [filters, setFilters] = useState<DataTableFilterMeta>({
    global: { value: null, matchMode: FilterMatchMode.CONTAINS },
  });

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get('/getItemsApi', { params });
      const data = unwrap<ItemPickerRowT[]>(res) || [];
      const normalized = data.map((r) => ({ ...r, uiKey: buildKey(r) }));
      setRows(normalized);

      const whsOptions = Array.from(
        new Map(
          normalized
            .filter((r) => String(r.WhsCode || '').trim())
            .map((r) => [String(r.WhsCode || '').trim(), r])
        ).values()
      );
      if (preselected?.length) {
        const preMap = new Map(preselected.map((p) => [buildKey(p), p]));
        const nextSelected = normalized.filter((r) => preMap.has(buildKey(r)));
        setSelectedRows(nextSelected);
        setQtyMap((prev) => {
          const next = { ...prev };
          preselected.forEach((p) => {
            next[buildKey(p)] = num(p.Quantity);
          });
          return next;
        });
      } else {
        setSelectedRows([]);
        setQtyMap({});
      }
      if (whsOptions.length) {
        const preWhs = preselected?.[0]?.WhsCode ? String(preselected[0].WhsCode).trim() : '';
        const hasPreWhs = preWhs && whsOptions.some((r) => String(r.WhsCode || '').trim() === preWhs);
        const first = String(whsOptions[0].WhsCode || '').trim();
        setSelectedWhs((prev) => {
          if (hasPreWhs) return preWhs;
          if (prev && whsOptions.some((r) => String(r.WhsCode || '').trim() === prev)) return prev;
          return first;
        });
      } else {
        setSelectedWhs('');
      }
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: e?.response?.data?.message || 'Не удалось загрузить товары',
        life: 3500,
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!visible) return;
    load();
  }, [visible]);

  const onGlobalFilterChange = (value: string) => {
    const next = { ...filters };
    (next['global'] as any).value = value;
    setFilters(next);
    setGlobalFilterValue(value);
  };

  const filteredRows = useMemo(() => {
    if (!selectedWhs) return rows;
    return rows.filter((r) => String(r.WhsCode || '').trim() === selectedWhs);
  }, [rows, selectedWhs]);

  const whsOptions = useMemo(
    () =>
      Array.from(
        new Map(
          rows
            .filter((r) => String(r.WhsCode || '').trim())
            .map((r) => [
              String(r.WhsCode || '').trim(),
              { label: `${String(r.WhsCode || '').trim()} - ${String(r.WhsName || '').trim()}`, value: String(r.WhsCode || '').trim() },
            ])
        ).values()
      ),
    [rows]
  );

  const selectedKeySet = useMemo(() => new Set(selectedRows.map((r) => r.uiKey || buildKey(r))), [selectedRows]);

  const setQty = (row: ItemPickerRowT, value: number) => {
    const key = row.uiKey || buildKey(row);
    setQtyMap((prev) => ({ ...prev, [key]: value }));

    if (value > 0 && !selectedKeySet.has(key)) {
      setSelectedRows((prev) => [...prev, row]);
    }
    if (value <= 0 && selectedKeySet.has(key)) {
      setSelectedRows((prev) => prev.filter((r) => (r.uiKey || buildKey(r)) !== key));
    }
  };

  const applyDefaultQtyForSelection = (nextSelected: ItemPickerRowT[]) => {
    setQtyMap((prev) => {
      const next = { ...prev };
      nextSelected.forEach((r) => {
        const key = r.uiKey || buildKey(r);
        if (next[key] == null) next[key] = 1;
      });
      return next;
    });
  };

  const handleSelectionChange = (next: ItemPickerRowT[]) => {
    setSelectedRows(next);
    applyDefaultQtyForSelection(next);
  };

  const selectAllWithOnHand = () => {
    const processed = (dtRef.current as any)?.processedData as ItemPickerRowT[] | undefined;
    const dataToSelect = Array.isArray(processed) ? processed : filteredRows;
    setSelectedRows(dataToSelect);

    setQtyMap((prev) => {
      const next = { ...prev };
      dataToSelect.forEach((r) => {
        const key = r.uiKey || buildKey(r);
        next[key] = Math.max(num(r.OnHand), 0);
      });
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedRows([]);
  };

  const onSubmitInternal = async () => {
    const items: PickedItemT[] = selectedRows
      .map((r) => {
        const key = r.uiKey || buildKey(r);
        return {
          ItemCode: r.ItemCode,
          ItemName: r.ItemName ?? null,
          WhsCode: r.WhsCode ?? null,
          WhsName: r.WhsName ?? null,
          Quantity: num(qtyMap[key] ?? 0),
          OnHand: r.OnHand ?? null,
          UomCode: r.UomCode ?? null,
          Barcode: r.Barcode ?? null,
        };
      })
      .filter((x) => x.Quantity > 0);

    if (!items.length) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Проверка',
        detail: 'Выберите товары и укажите количество',
        life: 2500,
      });
      return;
    }

    try {
      setSaving(true);
      await onSubmit(items);
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: e?.response?.data?.message || e?.message || 'Не удалось сохранить',
        life: 3500,
      });
      return;
    } finally {
      setSaving(false);
    }

    onHide();
  };

  const qtyBody = (r: ItemPickerRowT) => {
    const key = r.uiKey || buildKey(r);
    const value = num(qtyMap[key] ?? 0);
    const selected = selectedKeySet.has(key);

    return (
      <InputNumber
        value={value}
        min={0}
        inputStyle={{ width: 120, textAlign: 'right' }}
        onValueChange={(e) => setQty(r, num(e.value))}
        disabled={!selected}
      />
    );
  };

const tableHeader = (
  <div className="w-full overflow-x-auto">
    <div className="flex align-items-center justify-content-between gap-3 flex-nowrap p-2 surface-card border-1 surface-border border-round-lg shadow-1">
      {/* LEFT: Search + Whs */}
      <div className="flex align-items-center gap-2 flex-nowrap">
        <span className="p-input-icon-left flex-none">
          <i className="pi pi-search" />
          <InputText
            value={globalFilterValue}
            onChange={(e) => onGlobalFilterChange(e.target.value)}
            placeholder="Поиск: код / название..."
            className="w-16rem"
          />
        </span>

        <Dropdown
          value={selectedWhs}
          options={whsOptions}
          onChange={(e) => {
            setSelectedRows([]);
            setQtyMap({});
            setSelectedWhs(String(e.value || ''));
          }}
          placeholder="Склад"
          className="w-20rem flex-none"
        />
      </div>

      {/* RIGHT: Actions + Stats */}
      <div className="flex align-items-center gap-2 flex-nowrap ml-auto">
        <span className="mx-2 border-left-1 surface-border" style={{ height: 26 }} />

        <Tag value={`Всего: ${filteredRows.length}`} severity="info" className="white-space-nowrap" />
        <Tag
          value={`Выбрано: ${selectedRows.length}`}
          severity={selectedRows.length ? 'success' : 'secondary'}
          className="white-space-nowrap"
        />
        {selectedWhs ? <Tag value={`Склад: ${selectedWhs}`} className="white-space-nowrap" /> : null}
      </div>
    </div>
  </div>
);



const dialogHeader = (
  <div className="flex flex-column gap-1">
    <span className="text-xl font-semibold">{title}</span>
    <span className="text-600 text-sm">Сначала выберите склад, затем товары.</span>
  </div>
);


  const footer = (
    <div className="flex justify-content-end gap-2">
      <Button label="Отмена" icon="pi pi-times" severity="secondary" onClick={onHide} />
      <Button label={saving ? 'Добавление...' : 'Добавить'} icon="pi pi-check" onClick={onSubmitInternal} disabled={saving} />
    </div>
  );

  return (
    <Dialog
      visible={visible}
      onHide={onHide}
      header={dialogHeader}
      style={{ width: '95vw', maxWidth: '1100px' }}
      footer={footer}
      modal
      className="p-fluid"
    >
      <Toast ref={toast} />

      <DataTable
        ref={dtRef}
        value={filteredRows}
        loading={loading}
        dataKey="uiKey"
        paginator
        rows={12}
        rowsPerPageOptions={[12, 24, 50]}
        scrollable
        scrollHeight="80vh"
        stripedRows
        rowHover
        selection={selectedRows}
        onSelectionChange={(e) => handleSelectionChange(e.value as ItemPickerRowT[])}
        filters={filters}
        onFilter={(e) => setFilters(e.filters)}
        globalFilterFields={['ItemCode', 'ItemName', 'WhsCode', 'WhsName', 'Barcode']}
        header={tableHeader}
        emptyMessage="Нет данных"
        showGridlines
        size="small"
      >
        <Column selectionMode="multiple" headerStyle={{ width: '3rem' }} />
        <Column field="ItemCode" header="Код" sortable style={{ minWidth: 140 }} />
        <Column field="ItemName" header="Товар" sortable style={{ minWidth: 280 }} />
        <Column field="WhsCode" header="Склад" sortable style={{ minWidth: 120 }} />
        <Column
          header="OnHand"
          sortable
          style={{ minWidth: 120, textAlign: 'right' }}
          body={(r: ItemPickerRowT) => num(r.OnHand)}
        />
        <Column header="Кол-во" style={{ minWidth: 140 }} body={qtyBody} />
      </DataTable>
    </Dialog>
  );
}
