'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { Button } from 'primereact/button';
import { InputNumber } from 'primereact/inputnumber';
import { InputText } from 'primereact/inputtext';
import { Tag } from 'primereact/tag';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import type { Toast } from 'primereact/toast';
import api from '@/app/api/api';

type CollectorOptionT = { empID: number; fullName: string };

type BinApiT = { BinAbsEntry: number; BinCode: string; WhsCode?: string; WhsName?: string };

type BinTransferLineT = {
  LineNum?: number | null;
  ItemCode: string;
  ItemName?: string | null;
  Quantity: number | string;
  FromBinAbsEntry?: number | null;
  FromBinCode?: string | null;
  ToBinAbsEntry?: number | null;
  ToBinCode?: string | null;
  MovedQuantity?: number | string;
  MoveDetails?: Array<{
    Qty?: number | string;
    BatchNumber?: string | null;
    ToBinAbsEntry?: number | null;
    ToBinCode?: string | null;
    by?: { empID?: number; fullName?: string } | null;
    UpdatedAt?: string | null;
  }>;
  IsBatchManaged?: 'Y' | 'N' | boolean | null;
  ManBtchNum?: 'Y' | 'N' | boolean | null;
};

type BatchRowT = {
  ItemCode?: string;
  WhsCode?: string;
  BinCode?: string;
  BinAbsEntry?: number;
  BatchNumber?: string;
  OnHandQty?: number | string;
};

type BatchSelectionT = {
  id: string;
  BatchNumber: string;
  Qty: number;
  OnHandQty: number;
  ToBinAbsEntry: number;
  ToBinCode?: string | null;
};

type SelectedRowT = {
  id: string;
  source: 'saved' | 'draft';
  BatchNumber?: string | null;
  Qty: number;
  ToBinAbsEntry?: number | null;
  ToBinCode?: string | null;
  by?: { empID?: number; fullName?: string } | null;
  UpdatedAt?: string | null;
  savedKey?: string;
};

type Props = {
  visible: boolean;
  onHide: () => void;

  toastRef?: React.RefObject<Toast>;

  socket: any;
  connected: boolean;

  DocEntry?: number;
  DocId?: string;

  line: BinTransferLineT | null;
  bins: BinApiT[];
  header?: { FromWhsCode?: string | null; FromWhsName?: string | null; ToWhsCode?: string | null; ToWhsName?: string | null };
  workAreaDocEntry?: number | null;
};

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmtNum = (v: any, digits = 2) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(num(v));

const fmtCollector = (by?: { empID?: number; fullName?: string } | null) => {
  const name = String(by?.fullName ?? '').trim();
  if (name) return name;
  if (by?.empID) return `#${by.empID}`;
  return '-';
};

const makeSavedKey = (d: any) => {
  const bn = String(d?.BatchNumber ?? '').trim();
  const toAbs = Number(d?.ToBinAbsEntry ?? 0);
  const qty = num(d?.Qty);
  const emp = Number(d?.by?.empID ?? 0);
  const at = String(d?.UpdatedAt ?? '').trim();
  return `${bn}|||${toAbs}|||${qty}|||${emp}|||${at}`;
};

const statusDotStyle = (source: 'saved' | 'draft') => ({
  width: 10,
  height: 10,
  borderRadius: '50%',
  display: 'inline-block',
  background: source === 'saved' ? '#22c55e' : '#f59e0b',
});

