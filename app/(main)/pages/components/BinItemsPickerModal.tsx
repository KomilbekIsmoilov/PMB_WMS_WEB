'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import { DataTable, DataTableFilterMeta } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { FilterMatchMode } from 'primereact/api';
import { Toast } from 'primereact/toast';
import { Tag } from 'primereact/tag';
import api from '@/app/api/api';

export type BinItemRowT = {
  ItemCode: string;
  ItemName?: string | null;
  WhsCode?: string | null;
  WhsName?: string | null;
  BinAbsEntry?: number | null;
  BinCode?: string | null;
  OnHand?: number | string | null;
  OnHandQty?: number | string | null;
  IsBatchManaged?: 'Y' | 'N' | boolean | null;
  BatchNumber?: string | null;
  ExpDate?: string | null;

  uiKey?: string;
};

export type BinPickedItemT = {
  ItemCode: string;
  ItemName?: string | null;
  WhsCode?: string | null;
  WhsName?: string | null;
  BinAbsEntry?: number | null;
  BinCode?: string | null;
  Quantity: number;
  OnHand?: number | string | null;
  IsBatchManaged?: 'Y' | 'N' | boolean | null;
  BatchNumber?: string | null;
  ExpDate?: string | null;
};

type Props = {
  visible: boolean;
  onHide: () => void;
  title?: string;
  endpoint?: string;
  params?: Record<string, any>;
  onSubmit: (items: BinPickedItemT[]) => Promise<void> | void;
};

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const unwrap = <T,>(res: any): T => {
  if (res && typeof res === 'object' && 'data' in res) return res.data as T;
  return res as T;
};

const buildKey = (r: BinItemRowT) =>
  `${String(r.ItemCode || '').trim()}|||${String(r.BinAbsEntry ?? '').trim()}|||${String(r.BatchNumber || '').trim()}`;

