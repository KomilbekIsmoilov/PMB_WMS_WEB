'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from 'primereact/card';
import { Toast } from 'primereact/toast';
import { Tag } from 'primereact/tag';
import { Button } from 'primereact/button';
import { Divider } from 'primereact/divider';
import { DataTable, DataTableFilterMeta } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputText } from 'primereact/inputtext';
import { FilterMatchMode } from 'primereact/api';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import api from '@/app/api/api';
import ItemsPickerModal, { PickedItemT } from '../../../pages/components/ItemsPickerModal';

type ReturnLineT = {
  DocNum: number;
  DocEntry: number;
  DocDate?: string | null;
  CardCode?: string | null;
  CardName?: string | null;
  LineNum?: number | null;
  ItemCode: string;
  ItemName?: string | null;
  WhsCode?: string | null;
  Quantity: number | string;
  OnHand?: number | string;
  Volume?: number | string;
  Weight?: number | string;
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

export default function ReturnDetailPage() {
  const toast = useRef<Toast>(null);
  const router = useRouter();
  const sp = useSearchParams();

  const DocEntry = sp.get('DocEntry') || '';
  const DocNum = sp.get('DocNum') || '';

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ReturnLineT[]>([]);
  const [itemsModalOpen, setItemsModalOpen] = useState(false);

  const [globalFilterValue, setGlobalFilterValue] = useState('');
  const [filters, setFilters] = useState<DataTableFilterMeta>({
    global: { value: null, matchMode: FilterMatchMode.CONTAINS },
  });

  const headerInfo = useMemo(() => {
    const r = rows?.[0];
    if (!r) return null;
    return {
      DocNum: r.DocNum,
      DocEntry: r.DocEntry,
      DocDate: r.DocDate,
      CardCode: r.CardCode,
      CardName: r.CardName,
    };
  }, [rows]);

  const totals = useMemo(() => {
    const arr = rows || [];
    return {
      lines: arr.length,
      qty: arr.reduce((s, r) => s + num(r.Quantity), 0),
      volume: arr.reduce((s, r) => s + num(r.Volume), 0),
      weight: arr.reduce((s, r) => s + num(r.Weight), 0),
    };
  }, [rows]);

  const load = async () => {
    try {
      if (!DocEntry) {
        toast.current?.show({ severity: 'warn', summary: 'Внимание', detail: 'DocEntry не указан', life: 2500 });
        return;
      }
      setLoading(true);
      const res = await api.get('/getReturnDocItemsApi', { params: { DocEntry, DocNum } });
      setRows((res?.data ?? res) as ReturnLineT[]);
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: e?.response?.data?.message || 'Не удалось загрузить строки документа',
        life: 3500,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [DocEntry]);

  const onGlobalFilterChange = (value: string) => {
    const _filters: DataTableFilterMeta = { ...filters };
    (_filters['global'] as any).value = value;
    setFilters(_filters);
    setGlobalFilterValue(value);
  };

  const addItems = async (items: PickedItemT[]) => {
    await api.post('/postReturnDocAddItemsApi', {
      DocEntry: Number(DocEntry),
      DocNum: Number(DocNum),
      Items: items,
    });

    toast.current?.show({ severity: 'success', summary: 'Готово', detail: `Добавлено: ${items.length}`, life: 2500 });
    await load();
  };

  const deleteLine = async (line: ReturnLineT) => {
    try {
      await api.post('/deleteReturnDocItemApi', {
        DocEntry: Number(DocEntry),
        DocNum: Number(DocNum),
        LineNum: line.LineNum ?? null,
        ItemCode: line.ItemCode,
        WhsCode: line.WhsCode ?? null,
      });

      setRows((prev) => prev.filter((r) => r !== line));
      toast.current?.show({ severity: 'success', summary: 'Удалено', detail: line.ItemCode, life: 2000 });
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: e?.response?.data?.message || 'Не удалось удалить строку',
        life: 3500,
      });
    }
  };

  const confirmDelete = (line: ReturnLineT) => {
    confirmDialog({
      header: 'Удалить товар?',
      icon: 'pi pi-exclamation-triangle',
      message: `Удалить ${line.ItemCode} ${line.ItemName || ''}?`,
      acceptLabel: 'Удалить',
      rejectLabel: 'Отмена',
      acceptClassName: 'p-button-danger',
      accept: () => deleteLine(line),
    });
  };

  return (
    <>
      <Toast ref={toast} />
      <ConfirmDialog />

      <div className="flex flex-column gap-3">
        <div className="flex align-items-center justify-content-between gap-2 flex-wrap">
          <div className="flex align-items-center gap-2 flex-wrap">
            <Button label="Назад" icon="pi pi-arrow-left" severity="secondary" onClick={() => router.back()} />
            <Button label={loading ? 'Загрузка...' : 'Обновить'} icon="pi pi-refresh" severity="secondary" onClick={load} disabled={loading} />
            <Button label="Добавить товары" icon="pi pi-plus" onClick={() => setItemsModalOpen(true)} />
          </div>

          <div className="flex align-items-center gap-2 flex-wrap">
            <Tag value={`Строк: ${totals.lines}`} />
            <Tag value={`Кол-во: ${fmtNum(totals.qty, 2)}`} severity="info" />
            <Tag value={`Объём: ${fmtNum(totals.volume, 3)}`} severity="success" />
            <Tag value={`Вес: ${fmtNum(totals.weight, 3)}`} severity="warning" />
          </div>
        </div>

        <Card
          className="shadow-2 border-round-xl"
          title={
            <div className="flex flex-column gap-1">
              <div className="flex align-items-center gap-2 flex-wrap">
                <span className="text-xl font-semibold">Возврат № {headerInfo?.DocNum ?? DocNum ?? '-'}</span>
              </div>
              <div className="text-600">
                {headerInfo ? `${headerInfo.CardCode || ''} • ${headerInfo.CardName || ''}` : 'Загрузка данных...'}
              </div>
            </div>
          }
        >
          <div className="grid">
            <div className="col-12 md:col-3">
              <div className="text-600 text-sm">Дата</div>
              <div className="font-semibold">{fmtDate(headerInfo?.DocDate)}</div>
            </div>
          </div>

          <Divider className="my-3" />

          <div className="flex align-items-center justify-content-between flex-wrap gap-2">
            <span className="p-input-icon-left">
              <i className="pi pi-search" />
              <InputText
                value={globalFilterValue}
                onChange={(e) => onGlobalFilterChange(e.target.value)}
                placeholder="Поиск по товарам..."
                style={{ width: 320 }}
              />
            </span>
          </div>

          <div className="mt-3">
            <DataTable
              value={rows}
              loading={loading}
              dataKey="LineNum"
              paginator
              rows={20}
              rowsPerPageOptions={[20, 50, 100]}
              stripedRows
              rowHover
              showGridlines
              size="small"
              emptyMessage="Нет данных"
              filters={filters}
              onFilter={(e) => setFilters(e.filters)}
              globalFilterFields={['ItemCode', 'ItemName']}
            >
              <Column field="LineNum" header="#" style={{ width: 70 }} />
              <Column field="ItemCode" header="Код" sortable style={{ minWidth: 140 }} />
              <Column field="ItemName" header="Товар" sortable style={{ minWidth: 320 }} />
              <Column field="WhsCode" header="Склад" sortable style={{ minWidth: 120 }} />
              <Column
                field="Quantity"
                header="Кол-во"
                sortable
                style={{ minWidth: 120, textAlign: 'right' }}
                body={(r: ReturnLineT) => fmtNum(r.Quantity, 2)}
              />
              <Column header="Объём" style={{ minWidth: 120, textAlign: 'right' }} body={(r: ReturnLineT) => fmtNum(r.Volume, 3)} />
              <Column header="Вес" style={{ minWidth: 120, textAlign: 'right' }} body={(r: ReturnLineT) => fmtNum(r.Weight, 3)} />
              <Column
                header=""
                style={{ width: 70 }}
                body={(r: ReturnLineT) => (
                  <Button icon="pi pi-trash" severity="danger" text onClick={() => confirmDelete(r)} />
                )}
              />
            </DataTable>
          </div>
        </Card>
      </div>

      <ItemsPickerModal
        visible={itemsModalOpen}
        onHide={() => setItemsModalOpen(false)}
        endpoint="/getItemsForReturnDocApi"
        params={{ DocEntry, DocNum }}
        onSubmit={addItems}
      />
    </>
  );
}
