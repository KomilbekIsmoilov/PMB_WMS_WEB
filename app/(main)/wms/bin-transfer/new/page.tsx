'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from 'primereact/card';
import { Toast } from 'primereact/toast';
import { Dropdown } from 'primereact/dropdown';
import { Button } from 'primereact/button';
import { Divider } from 'primereact/divider';
import { Calendar } from 'primereact/calendar';
import { DataTable, DataTableFilterMeta } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputNumber } from 'primereact/inputnumber';
import { InputText } from 'primereact/inputtext';
import { FilterMatchMode } from 'primereact/api';
import api from '@/app/api/api';
import BinItemsPickerModal, { BinPickedItemT } from '../../../pages/components/BinItemsPickerModal';

type OptionT = { label: string; value: string };

type WhsApiT = { WhsCode: string; WhsName: string; BPLid?: number; BinActivat?: 'Y' | 'N' };

type BinApiT = { BinAbsEntry: number; BinCode: string; WhsCode?: string; WhsName?: string; AbsEntry?: number };

type WorkAreaHeaderApiT = {
  DocEntry: number;
  DocNum: number;
  Remark?: string | null;
};

type BinTransferItemT = BinPickedItemT & {
  uiKey: string;
};

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export default function BinTransferNewPage() {
  const toast = useRef<Toast>(null);
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [warehouses, setWarehouses] = useState<WhsApiT[]>([]);
  const [fromWhs, setFromWhs] = useState<string | null>(null);
  const [bins, setBins] = useState<BinApiT[]>([]);
  const [fromBin, setFromBin] = useState<BinApiT | null>(null);
  const [workAreas, setWorkAreas] = useState<WorkAreaHeaderApiT[]>([]);
  const [workArea, setWorkArea] = useState<WorkAreaHeaderApiT | null>(null);
  const [dueDate, setDueDate] = useState<Date | null>(null);

  const [items, setItems] = useState<BinTransferItemT[]>([]);
  const [itemsModalOpen, setItemsModalOpen] = useState(false);
  const [globalFilterValue, setGlobalFilterValue] = useState('');
  const [filters, setFilters] = useState<DataTableFilterMeta>({
    global: { value: null, matchMode: FilterMatchMode.CONTAINS },
  });

  const whsOptions: OptionT[] = useMemo(
    () => warehouses.map((w) => ({ label: `${w.WhsCode} - ${w.WhsName}`, value: w.WhsCode })),
    [warehouses]
  );

  const binOptions: OptionT[] = useMemo(
    () => bins.map((b) => ({ label: `${b.BinCode}`, value: String(b.BinAbsEntry) })),
    [bins]
  );

  const workAreaOptions: OptionT[] = useMemo(
    () => workAreas.map((w) => ({ label: `${w.DocNum} - ${w.Remark || 'Без комментария'}`, value: String(w.DocEntry) })),
    [workAreas]
  );

  const loadDicts = async () => {
    try {
      setLoading(true);
      const [whs, wa] = await Promise.all([api.get('/getWhsCodesApi'), api.get('/getWorksAreaHeaderApi')]);

      setWarehouses((whs?.data ?? whs) as WhsApiT[]);
      setWorkAreas((wa?.data ?? wa) as WorkAreaHeaderApiT[]);
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: e?.response?.data?.message || 'Не удалось загрузить справочники',
        life: 3500,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDicts();
  }, []);

  const loadBins = async (whsCode: string) => {
    try {
      const res = await api.get('/getBinsWhsApi', { params: { WhsCode: whsCode } });
      const data = (res?.data ?? res) as BinApiT[];
      const arr = (Array.isArray(data) ? data : [])
        .map((b: any) => {
          const binAbs = Number(b.BinAbsEntry ?? b.AbsEntry ?? b.binAbsEntry ?? b.absEntry);
          const binCode = String(b.BinCode ?? b.binCode ?? '').trim();
          return {
            ...b,
            BinAbsEntry: binAbs,
            BinCode: binCode,
            WhsCode: String(b.WhsCode ?? b.whsCode ?? '').trim() || undefined,
            WhsName: String(b.WhsName ?? b.whsName ?? '').trim() || undefined,
          } as BinApiT;
        })
        .filter((b: BinApiT) => Number.isFinite(b.BinAbsEntry) && !!String(b.BinCode || '').trim());
      setBins(arr);

      if (arr.length) {
        const first = arr[0];
        setFromBin((prev) => (prev && arr.some((b) => b.BinAbsEntry === prev.BinAbsEntry) ? prev : first));
      } else {
        setFromBin(null);
      }
    } catch (e: any) {
      setBins([]);
      setFromBin(null);
    }
  };

  useEffect(() => {
    if (!fromWhs) {
      setBins([]);
      setFromBin(null);
      return;
    }
    setItems([]);
    loadBins(fromWhs);
  }, [fromWhs]);

  const makeKey = (i: BinPickedItemT) =>
    `${String(i.ItemCode || '').trim()}|||${String(i.BinAbsEntry ?? '').trim()}|||${String(i.BatchNumber || '').trim()}`;

  const addItems = (list: BinPickedItemT[]) => {
    setItems((prev) => {
      const map = new Map(prev.map((p) => [p.uiKey, p]));
      list.forEach((p) => {
        const key = makeKey(p);
        map.set(key, { ...p, uiKey: key });
      });
      return Array.from(map.values());
    });
  };

  const removeItem = (uiKey: string) => setItems((prev) => prev.filter((x) => x.uiKey !== uiKey));

  const updateQty = (uiKey: string, value: number) => {
    setItems((prev) => prev.map((x) => (x.uiKey === uiKey ? { ...x, Quantity: value } : x)));
  };

  const onGlobalFilterChange = (value: string) => {
    const next = { ...filters };
    (next['global'] as any).value = value;
    setFilters(next);
    setGlobalFilterValue(value);
  };

  const save = async () => {
    if (!fromWhs || !fromBin) {
      toast.current?.show({ severity: 'warn', summary: 'Проверка', detail: 'Выберите склад и ячейку', life: 2500 });
      return;
    }
    if (!items.length) {
      toast.current?.show({ severity: 'warn', summary: 'Проверка', detail: 'Добавьте товары', life: 2500 });
      return;
    }

    try {
      setSaving(true);

      const whsInfo = warehouses.find((w) => w.WhsCode === fromWhs);
      const payload = {
        FromWhsCode: fromWhs,
        FromWhsName: whsInfo?.WhsName || null,
        ToWhsCode: fromWhs,
        ToWhsName: whsInfo?.WhsName || null,
        U_WorkArea: workArea?.DocEntry ?? null,
        U_WorkAreaName: workArea?.Remark || null,
        DocDueDate: dueDate ? dueDate.toISOString() : null,
        DocumentLines: items.map((x, idx) => ({
          LineNum: idx + 1,
          ItemCode: x.ItemCode,
          ItemName: x.ItemName,
          Quantity: num(x.Quantity),
          FromWhsCode: fromWhs,
          FromWhsName: whsInfo?.WhsName || null,
          FromBinAbsEntry: x.BinAbsEntry ?? fromBin.BinAbsEntry,
          FromBinCode: x.BinCode ?? fromBin.BinCode,
          ToWhsCode: fromWhs,
          ToWhsName: whsInfo?.WhsName || null,
        })),
      };

      await api.post('/createBinToBinApi', payload);

      toast.current?.show({ severity: 'success', summary: 'Готово', detail: 'Документ создан', life: 2500 });
      router.push('/wms/bin-transfer');
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: e?.response?.data?.message || 'Не удалось создать документ',
        life: 3500,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Toast ref={toast} />
      <Card title="Новый Bin → Bin">
        <div className="grid">
          <div className="col-12 md:col-4">
            <label className="block mb-2">Со склада</label>
            <Dropdown
              value={fromWhs}
              options={whsOptions}
              onChange={(e) => setFromWhs(e.value)}
              placeholder={loading ? 'Загрузка...' : 'Выберите склад'}
              filter
              showClear
              className="w-full"
            />
          </div>

          <div className="col-12 md:col-4">
            <label className="block mb-2">Ячейка</label>
            <Dropdown
              value={fromBin?.BinAbsEntry != null ? String(fromBin.BinAbsEntry) : null}
              options={binOptions}
              onChange={(e) => {
                const found = bins.find((b) => String(b.BinAbsEntry) === String(e.value)) || null;
                setFromBin(found);
                setItems([]);
              }}
              placeholder={loading ? 'Загрузка...' : 'Выберите ячейку'}
              filter
              showClear
              className="w-full"
            />
          </div>

          <div className="col-12 md:col-4">
            <label className="block mb-2">WorkArea</label>
            <Dropdown
              value={workArea?.DocEntry != null ? String(workArea.DocEntry) : null}
              options={workAreaOptions}
              onChange={(e) => {
                const found = workAreas.find((w) => String(w.DocEntry) === String(e.value)) || null;
                setWorkArea(found);
              }}
              placeholder={loading ? 'Загрузка...' : 'Выберите WorkArea'}
              filter
              showClear
              className="w-full"
            />
          </div>

          <div className="col-12 md:col-4">
            <label className="block mb-2">Срок</label>
            <Calendar
              value={dueDate}
              onChange={(e) => setDueDate(e.value as Date)}
              dateFormat="yy-mm-dd"
              placeholder="Выберите дату"
              className="w-full"
              showIcon
            />
          </div>
        </div>

        <Divider />

        <div className="flex align-items-center justify-content-between mb-2 flex-wrap gap-2">
          <div className="text-900 font-medium">Товары</div>
          <div className="flex align-items-center gap-2 flex-wrap">
            <span className="p-input-icon-left">
              <i className="pi pi-search" />
              <InputText
                value={globalFilterValue}
                onChange={(e) => onGlobalFilterChange(e.target.value)}
                placeholder="Поиск: код / название..."
                style={{ width: 280 }}
              />
            </span>
            <Button
              label="Добавить товары"
              icon="pi pi-plus"
              onClick={() => setItemsModalOpen(true)}
              disabled={!fromWhs || !fromBin}
            />
          </div>
        </div>

        <DataTable
          value={items}
          dataKey="uiKey"
          emptyMessage="Нет товаров"
          showGridlines
          size="small"
          filters={filters}
          onFilter={(e) => setFilters(e.filters)}
          globalFilterFields={['ItemCode', 'ItemName', 'BinCode']}
        >
          <Column field="ItemCode" header="Код" style={{ minWidth: 140 }} />
          <Column field="ItemName" header="Товар" style={{ minWidth: 280 }} />
          <Column field="BinCode" header="Ячейка" style={{ minWidth: 140 }} />
          <Column
            header="Кол-во"
            style={{ minWidth: 140 }}
            body={(r: BinTransferItemT) => (
              <InputNumber
                value={num(r.Quantity)}
                min={0}
                inputStyle={{ width: 120, textAlign: 'right' }}
                onValueChange={(e) => updateQty(r.uiKey, num(e.value))}
              />
            )}
          />
          <Column
            header=""
            style={{ width: 70 }}
            body={(r: BinTransferItemT) => (
              <Button icon="pi pi-trash" severity="danger" text onClick={() => removeItem(r.uiKey)} />
            )}
          />
        </DataTable>

        <Divider />

        <div className="flex gap-2">
          <Button label={saving ? 'Сохранение...' : 'Сохранить'} icon="pi pi-check" onClick={save} disabled={saving} />
          <Button label="Отмена" icon="pi pi-times" severity="secondary" onClick={() => router.back()} />
        </div>
      </Card>

      <BinItemsPickerModal
        visible={itemsModalOpen}
        onHide={() => setItemsModalOpen(false)}
        title={fromWhs && fromBin ? `Товары: ${fromWhs} • ${fromBin.BinCode}` : 'Выбор товаров'}
        endpoint="/getOnHandItemsBinApi"
        params={{ WhsCode: fromWhs, BinCode: fromBin?.BinCode }}
        onSubmit={addItems}
      />
    </>
  );
}
