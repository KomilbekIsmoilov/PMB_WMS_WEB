'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Dropdown } from 'primereact/dropdown';
import { Button } from 'primereact/button';
import { InputNumber } from 'primereact/inputnumber';
import { InputText } from 'primereact/inputtext';
import { Tag } from 'primereact/tag';
import type { Toast } from 'primereact/toast';

import api from '@/app/api/api';

type CollectorOptionT = { empID: number; fullName: string };

type BinAllocT = {
  BinAbsEntry: number;
  BinCode?: string;
  BatchNumber?: string | null;
  ExpDate?: string | null;
  Quantity: number;
};

type CollectEventT = {
  by?: any;
  BinAbsEntry?: number;
  BinCode?: string;
  BatchNumber?: string | null;
  ExpDate?: string | null;
  QtyDelta?: number;
};

type OnHandRowT = {
  WhsCode: string;
  WhsName?: string;
  BinAbsEntry: number;
  BinCode: string;
  ItemCode: string;
  ItemName?: string;
  IsBatchManaged: 'Y' | 'N';
  BatchNumber?: string | null;
  ExpDate?: string | null;
  OnHandQty: number;

  __k?: string;
  __avail?: number;
};

export type CollectLineT = {
  LineNum?: number | null;
  ItemCode: string;
  ItemName?: string | null;
  WhsCode: string;
  Onhand: number | string;
  OnHandAll? :  number | string;
  WhsName?: string | null;
  Quantity: number | string;
  OpenQty?: number | string;
  CollectedQuantity?: number | string;
  BinAllocations?: BinAllocT[];
  CollectedEvents?: CollectEventT[];
};

type AllocationT = {
  id: string;
  _src?: 'saved' | 'local';

  collector: CollectorOptionT;

  BinAbsEntry: number;
  BinCode: string;

  IsBatchManaged: 'Y' | 'N';
  BatchNumber: string; 
  ExpDate?: string | null;

  Qty: number;
};

type Props = {
  visible: boolean;
  onHide: () => void;

  toastRef?: React.RefObject<Toast>;

  socket: any;
  connected: boolean;

  DocEntry: number;
  DocNum: number;
  WorkAreaDocEntry?: number | null;

  line: CollectLineT | null;
};

const normStr = (v: any) => String(v ?? '').trim();
const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const fmtNum = (v: any, digits = 2) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(num(v));

const kKey = (binAbs: any, batch: any) => `${Number(binAbs)}|||${normStr(batch)}`; 
const kOnHand = (r: OnHandRowT) => kKey(r.BinAbsEntry, r.BatchNumber);


const buildSavedAllocsFromLine = (ln: CollectLineT | null): AllocationT[] => {
  if (!ln) return [];

  const events = Array.isArray(ln.CollectedEvents) ? ln.CollectedEvents : [];
  const binAllocs = Array.isArray(ln.BinAllocations) ? ln.BinAllocations : [];

  // fallback bin info (BinCode/ExpDate) for matching
  const binMap = new Map<string, any>();
  for (const b of binAllocs) {
    const key = `${Number(b.BinAbsEntry)}|||${normStr(b.BatchNumber)}`;
    binMap.set(key, b);
  }

  // ✅ 1 event = 1 row (no grouping)
  const out: AllocationT[] = [];

  for (let i = 0; i < events.length; i++) {
    const e: any = events[i];
    const q = num(e?.QtyDelta);
    if (q <= 0) continue;

    const bin = Number(e?.BinAbsEntry || 0);
    if (!bin) continue;

    const batch = normStr(e?.BatchNumber); // '' if empty
    const keyBB = `${bin}|||${batch}`;
    const fallback = binMap.get(keyBB);

    const by = e?.by ?? e?.By ?? e?.collector ?? e?.user ?? {};
    const emp = Number(by?.empID ?? by?.EmpID ?? by?.U_UserCode ?? by?.U_UserID ?? 0);

    // sizda username/userId yo‘q dedingiz — faqat fullName + empID
    const fullName = normStr(by?.fullName ?? by?.FullName ?? by?.name ?? '') || (emp ? `#${emp}` : '—');

    const BinCode = normStr(e?.BinCode ?? fallback?.BinCode ?? '') || String(bin);

    out.push({
      id: `S:${emp || 0}:${bin}:${batch || ''}:${normStr(e?.at) || i}`,
      collector: { empID: emp || 0, fullName },
      BinAbsEntry: bin,
      BinCode,
      IsBatchManaged: batch ? 'Y' : 'N',
      BatchNumber: batch || '', // non-batch => ''
      ExpDate: normStr(e?.ExpDate ?? fallback?.ExpDate) || null,
      Qty: q,
      note: '',
    });
  }

  // fallback: agar CollectedEvents kelmasa (includeEvents=1 yo‘q bo‘lsa)
  if (!out.length && binAllocs.length) {
    return binAllocs
      .filter((b) => num(b.Quantity) > 0)
      .map((b, idx) => ({
        id: `S:UNK:${Number(b.BinAbsEntry)}:${normStr(b.BatchNumber)}:${idx}`,
        collector: { empID: 0, fullName: '—' },
        BinAbsEntry: Number(b.BinAbsEntry),
        BinCode: normStr(b.BinCode) || String(b.BinAbsEntry),
        IsBatchManaged: normStr(b.BatchNumber) ? 'Y' : 'N',
        BatchNumber: normStr(b.BatchNumber) || '',
        ExpDate: normStr(b.ExpDate) || null,
        Qty: num(b.Quantity),
        note: '',
      }));
  }

  return out;
};