export default function BinMoveModal({
  visible,
  onHide,
  toastRef,
  socket,
  connected,
  DocEntry,
  DocId,
  line,
  bins,
  header,
  workAreaDocEntry,
}: Props) {
  const [collectors, setCollectors] = useState<CollectorOptionT[]>([]);
  const [collectorsLoading, setCollectorsLoading] = useState(false);

  const [collector, setCollector] = useState<CollectorOptionT | null>(null);
  const [fromBin, setFromBin] = useState<BinApiT | null>(null);
  const [toBin, setToBin] = useState<BinApiT | null>(null);
  const [qty, setQty] = useState<number>(0);
  const [batch, setBatch] = useState('');

  const [batchRows, setBatchRows] = useState<BatchRowT[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchSelectedRow, setBatchSelectedRow] = useState<BatchRowT | null>(null);
  const [batchQty, setBatchQty] = useState<number>(0);
  const [batchSelections, setBatchSelections] = useState<BatchSelectionT[]>([]);
  const [batchFilter, setBatchFilter] = useState('');
  const [hiddenSavedKeys, setHiddenSavedKeys] = useState<Set<string>>(() => new Set());

  const showToast = (severity: any, summary: string, detail: string) => {
    toastRef?.current?.show({ severity, summary, detail, life: 3000 });
  };

  const moved = useMemo(() => {
    if (!line) return 0;
    const base = num(line.MovedQuantity);
    if (base > 0) return base;
    const details = Array.isArray(line.MoveDetails) ? line.MoveDetails : [];
    return details.reduce((s, d) => s + num(d?.Qty), 0);
  }, [line]);

  const lineBatchFlag = useMemo(() => {
    const raw = line?.IsBatchManaged ?? line?.ManBtchNum ?? null;
    return String(raw ?? '').toUpperCase() === 'Y';
  }, [line]);

  const remaining = useMemo(() => {
    if (!line) return 0;
    return Math.max(num(line.Quantity) - moved, 0);
  }, [line, moved]);

  const batchTotal = useMemo(
    () => batchSelections.reduce((s, a) => s + Math.max(0, num(a.Qty)), 0),
    [batchSelections]
  );

  const isBatchManaged = lineBatchFlag || batchRows.length > 0;

  const binOptions = useMemo(
    () => bins.map((b) => ({ label: b.BinCode, value: String(b.BinAbsEntry) })),
    [bins]
  );

  const pickedByBatch = useMemo(() => {
    const map = new Map<string, number>();
    const add = (bn: any, q: any) => {
      const key = String(bn ?? '').trim();
      if (!key) return;
      map.set(key, (map.get(key) || 0) + num(q));
    };
    batchSelections.forEach((s) => add(s.BatchNumber, s.Qty));
    const details = Array.isArray(line?.MoveDetails) ? line.MoveDetails : [];
    details.forEach((d) => {
      const key = makeSavedKey(d);
      if (hiddenSavedKeys.has(key)) return;
      add(d.BatchNumber, d.Qty);
    });
    return map;
  }, [batchSelections, line?.MoveDetails, hiddenSavedKeys]);

  const batchLeftRows = useMemo(() => {
    const f = batchFilter.trim().toLowerCase();
    return batchRows
      .map((r) => {
        const bn = String(r.BatchNumber ?? '').trim();
        const picked = pickedByBatch.get(bn) || 0;
        const avail = Math.max(num(r.OnHandQty) - picked, 0);
        return { ...r, __avail: avail, __picked: picked };
      })
      .filter((r: any) => r.__avail > 0)
      .filter((r: any) => {
        if (!f) return true;
        return String(r.BatchNumber || '').toLowerCase().includes(f);
      });
  }, [batchRows, pickedByBatch, batchFilter]);

  const savedSelections = useMemo<SelectedRowT[]>(() => {
    const details = Array.isArray(line?.MoveDetails) ? line.MoveDetails : [];
    return details
      .map((d, idx) => ({
        id: `saved:${idx}`,
        source: 'saved' as const,
        BatchNumber: String(d.BatchNumber ?? '').trim() || null,
        Qty: num(d.Qty),
        ToBinAbsEntry: d.ToBinAbsEntry ?? null,
        ToBinCode: d.ToBinCode ?? null,
        by: d.by ?? null,
        UpdatedAt: d.UpdatedAt ?? null,
        savedKey: makeSavedKey(d),
      }))
      .filter((d) => d.Qty > 0 && (!d.savedKey || !hiddenSavedKeys.has(d.savedKey)));
  }, [line?.MoveDetails, hiddenSavedKeys]);

  const draftSelections = useMemo<SelectedRowT[]>(() => {
    const draftBy = collector ? { empID: collector.empID, fullName: collector.fullName } : null;
    if (isBatchManaged) {
      return batchSelections
        .map((s) => ({
          id: s.id,
          source: 'draft' as const,
          BatchNumber: String(s.BatchNumber ?? '').trim() || null,
          Qty: num(s.Qty),
          ToBinAbsEntry: s.ToBinAbsEntry ?? null,
          ToBinCode: s.ToBinCode ?? null,
          by: draftBy,
        }))
        .filter((s) => s.Qty > 0);
    }

    const q = num(qty);
    if (q <= 0) return [];
    return [
      {
        id: 'draft:single',
        source: 'draft' as const,
        BatchNumber: String(batch ?? '').trim() || null,
        Qty: q,
        ToBinAbsEntry: toBin?.BinAbsEntry ?? null,
        ToBinCode: toBin?.BinCode ?? null,
        by: draftBy,
      },
    ];
  }, [collector, isBatchManaged, batchSelections, qty, batch, toBin]);

  const selectedRows = useMemo(() => [...savedSelections, ...draftSelections], [savedSelections, draftSelections]);

  const loadCollectors = async () => {
    const workAreaId = Number(workAreaDocEntry);
    if (!Number.isFinite(workAreaId) || workAreaId <= 0) return;

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
    } catch {
      setCollectors([]);
    } finally {
      setCollectorsLoading(false);
    }
  };

  const loadBatches = async () => {
    if (!line?.ItemCode || !fromBin?.BinCode) {
      setBatchRows([]);
      return;
    }

    try {
      setBatchSelectedRow(null);
      setBatchQty(0);
      setBatchSelections([]);
      setBatchFilter('');
      setBatchLoading(true);

      const res = await api.get('/getOnHandByBinBatchApi', {
        params: { ItemCode: line.ItemCode, Bin: fromBin.BinCode },
      });
      const data = (res?.data ?? res) as BatchRowT[];

      const list = (Array.isArray(data) ? data : [])
        .map((r) => ({
          ...r,
          BatchNumber: String(r.BatchNumber ?? '').trim(),
          OnHandQty: num(r.OnHandQty),
        }))
        .filter((r) => r.BatchNumber);

      setBatchRows(list);
    } catch {
      setBatchRows([]);
    } finally {
      setBatchLoading(false);
    }
  };

  useEffect(() => {
    if (!visible) return;
    loadCollectors();
  }, [visible, workAreaDocEntry]);

  useEffect(() => {
    if (!visible || !line) return;

    const from = bins.find((b) => Number(b.BinAbsEntry) === Number(line.FromBinAbsEntry)) || null;
    const to = bins.find((b) => Number(b.BinAbsEntry) === Number(line.ToBinAbsEntry)) || null;

    setFromBin(from);
    setToBin(to);
    setQty(Math.min(remaining, remaining > 0 ? remaining : 0));
    setBatch('');

    setBatchRows([]);
    setBatchSelectedRow(null);
    setBatchQty(0);
    setBatchSelections([]);
    setBatchFilter('');
    setHiddenSavedKeys(new Set());
  }, [visible, line, bins, remaining]);

  useEffect(() => {
    if (!visible) return;
    loadBatches();
  }, [visible, line?.ItemCode, fromBin?.BinCode]);

  const addBatchSelection = () => {
    if (!batchRows.length) {
      showToast('warn', 'Проверка', 'Партии не найдены');
      return;
    }
    if (!toBin?.BinAbsEntry) {
      showToast('warn', 'Проверка', 'Выберите ячейку назначения');
      return;
    }
    if (!batchSelectedRow?.BatchNumber) {
      showToast('warn', 'Проверка', 'Выберите партию');
      return;
    }

    const bn = String(batchSelectedRow.BatchNumber ?? '').trim();
    const row = batchRows.find((r) => String(r.BatchNumber ?? '').trim() === bn) || batchSelectedRow;
    const alreadyPicked = pickedByBatch.get(bn) || 0;
    const maxAvail = Math.max(0, num(row?.OnHandQty) - alreadyPicked);
    const q = Math.max(0, num(batchQty));

    if (q <= 0) {
      showToast('warn', 'Проверка', 'Количество должно быть больше 0');
      return;
    }
    if (q > maxAvail + 1e-9) {
      showToast('warn', 'Проверка', `Максимум доступно: ${fmtNum(maxAvail, 2)}`);
      return;
    }
    if (batchTotal + q > remaining + 1e-9) {
      showToast('warn', 'Проверка', `Остаток: ${fmtNum(remaining, 2)}`);
      return;
    }

    const toAbs = Number(toBin.BinAbsEntry);
    const toCode = toBin.BinCode || null;

    setBatchSelections((prev) => {
      const existing = prev.find((x) => x.BatchNumber === bn && x.ToBinAbsEntry === toAbs);
      if (!existing) {
        return [
          ...prev,
          {
            id: `${bn}::${toAbs}`,
            BatchNumber: bn,
            Qty: q,
            OnHandQty: num(row?.OnHandQty),
            ToBinAbsEntry: toAbs,
            ToBinCode: toCode,
          },
        ];
      }
      return prev.map((x) =>
        x.BatchNumber === bn && x.ToBinAbsEntry === toAbs
          ? { ...x, Qty: x.Qty + q, OnHandQty: num(row?.OnHandQty), ToBinCode: toCode }
          : x
      );
    });

    setBatchQty(0);
  };

  const updateBatchQty = (id: string, bn: string, value: number) => {
    const key = String(bn ?? '').trim();
    const row = batchRows.find((r) => String(r.BatchNumber ?? '').trim() === key);
    const current = batchSelections.find((x) => x.id === id);
    const alreadyPicked = (pickedByBatch.get(key) || 0) - num(current?.Qty);
    const maxAvail = Math.max(0, num(row?.OnHandQty) - alreadyPicked);
    const v = Math.max(0, num(value));
    setBatchSelections((prev) =>
      prev.map((x) =>
        x.id === id ? { ...x, Qty: Math.min(v, maxAvail), OnHandQty: num(row?.OnHandQty) } : x
      )
    );
  };

  const removeBatchSelection = (id: string) => {
    setBatchSelections((prev) => prev.filter((x) => x.id !== id));
  };

  const hideSavedKey = (key?: string | null) => {
    const k = String(key ?? '').trim();
    if (!k) return;
    setHiddenSavedKeys((prev) => {
      const next = new Set(prev);
      next.add(k);
      return next;
    });
  };

  const removeSelectedRow = async (r: SelectedRowT) => {
    if (r.source === 'draft') {
      if (isBatchManaged) {
        removeBatchSelection(r.id);
      } else {
        setQty(0);
        setBatch('');
      }
      return;
    }

    if (!socket || !socket.connected || !connected) {
      showToast('warn', 'Соединение', 'Нет соединения');
      return;
    }
    if (!line) return;

    const by =
      r.by && Number(r.by.empID || 0) > 0
        ? { empID: Number(r.by.empID), fullName: String(r.by.fullName ?? '').trim() }
        : collector
        ? { empID: collector.empID, fullName: collector.fullName }
        : null;

    if (!by || !by.empID) {
      showToast('warn', 'Проверка', 'Сотрудник не найден');
      return;
    }

    const fromAbs = Number(fromBin?.BinAbsEntry ?? line.FromBinAbsEntry ?? 0);
    const toAbs = Number(r.ToBinAbsEntry ?? toBin?.BinAbsEntry ?? line.ToBinAbsEntry ?? 0);
    if (!fromAbs || !toAbs) {
      showToast('warn', 'Проверка', 'Данные ячейки не найдены');
      return;
    }

    const payload = {
      ...(DocEntry ? { DocEntry } : {}),
      ...(DocId ? { id: DocId } : {}),
      LineNum: line.LineNum,
      ItemCode: line.ItemCode,
      Qty: num(r.Qty),
      by,
      FromWhsCode: header?.FromWhsCode ?? undefined,
      FromWhsName: header?.FromWhsName ?? undefined,
      ToWhsCode: header?.ToWhsCode ?? header?.FromWhsCode ?? undefined,
      ToWhsName: header?.ToWhsName ?? header?.FromWhsName ?? undefined,
      FromBinAbsEntry: fromAbs,
      FromBinCode: fromBin?.BinCode ?? line.FromBinCode,
      ToBinAbsEntry: toAbs,
      ToBinCode: r.ToBinCode ?? toBin?.BinCode ?? line.ToBinCode,
      BatchNumber: r.BatchNumber ?? '',
    };

    const ack = await new Promise<any>((resolve) => {
      socket.emit('binToBin:removeDetail', payload, (a: any) => resolve(a));
    });

    if (!ack?.ok) {
      showToast('error', 'Ошибка', ack?.message || 'Ошибка при удалении');
      return;
    }

    hideSavedKey(r.savedKey ?? makeSavedKey(r));
    showToast('success', 'Готово', 'Строка удалена');
  };

  const save = async () => {
    if (!line) return;
    if (!collector) {
      showToast('warn', 'Проверка', 'Выберите сборщика');
      return;
    }
    if (!fromBin || !toBin) {
      showToast('warn', 'Проверка', 'Выберите ячейки');
      return;
    }
    if (fromBin.BinAbsEntry === toBin.BinAbsEntry) {
      showToast('warn', 'Проверка', 'Ячейки должны отличаться');
      return;
    }
    if (!socket || !socket.connected || !connected) {
      showToast('warn', 'Соединение', 'Нет соединения');
      return;
    }

    if (!isBatchManaged) {
      if (qty <= 0) {
        showToast('warn', 'Проверка', 'Количество должно быть больше 0');
        return;
      }
      if (qty > remaining + 1e-9) {
        showToast('warn', 'Проверка', `Максимум доступно: ${fmtNum(remaining, 2)}`);
        return;
      }

      await new Promise<void>((resolve) => {
        socket.emit(
          'binToBin:applyMove',
          {
            ...(DocEntry ? { DocEntry } : {}),
            ...(DocId ? { id: DocId } : {}),
            LineNum: line.LineNum,
            ItemCode: line.ItemCode,
            Qty: qty,
            by: { empID: collector.empID, fullName: collector.fullName },
            FromWhsCode: header?.FromWhsCode ?? undefined,
            FromWhsName: header?.FromWhsName ?? undefined,
            ToWhsCode: header?.ToWhsCode ?? header?.FromWhsCode ?? undefined,
            ToWhsName: header?.ToWhsName ?? header?.FromWhsName ?? undefined,
            FromBinAbsEntry: Number(fromBin.BinAbsEntry),
            FromBinCode: fromBin.BinCode,
            ToBinAbsEntry: Number(toBin.BinAbsEntry),
            ToBinCode: toBin.BinCode,
            BatchNumber: batch.trim() || undefined,
          },
          (ack: any) => {
            if (!ack?.ok) {
              showToast('error', 'Ошибка', ack?.message || 'Не удалось сохранить');
            } else {
              showToast('success', 'Готово', 'Перемещение сохранено');
              onHide();
            }
            resolve();
          }
        );
      });
      return;
    }

    if (!batchSelections.length) {
      showToast('warn', 'Проверка', 'Выберите партию и количество');
      return;
    }
    if (batchTotal <= 0) {
      showToast('warn', 'Проверка', 'Количество должно быть больше 0');
      return;
    }
    if (batchTotal > remaining + 1e-9) {
      showToast('warn', 'Проверка', `Максимум доступно: ${fmtNum(remaining, 2)}`);
      return;
    }

    let ok = 0;
    let fail = 0;

    for (const s of batchSelections) {
      const q = Math.max(0, num(s.Qty));
      if (q <= 0) continue;
      if (q > num(s.OnHandQty) + 1e-9) {
        showToast('warn', 'Проверка', `Партия ${s.BatchNumber}: превышает остаток`);
        fail += 1;
        continue;
      }
      if (!s.ToBinAbsEntry) {
        showToast('warn', 'Проверка', `Партия ${s.BatchNumber}: ячейка не указана`);
        fail += 1;
        continue;
      }

      await new Promise<void>((resolve) => {
        socket.emit(
          'binToBin:applyMove',
          {
            ...(DocEntry ? { DocEntry } : {}),
            ...(DocId ? { id: DocId } : {}),
            LineNum: line.LineNum,
            ItemCode: line.ItemCode,
            Qty: q,
            by: { empID: collector.empID, fullName: collector.fullName },
            FromWhsCode: header?.FromWhsCode ?? undefined,
            FromWhsName: header?.FromWhsName ?? undefined,
            ToWhsCode: header?.ToWhsCode ?? header?.FromWhsCode ?? undefined,
            ToWhsName: header?.ToWhsName ?? header?.FromWhsName ?? undefined,
            FromBinAbsEntry: Number(fromBin.BinAbsEntry),
            FromBinCode: fromBin.BinCode,
            ToBinAbsEntry: Number(s.ToBinAbsEntry),
            ToBinCode: s.ToBinCode ?? undefined,
            BatchNumber: s.BatchNumber,
          },
          (ack: any) => {
            if (!ack?.ok) {
              fail += 1;
              showToast('error', 'Ошибка', ack?.message || 'Не удалось сохранить');
            } else {
              ok += 1;
            }
            resolve();
          }
        );
      });
    }

    if (fail > 0) {
      showToast('warn', 'Частично', `ОК: ${ok}, Ошибка: ${fail}`);
      return;
    }

    showToast('success', 'Готово', 'Перемещение сохранено');
    onHide();
  };

  const selectedTable = (
    <div className="flex flex-column gap-2">
      <div className="text-600 text-sm mb-2">{isBatchManaged ? 'Выбранные партии' : 'Выбранные'}</div>
      <DataTable
        value={selectedRows as any}
        dataKey="id"
        scrollable
        scrollHeight="240px"
        showGridlines
        size="small"
        emptyMessage="Нет выбранных"
      >
        <Column
          header=""
          style={{ width: 40, textAlign: 'center' }}
          body={(r: SelectedRowT) => (
            <span style={statusDotStyle(r.source)} title={r.source === 'saved' ? 'Сохранено' : 'Новая'} />
          )}
        />
        {isBatchManaged ? (
          <Column
            header="Партия"
            style={{ minWidth: 150 }}
            body={(r: SelectedRowT) => <span className="font-medium">{r.BatchNumber || '-'}</span>}
          />
        ) : null}
        <Column
          header="Сотрудник"
          style={{ minWidth: 160 }}
          body={(r: SelectedRowT) => {
            const name = fmtCollector(r.by);
            return <span className={name === '-' ? 'text-500' : 'font-medium'}>{name}</span>;
          }}
        />
        <Column
          header="Кол-во"
          style={{ minWidth: 130 }}
          body={(r: SelectedRowT) => {
            const canEdit = isBatchManaged && r.source === 'draft' && r.id !== 'draft:single';
            if (canEdit) {
              return (
                <InputNumber
                  value={r.Qty}
                  onValueChange={(e) => updateBatchQty(r.id, String(r.BatchNumber ?? ''), num(e.value))}
                  min={0}
                  className="w-8rem"
                />
              );
            }
            return <span className="font-semibold">{fmtNum(r.Qty, 2)}</span>;
          }}
        />
        <Column
          header="Куда"
          style={{ minWidth: 140 }}
          body={(r: SelectedRowT) => <span className="text-500">{r.ToBinCode || r.ToBinAbsEntry || '-'}</span>}
        />
        <Column
          header=""
          style={{ width: 70 }}
          body={(r: SelectedRowT) => {
            return <Button icon="pi pi-trash" severity="danger" text onClick={() => removeSelectedRow(r)} />;
          }}
        />
      </DataTable>
      {isBatchManaged ? <div className="text-500 text-sm mt-2">Новый итог: {fmtNum(batchTotal, 2)}</div> : null}
    </div>
  );

  return (
    <Dialog
      header={`Перемещение: ${line?.ItemCode || ''}${line?.ItemName ? ' • ' + line.ItemName : ''}`}
      visible={visible}
      onHide={onHide}
      style={{ width: 'min(1200px, 98vw)' }}
      modal
      draggable={false}
    >
      {!line ? (
        <div className="text-500">Нет данных</div>
      ) : (
        <div className="flex flex-column gap-3">
          <div className="flex flex-wrap align-items-center gap-2">
            <Tag value={`План: ${fmtNum(line.Quantity, 2)}`} severity="info" />
            <Tag value={`Сделано: ${fmtNum(moved, 2)}`} severity="secondary" />
            <Tag value={`Осталось: ${fmtNum(remaining, 2)}`} severity={remaining <= 0 ? 'success' : 'warning'} />
          </div>

          <div className="grid">
            <div className="col-12 md:col-6">
              <label className="block mb-2">Сборщик</label>
              <Dropdown
                value={collector}
                options={collectors}
                optionLabel="fullName"
                placeholder="Выберите сборщика"
                className="w-full"
                onChange={(e) => setCollector(e.value)}
                disabled={collectorsLoading}
              />
            </div>

            {!isBatchManaged ? (
              <div className="col-12 md:col-6">
                <label className="block mb-2">Партия (если есть)</label>
                <InputText value={batch} onChange={(e) => setBatch(e.target.value)} className="w-full" />
              </div>
            ) : null}

            <div className="col-12 md:col-4">
              <label className="block mb-2">Откуда (ячейка)</label>
              <Dropdown
                value={fromBin?.BinAbsEntry != null ? String(fromBin.BinAbsEntry) : null}
                options={binOptions}
                onChange={(e) => {
                  const found = bins.find((b) => String(b.BinAbsEntry) === String(e.value)) || null;
                  setFromBin(found);
                }}
                placeholder="Ячейка"
                filter
                showClear
                className="w-full"
              />
            </div>
            <div className="col-12 md:col-4">
              <label className="block mb-2">Куда (ячейка)</label>
              <Dropdown
                value={toBin?.BinAbsEntry != null ? String(toBin.BinAbsEntry) : null}
                options={binOptions}
                onChange={(e) => {
                  const found = bins.find((b) => String(b.BinAbsEntry) === String(e.value)) || null;
                  setToBin(found);
                }}
                placeholder="Ячейка"
                filter
                showClear
                className="w-full"
              />
            </div>
            {!isBatchManaged ? (
              <div className="col-12 md:col-4">
                <label className="block mb-2">Количество</label>
                <InputNumber
                  value={qty}
                  onValueChange={(e) => setQty(num(e.value))}
                  min={0}
                  max={remaining || undefined}
                  className="w-full"
                />
              </div>
            ) : null}
          </div>

          {isBatchManaged ? (
            <div className="flex flex-column gap-2">
              <div className="text-600 text-sm">Партии</div>

              <div className="grid">
                <div className="col-12 lg:col-6">
                  <div className="flex align-items-center justify-content-between gap-2 mb-2">
                    <div className="text-600 text-sm">Доступные партии</div>
                    <span className="p-input-icon-left">
                      <i className="pi pi-search" />
                      <InputText
                        value={batchFilter}
                        onChange={(e) => setBatchFilter(e.target.value)}
                        placeholder="Поиск партии..."
                        style={{ width: 200 }}
                      />
                    </span>
                  </div>

                  <DataTable
                    value={batchLeftRows as any}
                    loading={batchLoading}
                    dataKey="BatchNumber"
                    selectionMode="single"
                    selection={batchSelectedRow as any}
                    onSelectionChange={(e) => setBatchSelectedRow(e.value as any)}
                    scrollable
                    scrollHeight="240px"
                    showGridlines
                    size="small"
                    emptyMessage="Партии не найдены"
                  >
                    <Column
                      header="Партия"
                      style={{ minWidth: 180 }}
                      body={(r: any) => <span className="font-medium">{r.BatchNumber}</span>}
                    />
                    <Column
                      header="Всего"
                      style={{ minWidth: 110, textAlign: 'right' }}
                      body={(r: any) => <span className="font-semibold">{fmtNum(r.OnHandQty, 2)}</span>}
                    />
                    <Column
                      header="Доступно"
                      style={{ minWidth: 110, textAlign: 'right' }}
                      body={(r: any) => <span className="font-semibold">{fmtNum(r.__avail, 2)}</span>}
                    />
                  </DataTable>

                  <div className="flex align-items-end gap-2 mt-2">
                    <div className="flex flex-column">
                      <label className="block mb-1">Количество</label>
                      <InputNumber
                        value={batchQty}
                        onValueChange={(e) => setBatchQty(num(e.value))}
                        min={0}
                        className="w-8rem"
                      />
                    </div>
                    <Button label="Добавить" icon="pi pi-arrow-right" onClick={addBatchSelection} disabled={!batchSelectedRow} />
                  </div>
                </div>

                <div className="col-12 lg:col-6">
                  {selectedTable}
                </div>
              </div>
            </div>
          ) : null}

          {!isBatchManaged ? <div className="flex flex-column gap-2">{selectedTable}</div> : null}

          <div className="flex justify-content-end gap-2">
            <Button label="Отмена" severity="secondary" onClick={onHide} />
            <Button label="Сохранить" icon="pi pi-check" severity="success" onClick={save} />
          </div>
        </div>
      )}
    </Dialog>
  );
}