export default function BinItemsPickerModal({
  visible,
  onHide,
  title = 'Выбор товаров',
  endpoint = '/getOnHandItemsBinApi',
  params,
  onSubmit,
}: Props) {
  const toast = useRef<Toast>(null);
  const dtRef = useRef<DataTable<BinItemRowT>>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<BinItemRowT[]>([]);
  const [selectedRows, setSelectedRows] = useState<BinItemRowT[]>([]);
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});

  const [globalFilterValue, setGlobalFilterValue] = useState('');
  const [filters, setFilters] = useState<DataTableFilterMeta>({
    global: { value: null, matchMode: FilterMatchMode.CONTAINS },
  });

  const load = async () => {
    try {
      if (!params?.BinCode) {
        setRows([]);
        setSelectedRows([]);
        setQtyMap({});
        return;
      }

      setLoading(true);
      const res = await api.get(endpoint, { params });
      const data = unwrap<BinItemRowT[]>(res) || [];

      const map = new Map<string, BinItemRowT>();
      for (const raw of Array.isArray(data) ? data : []) {
        const r: BinItemRowT = {
          ...raw,
          OnHand: raw.OnHand ?? raw.OnHandQty ?? null,
          OnHandQty: raw.OnHandQty ?? raw.OnHand ?? null,
          BatchNumber: null,
          ExpDate: null,
        };
        const key = `${String(r.ItemCode || '').trim()}|||${String(r.BinAbsEntry ?? '').trim()}`;
        const prev = map.get(key);
        if (!prev) {
          map.set(key, r);
        } else {
          const sum = num(prev.OnHand) + num(r.OnHand);
          map.set(key, {
            ...prev,
            OnHand: sum,
            OnHandQty: sum,
            IsBatchManaged: prev.IsBatchManaged || r.IsBatchManaged,
          });
        }
      }

      const normalized = Array.from(map.values()).map((r) => ({ ...r, uiKey: buildKey(r) }));
      setRows(normalized);
      setSelectedRows([]);
      setQtyMap({});
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
  }, [visible, params?.WhsCode, params?.BinAbsEntry, params?.BinCode]);

  const onGlobalFilterChange = (value: string) => {
    const next = { ...filters };
    (next['global'] as any).value = value;
    setFilters(next);
    setGlobalFilterValue(value);
  };

  const selectedKeySet = useMemo(() => new Set(selectedRows.map((r) => r.uiKey || buildKey(r))), [selectedRows]);

  const setQty = (row: BinItemRowT, value: number) => {
    const key = row.uiKey || buildKey(row);
    setQtyMap((prev) => ({ ...prev, [key]: value }));

    if (value > 0 && !selectedKeySet.has(key)) {
      setSelectedRows((prev) => [...prev, row]);
    }
    if (value <= 0 && selectedKeySet.has(key)) {
      setSelectedRows((prev) => prev.filter((r) => (r.uiKey || buildKey(r)) !== key));
    }
  };

  const applyDefaultQtyForSelection = (nextSelected: BinItemRowT[]) => {
    setQtyMap((prev) => {
      const next = { ...prev };
      nextSelected.forEach((r) => {
        const key = r.uiKey || buildKey(r);
        if (next[key] == null) next[key] = 1;
      });
      return next;
    });
  };

  const handleSelectionChange = (next: BinItemRowT[]) => {
    setSelectedRows(next);
    applyDefaultQtyForSelection(next);
  };

  const selectAllWithOnHand = () => {
    const processed = (dtRef.current as any)?.processedData as BinItemRowT[] | undefined;
    const dataToSelect = Array.isArray(processed) ? processed : rows;
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

  const clearSelection = () => setSelectedRows([]);

  const onSubmitInternal = async () => {
    const items: BinPickedItemT[] = selectedRows
      .map((r) => {
        const key = r.uiKey || buildKey(r);
        return {
          ItemCode: r.ItemCode,
          ItemName: r.ItemName ?? null,
          WhsCode: r.WhsCode ?? null,
          WhsName: r.WhsName ?? null,
          BinAbsEntry: r.BinAbsEntry ?? null,
          BinCode: r.BinCode ?? null,
          Quantity: num(qtyMap[key] ?? 0),
          OnHand: r.OnHand ?? null,
          IsBatchManaged: r.IsBatchManaged ?? null,
          BatchNumber: r.BatchNumber ?? null,
          ExpDate: r.ExpDate ?? null,
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

  const qtyBody = (r: BinItemRowT) => {
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

  const header = (
    <div className="flex flex-column gap-2">
      <div className="flex flex-wrap align-items-center justify-content-between gap-2">
        <span className="p-input-icon-left">
          <i className="pi pi-search" />
          <InputText
            value={globalFilterValue}
            onChange={(e) => onGlobalFilterChange(e.target.value)}
            placeholder="Поиск: код / название..."
            style={{ width: 300 }}
          />
        </span>

        <div className="flex gap-2 align-items-center flex-wrap">
          <Button label="Выбрать все (OnHand)" icon="pi pi-check-square" onClick={selectAllWithOnHand} />
          <Button label="Снять выделение" icon="pi pi-times" severity="secondary" onClick={clearSelection} />
        </div>
      </div>

      <div className="flex flex-wrap align-items-center gap-2 text-sm">
        <Tag value={`Всего: ${rows.length}`} severity="info" />
        <Tag value={`Выбрано: ${selectedRows.length}`} severity={selectedRows.length ? 'success' : 'secondary'} />
      </div>
    </div>
  );

  const footer = (
    <div className="flex justify-content-end gap-2">
      <Button label="Отмена" icon="pi pi-times" severity="secondary" onClick={onHide} />
      <Button
        label={saving ? 'Добавление...' : 'Добавить'}
        icon="pi pi-check"
        onClick={onSubmitInternal}
        disabled={saving}
      />
    </div>
  );

  return (
    <Dialog
      visible={visible}
      onHide={onHide}
      header={title}
      style={{ width: '95vw', maxWidth: '1100px' }}
      footer={footer}
      modal
      className="p-fluid"
    >
      <Toast ref={toast} />

      <DataTable
        ref={dtRef}
        value={rows}
        loading={loading}
        dataKey="uiKey"
        paginator
        rows={12}
        rowsPerPageOptions={[12, 24, 50]}
        scrollable
        stripedRows
        rowHover
        selection={selectedRows}
        onSelectionChange={(e: any) => handleSelectionChange(e.value as BinItemRowT[])}
        filters={filters}
        onFilter={(e) => setFilters(e.filters)}
        globalFilterFields={['ItemCode', 'ItemName', 'BinCode']}
        header={header}
        emptyMessage="Нет данных"
        showGridlines
        size="small"
      >
        <Column selectionMode="multiple" headerStyle={{ width: '3rem' }} />
        <Column field="ItemCode" header="Код" sortable style={{ minWidth: 140 }} />
        <Column field="ItemName" header="Товар" sortable style={{ minWidth: 280 }} />
        <Column field="BinCode" header="Ячейка" sortable style={{ minWidth: 140 }} />
        <Column
          header="Остаток"
          sortable
          style={{ minWidth: 120, textAlign: 'right' }}
          body={(r: BinItemRowT) => num(r.OnHand)}
        />
        <Column header="Кол-во" style={{ minWidth: 140 }} body={qtyBody} />
      </DataTable>
    </Dialog>
  );
}