export default function CollectAllocationsModal({
  visible,
  onHide,
  toastRef,
  socket,
  connected,
  DocEntry,
  DocNum,
  WorkAreaDocEntry,
  line,
}: Props) {
  // ---------------- state ----------------
  const [collectors, setCollectors] = useState<CollectorOptionT[]>([]);
  const [collectorsLoading, setCollectorsLoading] = useState(false);

  const [onhand, setOnhand] = useState<OnHandRowT[]>([]);
  const [onhandLoading, setOnhandLoading] = useState(false);

  const [collector, setCollector] = useState<CollectorOptionT | null>(null);

  const [leftSelected, setLeftSelected] = useState<OnHandRowT | null>(null);
  const [qty, setQty] = useState<number>(0);
  const [leftFilter, setLeftFilter] = useState('');

  const [allocs, setAllocs] = useState<AllocationT[]>([]);
  const [savedAllocs, setSavedAllocs] = useState<AllocationT[]>([]);

  const [saving, setSaving] = useState(false);

  const showToast = (severity: any, summary: string, detail: string) => {
    toastRef?.current?.show({ severity, summary, detail, life: 3000 });
  };

  // ---------------- derived ----------------
  const lineOpen = useMemo(() => num(line?.OpenQty ?? line?.Quantity), [line]);
  const lineCollected = useMemo(() => num(line?.CollectedQuantity), [line]);
  const lineRemaining = useMemo(() => Math.max(lineOpen - lineCollected, 0), [lineOpen, lineCollected]);

  const savedTotal = useMemo(() => savedAllocs.reduce((s, a) => s + num(a.Qty), 0), [savedAllocs]);
  const selectedTotal = useMemo(() => allocs.reduce((s, a) => s + num(a.Qty), 0), [allocs]);

  const remainingToPick = useMemo(() => Math.max(lineRemaining - selectedTotal, 0), [lineRemaining, selectedTotal]);

  const onhandMap = useMemo(() => {
    const m = new Map<string, OnHandRowT>();
    for (const r of onhand) m.set(kOnHand(r), r);
    return m;
  }, [onhand]);

  const pickedFromKey = useMemo(() => {
    const m = new Map<string, number>();
    const all = [...savedAllocs, ...allocs];
    for (const a of all) {
      const key = kKey(a.BinAbsEntry, a.BatchNumber);
      m.set(key, (m.get(key) || 0) + num(a.Qty));
    }
    return m;
  }, [allocs, savedAllocs]);

  const leftRows = useMemo(() => {
    const f = leftFilter.trim().toLowerCase();

    const arr = (Array.isArray(onhand) ? onhand : []).map((r) => {
      const key = kOnHand(r);
      const picked = pickedFromKey.get(key) || 0;
      const avail = Math.max(num(r.OnHandQty) - picked, 0);
      return { ...r, __k: key, __avail: avail };
    });

    const filtered = !f
      ? arr
      : arr.filter((r: any) => {
          const s = `${r.BinCode} ${r.BatchNumber || ''} ${r.WhsCode} ${r.ItemCode}`.toLowerCase();
          return s.includes(f);
        });

    return filtered.filter((r: any) => num(r.__avail) > 0);
  }, [onhand, pickedFromKey, leftFilter]);

  const maxAddQty = useMemo(() => {
    if (!leftSelected) return 0;

    const base = onhandMap.get(kOnHand(leftSelected));
    const onhandQty = num(base?.OnHandQty);

    const alreadyPicked = pickedFromKey.get(kOnHand(leftSelected)) || 0;
    const avail = Math.max(onhandQty - alreadyPicked, 0);

    return Math.max(Math.min(avail, remainingToPick), 0);
  }, [leftSelected, onhandMap, pickedFromKey, remainingToPick]);

  const resolveCollectorName = (a: any) => {
    const nm = normStr(a?.collector?.fullName);
    if (nm && nm !== '—') return nm;

    const emp = Number(a?.collector?.empID || 0);
    if (emp) {
      const c = collectors.find((x) => Number(x.empID) === emp);
      if (c?.fullName) return c.fullName;
    }
    return '—';
  };

  const loadCollectors = async () => {
    const workAreaId = Number(WorkAreaDocEntry);
    if (!Number.isFinite(workAreaId) || workAreaId <= 0) {
      setCollectors([]);
      return;
    }
    try {
      setCollectorsLoading(true);
      const res = await api.get('/getCollectorsWorkAreaApi', { params: { DocEntry: workAreaId } });
      const data = (res?.data ?? res) as any[];

      const list: CollectorOptionT[] = (Array.isArray(data) ? data : [])
        .map((x) => ({
          empID: Number(x.U_UserCode ?? x.EmpID ?? x.empID ?? 0),
          fullName: String(x.fullName ?? x.FullName ?? x.name ?? '').trim(),
        }))
        .filter((x) => Number.isFinite(x.empID) && x.empID > 0);

      setCollectors(list);

      if (list.length === 1) setCollector(list[0]);
      else if (collector) {
        const found = list.find((c) => c.empID === collector.empID) || null;
        if (!found) setCollector(null);
      }
    } catch {
      setCollectors([]);
    } finally {
      setCollectorsLoading(false);
    }
  };

  const loadOnHand = async () => {
    if (!line?.ItemCode) return;
    try {
      setOnhandLoading(true);
      const res = await api.get('/getOnHandItemsApi', { params: { ItemCode: line.ItemCode, WhsCode: line.WhsCode } });
      const data = (res?.data ?? res) as OnHandRowT[];

      const arr = Array.isArray(data) ? data : [];
      setOnhand(arr.map((x) => ({ ...x, __k: kOnHand(x) })));
    } catch {
      setOnhand([]);
    } finally {
      setOnhandLoading(false);
    }
  };

  useEffect(() => {
    if (!visible) return;

    setAllocs([]);
    setSavedAllocs(buildSavedAllocsFromLine(line));
    setLeftSelected(null);
    setQty(0);
    setLeftFilter('');

    loadCollectors();
    loadOnHand();
  }, [visible, WorkAreaDocEntry, line?.ItemCode, line?.WhsCode]);

  useEffect(() => {
    if (!visible) return;
    setSavedAllocs(buildSavedAllocsFromLine(line));
  }, [visible, line?.CollectedQuantity, line?.CollectedEvents, line?.BinAllocations]);

  useEffect(() => {
    if (!visible) return;
    if (!collectors.length) return;

    const map = new Map<number, CollectorOptionT>();
    collectors.forEach((c) => map.set(Number(c.empID), c));

    setSavedAllocs((prev) =>
      prev.map((a) => {
        const emp = Number(a.collector?.empID || 0);
        if (!emp) return a;

        const fromList = map.get(emp);
        if (!fromList) return a;

        const curName = normStr(a.collector?.fullName);
        if (curName && curName !== '—') return a;

        return {
          ...a,
          collector: { ...a.collector, fullName: fromList.fullName || a.collector.fullName || '—' },
        };
      })
    );
  }, [visible, collectors]);

  const addAllocation = () => {
    if (!line) return;

    if (!collector) {
      showToast('warn', 'Внимание', 'Выберите сотрудника');
      return;
    }
    if (!leftSelected) {
      showToast('warn', 'Внимание', 'Выберите ячейку/партию слева');
      return;
    }

    const q = Math.max(0, num(qty));
    if (q <= 0) {
      showToast('warn', 'Внимание', 'Количество должно быть > 0');
      return;
    }

    const isBatch = String(leftSelected.IsBatchManaged || 'N').toUpperCase() === 'Y';
    const bn = normStr(leftSelected.BatchNumber);

    if (isBatch && !bn) {
      showToast('warn', 'Внимание', 'Для batch-managed товара выберите партию (BatchNumber)');
      return;
    }

    if (q > maxAddQty + 1e-9) {
      showToast('warn', 'Внимание', `Максимум можно добавить: ${fmtNum(maxAddQty, 2)}`);
      return;
    }

    const a: AllocationT = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      _src: 'local',
      collector,

      BinAbsEntry: leftSelected.BinAbsEntry,
      BinCode: leftSelected.BinCode,

      IsBatchManaged: leftSelected.IsBatchManaged,
      BatchNumber: bn || '', // ✅
      ExpDate: leftSelected.ExpDate || null,

      Qty: q,
    };

    setAllocs((p) => [...p, a]);
    setQty(0);
  };

  const removeLocal = (id: string) => setAllocs((p) => p.filter((x) => x.id !== id));

  const validateBeforeSave = () => {
    if (!line) return 'Нет строки';
    if (!allocs.length) return 'Справа нет выбранных партий/ячеек';

    if (selectedTotal > lineRemaining + 1e-9) {
      return `Сумма выбранных количеств (${fmtNum(selectedTotal, 2)}) больше чем остаток по строке (${fmtNum(lineRemaining, 2)})`;
    }

    const byKey = new Map<string, number>();
    for (const a of allocs) {
      const key = kKey(a.BinAbsEntry, a.BatchNumber);
      byKey.set(key, (byKey.get(key) || 0) + num(a.Qty));
    }

    for (const [key, sumQty] of byKey.entries()) {
      const base = onhandMap.get(key);
      if (!base) return `Остаток не найден (обновите): ${key}`;

      const oh = num(base.OnHandQty);

      const alreadyPickedTotal = pickedFromKey.get(key) || 0;
      const alreadyPickedWithoutThisNew = Math.max(0, alreadyPickedTotal - sumQty);
      const totalIfSavedPlusNew = alreadyPickedWithoutThisNew + sumQty;

      if (totalIfSavedPlusNew > oh + 1e-9) {
        return `Превышен остаток ${base.BinCode}${base.BatchNumber ? ' • ' + base.BatchNumber : ''}: ${fmtNum(
          totalIfSavedPlusNew,
          2
        )} > ${fmtNum(oh, 2)}`;
      }
    }

    return null;
  };

  const save = async () => {
    const err = validateBeforeSave();
    if (err) {
      showToast('warn', 'Внимание', err);
      return;
    }
    if (!socket || !socket.connected || !connected) {
      showToast('warn', 'Socket', 'Нет соединения');
      return;
    }
    if (!line) return;

    setSaving(true);

    let ok = 0;
    let fail = 0;

for (const a of allocs) {
  await new Promise<void>((resolve) => {
    const payload: any = {
      DocEntry: Number(DocEntry),
      DocNum: Number(DocNum),

      ...(line?.LineNum !== null && line?.LineNum !== undefined
        ? { LineNum: Number(line.LineNum) }
        : {}),

      ItemCode: line.ItemCode,
      WhsCode: line.WhsCode,

      collector: { empID: a.collector.empID, fullName: a.collector.fullName },

      BinAbsEntry: a.BinAbsEntry,
      BinCode: a.BinCode,

      BatchNumber: a.BatchNumber || '',  
      ExpDate: a.ExpDate || null,

      Qty: num(a.Qty),
    };

    socket.emit('orderPick:collect', payload, (ack: any) => {
      if (!ack?.ok) {
        fail += 1;
        showToast('warn', 'Ошибка', ack?.message || 'collect error');
      } else {
        ok += 1;
      }
      resolve();
    });
  });
}


    setSaving(false);

    if (fail > 0) {
      showToast('warn', 'Частично', `OK: ${ok}, Ошибка: ${fail}`);
      return;
    }

    showToast('success', 'Готово', 'Сбор сохранён');
    onHide();
  };

  const rightRows = useMemo(() => {
    const saved = savedAllocs.map((x) => ({ ...x, _src: 'saved' as const }));
    const local = allocs.map((x) => ({ ...x, _src: 'local' as const }));
    return [...saved, ...local];
  }, [savedAllocs, allocs]);

  const removeRightRow = async (a: any) => {
    if (a?._src === 'local') {
      removeLocal(a.id);
      return;
    }

    if (!socket || !socket.connected || !connected) {
      showToast('warn', 'Socket', 'Нет соединения');
      return;
    }
    if (!line) return;

    const empID = Number(a?.collector?.empID || 0);
    if (!empID) {
      showToast('warn', 'Нельзя удалить', 'empID не найден в событии (CollectedEvents).');
      return;
    }

    const common = {
      DocEntry: Number(DocEntry),
      DocNum: Number(DocNum),
      LineNum: line.LineNum,
      ItemCode: line.ItemCode,
      WhsCode: line.WhsCode,

      collector: {
        empID,
        fullName: resolveCollectorName(a),
      },

      BinAbsEntry: Number(a.BinAbsEntry),
      BinCode: normStr(a.BinCode),

      ExpDate: a.ExpDate || null,
      Qty: num(a.Qty),

      note: 'UNDO',
    };

    const bn = normStr(a.BatchNumber);

    const variants =
      a.IsBatchManaged === 'Y'
        ? [
            { ...common, BatchNumber: bn },
            { ...common, BatchNumber: bn || null },
          ]
        : [
            { ...common, BatchNumber: '' },
            { ...common, BatchNumber: null },
          ];

    const uniq = new Map<string, any>();
    for (const v of variants) uniq.set(String(v.BatchNumber), v);

    let lastAck: any = null;
    for (const payload of uniq.values()) {
      lastAck = await new Promise<any>((resolve) => {
        socket.emit('orderPick:uncollect', payload, (ack: any) => resolve(ack));
      });

      if (lastAck?.ok) {
        showToast('success', 'Готово', 'Сбор удалён');
        return;
      }
    }

    showToast('warn', 'Ошибка', lastAck?.message || 'Не удалось удалить сбор');
  };

  return (
    <Dialog
      header={`Сбор: ${line?.ItemCode || ''}${line?.ItemName ? ' • ' + line.ItemName : ''}`}
      visible={visible}
      style={{ width: 'min(1850px, 128vw)' }}
      onHide={onHide}
      draggable={false}
      modal
    >
      {!line ? (
        <div className="text-500">Нет строки</div>
      ) : (
        <div className="flex flex-column gap-3">
          <div className="flex flex-wrap align-items-center gap-2">
            <Tag value={`Остаток по строке: ${fmtNum(lineRemaining, 2)}`} severity="info" />
            <Tag value={`Собрано ранее: ${fmtNum(lineCollected, 2)}`} severity="secondary" />
            <Tag value={`Добавлено сейчас: ${fmtNum(selectedTotal, 2)}`} severity="success" />
            <Tag
              value={`Осталось выбрать: ${fmtNum(remainingToPick, 2)}`}
              severity={remainingToPick <= 0 ? 'success' : 'warning'}
            />
          </div>

          <div className="grid">
            <div className="col-12 lg:col-6">
              <div className="flex flex-column gap-2">
                <div className="flex flex-wrap align-items-end justify-content-between gap-2">
                  <div className="flex flex-column" style={{ minWidth: 360 }}>
                    <div className="text-600 text-sm">Сотрудник</div>
                    <Dropdown
                      value={collector}
                      options={collectors}
                      optionLabel="fullName"
                      placeholder="Выберите сотрудника"
                      className="w-full"
                      onChange={(e) => setCollector(e.value)}
                      disabled={collectorsLoading}
                    />
                    <div className="text-500 text-sm mt-1">
                      {collectors.length ? '' : 'Нет списка сотрудников — проверьте рабочую зону.'}
                    </div>
                  </div>

                  <div className="flex flex-column" style={{ minWidth: 220 }}>
                    <div className="text-600 text-sm mb-1">Кол-во</div>
                    <InputNumber
                      value={qty}
                      min={0}
                      max={maxAddQty || undefined}
                      inputStyle={{ width: '100%', textAlign: 'right' }}
                      onValueChange={(e) => setQty(num(e.value))}
                    />
                  </div>

                  <span className="p-input-icon-left">
                    <i className="pi pi-search" />
                    <InputText
                      value={leftFilter}
                      onChange={(e) => setLeftFilter(e.target.value)}
                      placeholder="Поиск bin/batch..."
                      style={{ width: 240 }}
                    />
                  </span>
                </div>

                <DataTable
                  value={leftRows as any}
                  loading={onhandLoading}
                  dataKey="__k"
                  selectionMode="single"
                  selection={leftSelected as any}
                  onSelectionChange={(e) => setLeftSelected(e.value as any)}
                  scrollable
                  scrollHeight="320px"
                  showGridlines
                  size="small"
                  emptyMessage="Нет остатков"
                >
                  <Column
                    header="Ячейка"
                    style={{ minWidth: 160 }}
                    body={(r: any) => <span className="font-medium">{r.BinCode}</span>}
                  />
                  <Column
                    header="Партия"
                    style={{ minWidth: 200 }}
                    body={(r: any) =>
                      r.IsBatchManaged === 'Y' ? r.BatchNumber || '-' : <span className="text-500">—</span>
                    }
                  />
                  <Column
                    header="Доступно"
                    style={{ minWidth: 120, textAlign: 'right' }}
                    body={(r: any) => <span className="font-semibold">{fmtNum(r.__avail, 2)}</span>}
                  />
                </DataTable>

                <div className="flex justify-content-end">
                  <Button
                    label="Добавить →"
                    icon="pi pi-arrow-right"
                    severity="success"
                    disabled={!collector || !leftSelected || num(qty) <= 0 || maxAddQty <= 0 || !connected}
                    onClick={addAllocation}
                  />
                </div>
              </div>
            </div>

            {/* RIGHT */}
            <div className="col-12 lg:col-6">
              <div className="flex flex-column gap-2">
                <div className="text-600 text-sm">Выбранные партии/ячейки</div>

                <DataTable
                  value={rightRows as any}
                  dataKey="id"
                  scrollable
                  scrollHeight="420px"
                  showGridlines
                  size="small"
                  emptyMessage="Справа пока пусто"
                >
                  <Column
                    header="Тип"
                    style={{ width: 90 }}
                    body={(a: any) => (
                      <Tag value={a._src === 'saved' ? 'Saved' : 'New'} severity={a._src === 'saved' ? 'info' : 'success'} />
                    )}
                  />
                  <Column
                    header="Collector"
                    style={{ minWidth: 200 }}
                    body={(a: any) => <span className="font-medium">{resolveCollectorName(a)}</span>}
                  />
                  <Column header="Bin" style={{ minWidth: 150 }} body={(a: any) => <span className="font-medium">{a.BinCode}</span>} />
                  <Column
                    header="Batch"
                    style={{ minWidth: 170 }}
                    body={(a: any) =>
                      a.IsBatchManaged === 'Y' ? a.BatchNumber || '-' : <span className="text-500">—</span>
                    }
                  />
                  <Column
                    header="Qty"
                    style={{ minWidth: 110, textAlign: 'right' }}
                    body={(a: any) => <span className="font-semibold">{fmtNum(a.Qty, 2)}</span>}
                  />
                  <Column
                    header=""
                    style={{ width: 60 }}
                    body={(a: any) => (
                      <Button icon="pi pi-times" severity="danger" text onClick={() => removeRightRow(a)} tooltip="Удалить" />
                    )}
                  />
                </DataTable>

                <div className="flex align-items-center justify-content-between">
                  <Tag value={`Saved: ${fmtNum(savedTotal, 2)}`} severity="info" />
                  <Tag value={`New: ${fmtNum(selectedTotal, 2)}`} severity="success" />
                  <Tag
                    value={`Осталось: ${fmtNum(remainingToPick, 2)}`}
                    severity={remainingToPick <= 0 ? 'success' : 'warning'}
                  />
                </div>

                <div className="flex justify-content-end gap-2 mt-2">
                  <Button label="Отмена" severity="secondary" onClick={onHide} />
                  <Button
                    label={saving ? 'Сохранение...' : 'Сохранить сбор'}
                    icon="pi pi-check"
                    severity="success"
                    disabled={!connected || saving || !allocs.length}
                    onClick={save}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
