'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Card } from 'primereact/card';
import { Dialog } from 'primereact/dialog';
import { Toast } from 'primereact/toast';
import { Tag } from 'primereact/tag';
import { Button } from 'primereact/button';
import { Divider } from 'primereact/divider';
import { DataTable, DataTableFilterMeta } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { ProgressBar } from 'primereact/progressbar';
import { FilterMatchMode } from 'primereact/api';
import { Dropdown } from 'primereact/dropdown';

import api from '@/app/api/api';

type BatchAllocationT = {
  BatchNumber: string;
  Quantity: number | string;
};

type SalesReturnLineT = {
  DocNum?: number | null;
  DocEntry?: number | null;
  DocDate?: string | null;
  DocDueDate?: string | null;
  CardCode?: string | null;
  CardName?: string | null;
  SlpName?: string | null;
  U_State?: string | null;
  U_WorkArea?: number | string | null;
  U_WorkAreaName?: string | null;
  Comments?: string | null;

  LineNum?: number | null;
  ItemCode?: string | null;
  ItemName?: string | null;
  WhsCode?: string | null;

  Quantity?: number | string | null;
  OpenQty?: number | string | null;
  CollectedQuantity?: number | string | null;
  CollectedCount?: number | string | null;
  RemainingQuantity?: number | string | null;

  IsBatchManaged?: boolean | null;
  BatchManaged?: boolean | null;
  ManBtchNum?: 'Y' | 'N' | null;

  BatchAllocations?: BatchAllocationT[] | null;
};

type WhsApiT = { WhsCode: string; WhsName: string };
type BinApiT = { BinAbsEntry: number; BinCode: string };

type ItemBatchT = {
  ItemCode?: string | null;
  BatchNumber?: string | null;
  MnfDate?: string | null;
  ExpDate?: string | null;
  OnHandQty?: number | string | null;
};

type EditableBatchAllocT = {
  BatchNumber: string;
  Quantity: number;
};

type NewBatchRowT = {
  id: string;
  BatchNumber: string;
  Quantity: number;
};

type LineInputT = {
  qty: number;
  batchAllocs: EditableBatchAllocT[];
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

const clamp = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const normBatch = (v: unknown) => String(v ?? '').trim();
const batchKey = (v: unknown) => normBatch(v).toUpperCase();

const normalizeBatchAllocs = (list: unknown): EditableBatchAllocT[] => {
  const arr = Array.isArray(list) ? list : [];
  return arr
    .map((x: any) => ({ BatchNumber: normBatch(x?.BatchNumber), Quantity: num(x?.Quantity) }))
    .filter((x) => !!x.BatchNumber && x.Quantity > 0);
};

const mergeBatchAllocs = (list: EditableBatchAllocT[]): EditableBatchAllocT[] => {
  const map = new Map<string, EditableBatchAllocT>();
  for (const r of list) {
    const bn = normBatch(r.BatchNumber);
    const q = num(r.Quantity);
    if (!bn || q <= 0) continue;

    const key = batchKey(bn);
    const cur = map.get(key);
    if (cur) cur.Quantity += q;
    else map.set(key, { BatchNumber: bn, Quantity: q });
  }
  return Array.from(map.values());
};

const sumBatchAllocs = (list: EditableBatchAllocT[]) => list.reduce((s, x) => s + num(x.Quantity), 0);

export default function SalesReturnDetailPage() {
  const toast = useRef<Toast>(null);
  const router = useRouter();
  const sp = useSearchParams();

  const DocEntry = sp.get('DocEntry') || '';
  const DocNum = sp.get('DocNum') || '';

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<SalesReturnLineT[]>([]);
  const [selectedRows, setSelectedRows] = useState<SalesReturnLineT[]>([]);

  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendingToSap, setSendingToSap] = useState(false);

  const [warehouses, setWarehouses] = useState<WhsApiT[]>([]);
  const [bins, setBins] = useState<BinApiT[]>([]);
  const [whsLoading, setWhsLoading] = useState(false);
  const [binsLoading, setBinsLoading] = useState(false);
  const [selectedWhs, setSelectedWhs] = useState<string | null>(null);
  const [selectedBinAbsEntry, setSelectedBinAbsEntry] = useState<number | null>(null);

  const [globalFilterValue, setGlobalFilterValue] = useState('');
  const [filters, setFilters] = useState<DataTableFilterMeta>({
    global: { value: null, matchMode: FilterMatchMode.CONTAINS },
  });

  const [lineInputs, setLineInputs] = useState<Record<string, LineInputT>>({});

  const [lineModalOpen, setLineModalOpen] = useState(false);
  const [lineModalRow, setLineModalRow] = useState<SalesReturnLineT | null>(null);
  const [lineModalQty, setLineModalQty] = useState(0);

  const [lineModalBatchesLoading, setLineModalBatchesLoading] = useState(false);
  const [lineModalSapBatches, setLineModalSapBatches] = useState<ItemBatchT[]>([]);
  const [lineModalExistingQty, setLineModalExistingQty] = useState<Record<string, number>>({});
  const [lineModalNewBatches, setLineModalNewBatches] = useState<NewBatchRowT[]>([]);

  const lineKey = useCallback(
    (r: SalesReturnLineT) => `L:${String(r.LineNum ?? '')}|||${String(r.ItemCode ?? '').trim()}|||${String(r.WhsCode ?? '').trim()}`,
    []
  );

  const isBatchManagedLine = (r: SalesReturnLineT) => {
    if (r.IsBatchManaged != null) return Boolean(r.IsBatchManaged);
    if (r.BatchManaged != null) return Boolean(r.BatchManaged);
    if (r.ManBtchNum != null) return String(r.ManBtchNum).toUpperCase() === 'Y';
    const input = lineInputs[lineKey(r)];
    return (input?.batchAllocs || []).length > 0;
  };

  const getLineInput = useCallback(
    (r: SalesReturnLineT): LineInputT => {
      const input = lineInputs[lineKey(r)];
      if (input) return input;
      return { qty: num(r.CollectedQuantity), batchAllocs: normalizeBatchAllocs(r.BatchAllocations) };
    },
    [lineInputs, lineKey]
  );

  const headerInfo = useMemo(() => {
    const r = rows?.[0];
    if (!r) return null;
    return {
      DocNum: r.DocNum ?? Number(DocNum),
      DocEntry: r.DocEntry ?? Number(DocEntry),
      DocDate: r.DocDate,
      DocDueDate: r.DocDueDate,
      CardCode: r.CardCode,
      CardName: r.CardName,
      SlpName: r.SlpName,
      WorkAreaName: r.U_WorkAreaName,
      U_State: r.U_State,
      Comments: r.Comments,
    };
  }, [rows, DocEntry, DocNum]);

  const totals = useMemo(() => {
    const arr = rows || [];
    const openQty = arr.reduce((s, r) => s + num(r.OpenQty ?? r.Quantity), 0);
    const collected = arr.reduce((s, r) => s + num(getLineInput(r).qty), 0);
    const remaining = arr.reduce((s, r) => {
      const open = num(r.OpenQty ?? r.Quantity);
      const col = num(getLineInput(r).qty);
      return s + Math.max(open - col, 0);
    }, 0);
    const pct = openQty > 0 ? (collected / openQty) * 100 : 0;
    return { lines: arr.length, openQty, collected, remaining, pct: clamp(pct) };
  }, [rows, getLineInput]);

  const load = useCallback(async () => {
    try {
      if (!DocEntry) {
        toast.current?.show({ severity: 'warn', summary: 'Warning', detail: 'DocEntry missing in URL', life: 3000 });
        return;
      }
      setLoading(true);

      const res = await api.get('/SalesReturnDocDetailPageApi', { params: { DocEntry, DocNum } });
      const data = (res?.data ?? res) as SalesReturnLineT[];
      const normalized = Array.isArray(data) ? data : [];

      setRows(normalized);
      setSelectedRows([]);

      const nextInputs: Record<string, LineInputT> = {};
      for (const r of normalized) {
        nextInputs[lineKey(r)] = {
          qty: num(r.CollectedQuantity),
          batchAllocs: normalizeBatchAllocs(r.BatchAllocations),
        };
      }
      setLineInputs(nextInputs);
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: e?.response?.data?.message || 'Failed to load return document',
        life: 3500,
      });
    } finally {
      setLoading(false);
    }
  }, [DocEntry, DocNum, lineKey]);

  useEffect(() => {
    load();
  }, [load]);

  const whsOptions = useMemo(() => warehouses.map((w) => ({ label: `${w.WhsCode} - ${w.WhsName}`, value: w.WhsCode })), [warehouses]);
  const binOptions = useMemo(() => bins.map((b) => ({ label: b.BinCode, value: b.BinAbsEntry })), [bins]);

  const selectedWhsDefault = useMemo(() => {
    const set = new Set((selectedRows || []).map((r) => String(r.WhsCode || '').trim()).filter(Boolean));
    return set.size === 1 ? Array.from(set)[0] : null;
  }, [selectedRows]);

  const loadWhs = async () => {
    try {
      setWhsLoading(true);
      const res = await api.get('/getWhsCodesApi');
      setWarehouses((res?.data ?? res) as WhsApiT[]);
    } catch {
      setWarehouses([]);
    } finally {
      setWhsLoading(false);
    }
  };

  const loadBins = async (whsCode: string) => {
    try {
      setBinsLoading(true);
      const res = await api.get('/getBinsWhsApi', { params: { WhsCode: whsCode } });
      const data = (res?.data ?? res) as any[];
      const arr: BinApiT[] = (Array.isArray(data) ? data : [])
        .map((b) => ({
          BinAbsEntry: Number(b.BinAbsEntry ?? b.AbsEntry ?? b.binAbsEntry ?? b.absEntry),
          BinCode: String(b.BinCode ?? b.binCode ?? '').trim(),
        }))
        .filter((b) => Number.isFinite(b.BinAbsEntry) && !!b.BinCode);

      setBins(arr);
      setSelectedBinAbsEntry((prev) => (prev && arr.some((b) => b.BinAbsEntry === prev) ? prev : arr[0]?.BinAbsEntry ?? null));
    } catch {
      setBins([]);
      setSelectedBinAbsEntry(null);
    } finally {
      setBinsLoading(false);
    }
  };

  useEffect(() => {
    if (!sendModalOpen) return;
    loadWhs();
    setSelectedWhs((prev) => prev || selectedWhsDefault || null);
    setSelectedBinAbsEntry(null);
  }, [sendModalOpen, selectedWhsDefault]);

  useEffect(() => {
    if (!sendModalOpen) return;
    if (!selectedWhs) {
      setBins([]);
      setSelectedBinAbsEntry(null);
      return;
    }
    loadBins(selectedWhs);
  }, [sendModalOpen, selectedWhs]);

  const openLineModal = async (row: SalesReturnLineT) => {
    const key = lineKey(row);
    const input = getLineInput(row);

    setLineModalRow(row);
    setLineModalQty(num(input.qty));
    setLineModalSapBatches([]);
    setLineModalExistingQty({});
    setLineModalNewBatches([]);
    setLineModalOpen(true);

    if (!isBatchManagedLine(row)) return;

    try {
      setLineModalBatchesLoading(true);
      const res = await api.get('/getBatchesByItemApi', { params: { ItemCode: row.ItemCode } });
      const data = (res?.data ?? res) as ItemBatchT[];
      const sapBatches = Array.isArray(data) ? data.map((x) => ({ ...x, BatchNumber: normBatch(x.BatchNumber) })) : [];

      const savedMap = new Map<string, EditableBatchAllocT>();
      input.batchAllocs.forEach((a) => savedMap.set(batchKey(a.BatchNumber), { BatchNumber: normBatch(a.BatchNumber), Quantity: num(a.Quantity) }));

      const existingQtyMap: Record<string, number> = {};
      for (const b of sapBatches) {
        const k = batchKey(b.BatchNumber);
        const found = savedMap.get(k);
        existingQtyMap[k] = found ? num(found.Quantity) : 0;
        if (found) savedMap.delete(k);
      }

      const unmatched: NewBatchRowT[] = Array.from(savedMap.values()).map((x) => ({
        id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
        BatchNumber: x.BatchNumber,
        Quantity: x.Quantity,
      }));

      setLineModalSapBatches(sapBatches);
      setLineModalExistingQty(existingQtyMap);
      setLineModalNewBatches(unmatched);
    } catch {
      setLineModalSapBatches([]);
      setLineModalExistingQty({});
      setLineModalNewBatches(
        input.batchAllocs.map((x) => ({
          id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
          BatchNumber: x.BatchNumber,
          Quantity: x.Quantity,
        }))
      );
    } finally {
      setLineModalBatchesLoading(false);
    }
  };

  const addNewBatchRow = () => {
    setLineModalNewBatches((prev) => [...prev, { id: `${Date.now()}_${Math.random().toString(16).slice(2)}`, BatchNumber: '', Quantity: 0 }]);
  };

  const removeNewBatchRow = (id: string) => {
    setLineModalNewBatches((prev) => prev.filter((x) => x.id !== id));
  };

  const modalBatchTotal = useMemo(() => {
    const existing = Object.values(lineModalExistingQty).reduce((s, q) => s + num(q), 0);
    const created = lineModalNewBatches.reduce((s, x) => s + num(x.Quantity), 0);
    return existing + created;
  }, [lineModalExistingQty, lineModalNewBatches]);

  const saveLineModal = () => {
    if (!lineModalRow) return;

    const open = num(lineModalRow.OpenQty ?? lineModalRow.Quantity);
    if (lineModalQty < 0) {
      toast.current?.show({ severity: 'warn', summary: 'Validation', detail: 'Quantity cannot be negative', life: 2500 });
      return;
    }
    if (lineModalQty > open) {
      toast.current?.show({ severity: 'warn', summary: 'Validation', detail: `Quantity cannot exceed OpenQty (${fmtNum(open, 2)})`, life: 3000 });
      return;
    }

    const key = lineKey(lineModalRow);

    if (!isBatchManagedLine(lineModalRow)) {
      setLineInputs((prev) => ({ ...prev, [key]: { qty: num(lineModalQty), batchAllocs: [] } }));
      setLineModalOpen(false);
      setLineModalRow(null);
      return;
    }

    for (const row of lineModalNewBatches) {
      const q = num(row.Quantity);
      if (q > 0 && !normBatch(row.BatchNumber)) {
        toast.current?.show({ severity: 'warn', summary: 'Validation', detail: 'New batch has quantity but empty batch number', life: 3000 });
        return;
      }
    }

    const fromExisting: EditableBatchAllocT[] = lineModalSapBatches
      .map((b) => ({ BatchNumber: normBatch(b.BatchNumber), Quantity: num(lineModalExistingQty[batchKey(b.BatchNumber)]) }))
      .filter((x) => !!x.BatchNumber && x.Quantity > 0);

    const fromNew: EditableBatchAllocT[] = lineModalNewBatches
      .map((x) => ({ BatchNumber: normBatch(x.BatchNumber), Quantity: num(x.Quantity) }))
      .filter((x) => !!x.BatchNumber && x.Quantity > 0);

    const merged = mergeBatchAllocs([...fromExisting, ...fromNew]);
    if (merged.length > 0) {
      const sum = sumBatchAllocs(merged);
      if (Math.abs(sum - num(lineModalQty)) > 1e-6) {
        toast.current?.show({
          severity: 'warn',
          summary: 'Validation',
          detail: `Batch allocations sum (${fmtNum(sum, 2)}) must equal Quantity (${fmtNum(lineModalQty, 2)})`,
          life: 3500,
        });
        return;
      }
    }

    setLineInputs((prev) => ({ ...prev, [key]: { qty: num(lineModalQty), batchAllocs: merged } }));
    setLineModalOpen(false);
    setLineModalRow(null);
  };

  const sendToSap = async () => {
    if (!selectedWhs) {
      toast.current?.show({ severity: 'warn', summary: 'Validation', detail: 'Select warehouse', life: 2500 });
      return;
    }
    if (!selectedBinAbsEntry) {
      toast.current?.show({ severity: 'warn', summary: 'Validation', detail: 'Select bin', life: 2500 });
      return;
    }

    try {
      const lines = selectedRows
        .map((r) => {
          const input = getLineInput(r);
          const qty = num(input.qty);

          if (qty <= 0) return null;

          const linePayload: Record<string, any> = {
            ItemCode: r.ItemCode,
            Quantity: qty,
            LineNum: r.LineNum ?? null,
          };

          if (isBatchManagedLine(r) && input.batchAllocs.length > 0) {
            const sum = sumBatchAllocs(input.batchAllocs);
            if (Math.abs(sum - qty) > 1e-6) {
              throw new Error(`BATCH_QTY_MISMATCH: ${String(r.ItemCode || '')}`);
            }

            linePayload.BatchAllocations = input.batchAllocs.map((a) => ({
              BatchNumber: normBatch(a.BatchNumber),
              Quantity: num(a.Quantity),
            }));
          }

          return linePayload;
        })
        .filter(Boolean);

      if (!lines.length) {
        toast.current?.show({ severity: 'warn', summary: 'Validation', detail: 'Collected quantity must be > 0', life: 3000 });
        return;
      }

      setSendingToSap(true);
      const res = await api.post('/postSalesReturnSendToSapApi', {
        DocEntry: Number(DocEntry),
        DocNum: Number(DocNum),
        WhsCode: selectedWhs,
        BinAbsEntry: Number(selectedBinAbsEntry),
        Lines: lines,
      });

      const data = res?.data ?? res;
      toast.current?.show({
        severity: 'success',
        summary: 'Sent',
        detail: `SAP DocEntry: ${data?.sapDocEntry ?? '-'}, DocNum: ${data?.sapDocNum ?? '-'}`,
        life: 3500,
      });

      setSendModalOpen(false);
      await load();
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: e?.response?.data?.message || e?.message || 'Failed to send to SAP',
        life: 3500,
      });
    } finally {
      setSendingToSap(false);
    }
  };

  const rowClassName = (r: SalesReturnLineT) => {
    const open = num(r.OpenQty ?? r.Quantity);
    const col = num(getLineInput(r).qty);
    const rem = Math.max(open - col, 0);
    if (open > 0 && rem <= 0) return 'bg-green-50';
    if (col > 0) return 'bg-yellow-50';
    return '';
  };

  const progressBody = (r: SalesReturnLineT) => {
    const open = Math.max(num(r.OpenQty ?? r.Quantity), 0);
    const collected = Math.max(num(getLineInput(r).qty), 0);
    const pct = open > 0 ? clamp((collected / open) * 100) : 0;

    return (
      <div className="flex flex-column gap-1" style={{ minWidth: 180 }}>
        <div className="flex align-items-center justify-content-between">
          <span className="text-600 text-sm">{fmtNum(collected, 2)} / {fmtNum(open, 2)}</span>
          <span className="text-600 text-sm">{Math.round(pct)}%</span>
        </div>
        <ProgressBar value={pct} showValue={false} style={{ height: 8 }} />
      </div>
    );
  };

  const batchAllocBody = (r: SalesReturnLineT) => {
    const allocs = getLineInput(r).batchAllocs;
    if (!allocs.length) return <span className="text-500">-</span>;

    return (
      <div className="flex flex-column gap-1">
        {allocs.slice(0, 2).map((a, i) => (
          <span key={`${a.BatchNumber}-${i}`} className="text-600 text-sm">
            {a.BatchNumber} • {fmtNum(a.Quantity, 2)}
          </span>
        ))}
        {allocs.length > 2 ? <span className="text-500 text-sm">+{allocs.length - 2} more</span> : null}
      </div>
    );
  };

  const openSendModal = () => {
    if (!selectedRows.length) {
      toast.current?.show({ severity: 'warn', summary: 'Validation', detail: 'Select at least one line', life: 2500 });
      return;
    }
    setSendModalOpen(true);
  };

  return (
    <>
      <Toast ref={toast} />

      <div className="flex flex-column gap-3">
        <div className="flex align-items-center justify-content-between gap-2 flex-wrap">
          <div className="flex align-items-center gap-2 flex-wrap">
            <Button label="Back" icon="pi pi-arrow-left" severity="secondary" onClick={() => router.back()} />
            <Button label={loading ? 'Loading...' : 'Refresh'} icon="pi pi-refresh" severity="secondary" disabled={loading} onClick={load} />
            <Button label="Send To SAP" icon="pi pi-send" severity="success" disabled={!rows.length || sendingToSap} onClick={openSendModal} />
          </div>

          <div className="flex align-items-center gap-2 flex-wrap">
            <Tag value={`OpenQty: ${fmtNum(totals.openQty, 2)}`} severity="info" />
            <Tag value={`Collected: ${fmtNum(totals.collected, 2)}`} severity="success" />
            <Tag value={`Remaining: ${fmtNum(totals.remaining, 2)}`} severity={totals.remaining <= 0 ? 'success' : 'warning'} />
          </div>
        </div>

        <Card
          className="shadow-2 border-round-xl"
          title={
            <div className="flex flex-column gap-1">
              <div className="flex align-items-center gap-2 flex-wrap">
                <span className="text-xl font-semibold">Sales Return Request #{headerInfo?.DocNum ?? DocNum ?? '-'}</span>
              </div>
              <div className="text-600">{headerInfo ? `${headerInfo.CardCode || ''} • ${headerInfo.CardName || ''}` : 'Loading...'}</div>
            </div>
          }
        >
          <div className="grid">
            <div className="col-12 md:col-3">
              <div className="text-600 text-sm">Date</div>
              <div className="font-semibold">{fmtDate(headerInfo?.DocDate)}</div>
            </div>
            <div className="col-12 md:col-3">
              <div className="text-600 text-sm">Due</div>
              <div className="font-semibold">{fmtDate(headerInfo?.DocDueDate)}</div>
            </div>
            <div className="col-12 md:col-3">
              <div className="text-600 text-sm">Manager</div>
              <div className="font-semibold">{headerInfo?.SlpName || '-'}</div>
            </div>
            <div className="col-12 md:col-3">
              <div className="text-600 text-sm">WorkArea / State</div>
              <div className="font-semibold">{headerInfo?.WorkAreaName || '-'}</div>
              <div className="text-500 text-sm">{headerInfo?.U_State || '-'}</div>
            </div>
          </div>

          <Divider className="my-3" />

          <div className="flex align-items-center justify-content-between flex-wrap gap-2">
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
                placeholder="Search item..."
                style={{ width: 360 }}
              />
            </span>
          </div>

          <div className="mt-2">
            <ProgressBar value={totals.pct} showValue={false} style={{ height: 10 }} />
            <div className="text-600 text-sm">Progress: {Math.round(totals.pct)}%</div>
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
              emptyMessage="No data"
              scrollable
              scrollHeight="560px"
              rowClassName={rowClassName}
              filters={filters}
              onFilter={(e) => setFilters(e.filters)}
              globalFilterFields={['ItemCode', 'ItemName', 'WhsCode']}
              selection={selectedRows}
              onSelectionChange={(e) => setSelectedRows((Array.isArray(e.value) ? e.value : []) as SalesReturnLineT[])}
              metaKeySelection={false}
            >
              <Column selectionMode="multiple" headerStyle={{ width: '3rem' }} />
              <Column header="#" style={{ width: 70 }} body={(r: SalesReturnLineT) => (r.LineNum != null ? r.LineNum : '-')} />
              <Column field="ItemCode" header="ItemCode" sortable style={{ minWidth: 140 }} />
              <Column field="ItemName" header="ItemName" sortable style={{ minWidth: 280 }} />
              <Column field="WhsCode" header="Whs" sortable style={{ minWidth: 100 }} />
              <Column header="OpenQty" sortable style={{ minWidth: 120, textAlign: 'right' }} body={(r: SalesReturnLineT) => fmtNum(r.OpenQty ?? r.Quantity, 2)} />
              <Column header="Collected" sortable style={{ minWidth: 120, textAlign: 'right' }} body={(r: SalesReturnLineT) => fmtNum(getLineInput(r).qty, 2)} />
              <Column
                header="Remaining"
                sortable
                style={{ minWidth: 120, textAlign: 'right' }}
                body={(r: SalesReturnLineT) => {
                  const rem = Math.max(num(r.OpenQty ?? r.Quantity) - num(getLineInput(r).qty), 0);
                  return <span className={rem <= 0 ? 'text-green-700 font-semibold' : 'font-semibold'}>{fmtNum(rem, 2)}</span>;
                }}
              />
              <Column header="Progress" style={{ minWidth: 220 }} body={progressBody} />
              <Column header="BatchAllocations" style={{ minWidth: 220 }} body={batchAllocBody} />
              <Column
                header="Input"
                style={{ minWidth: 140 }}
                body={(r: SalesReturnLineT) => (
                  <Button label="Enter" icon="pi pi-pencil" severity="secondary" size="small" onClick={() => openLineModal(r)} />
                )}
              />
            </DataTable>
          </div>
        </Card>
      </div>

      <Dialog
        header="Line Input"
        visible={lineModalOpen}
        onHide={() => {
          setLineModalOpen(false);
          setLineModalRow(null);
        }}
        style={{ width: '52rem', maxWidth: '95vw' }}
        modal
        draggable={false}
      >
        {lineModalRow ? (
          <div className="flex flex-column gap-3">
            <div>
              <div className="font-semibold">{lineModalRow.ItemCode || '-'}</div>
              <div className="text-600">{lineModalRow.ItemName || '-'}</div>
              <div className="text-500 text-sm">OpenQty: {fmtNum(lineModalRow.OpenQty ?? lineModalRow.Quantity, 2)}</div>
            </div>

            <div>
              <label className="block mb-2">Quantity</label>
              <InputNumber
                value={lineModalQty}
                onValueChange={(e) => setLineModalQty(num(e.value))}
                min={0}
                max={num(lineModalRow.OpenQty ?? lineModalRow.Quantity)}
                mode="decimal"
                minFractionDigits={0}
                maxFractionDigits={3}
                className="w-full"
                inputClassName="w-full"
              />
            </div>

            {isBatchManagedLine(lineModalRow) ? (
              <>
                <div className="flex align-items-center justify-content-between">
                  <div className="font-medium">Existing SAP batches</div>
                  <Tag value={`Allocated total: ${fmtNum(modalBatchTotal, 2)}`} severity={Math.abs(modalBatchTotal - num(lineModalQty)) < 1e-6 ? 'success' : 'warning'} />
                </div>

                <DataTable value={lineModalSapBatches} loading={lineModalBatchesLoading} dataKey="BatchNumber" size="small" showGridlines emptyMessage="No batches">
                  <Column field="BatchNumber" header="BatchNumber" style={{ minWidth: 170 }} />
                  <Column header="MnfDate" style={{ minWidth: 120 }} body={(r: ItemBatchT) => fmtDate(r.MnfDate)} />
                  <Column header="ExpDate" style={{ minWidth: 120 }} body={(r: ItemBatchT) => fmtDate(r.ExpDate)} />
                  <Column header="OnHand" style={{ minWidth: 100, textAlign: 'right' }} body={(r: ItemBatchT) => fmtNum(r.OnHandQty, 2)} />
                  <Column
                    header="Qty"
                    style={{ minWidth: 130 }}
                    body={(r: ItemBatchT) => {
                      const k = batchKey(r.BatchNumber);
                      return (
                        <InputNumber
                          value={lineModalExistingQty[k] ?? 0}
                          onValueChange={(e) => setLineModalExistingQty((p) => ({ ...p, [k]: num(e.value) }))}
                          min={0}
                          mode="decimal"
                          minFractionDigits={0}
                          maxFractionDigits={3}
                          inputStyle={{ width: 120, textAlign: 'right' }}
                        />
                      );
                    }}
                  />
                </DataTable>

                <div className="flex align-items-center justify-content-between mt-2">
                  <div className="font-medium">New batches</div>
                  <Button label="Add batch" icon="pi pi-plus" size="small" onClick={addNewBatchRow} />
                </div>

                <DataTable value={lineModalNewBatches} dataKey="id" size="small" showGridlines emptyMessage="No new batches">
                  <Column
                    header="BatchNumber"
                    style={{ minWidth: 220 }}
                    body={(r: NewBatchRowT) => (
                      <InputText
                        value={r.BatchNumber}
                        onChange={(e) => setLineModalNewBatches((p) => p.map((x) => (x.id === r.id ? { ...x, BatchNumber: e.target.value } : x)))}
                        className="w-full"
                      />
                    )}
                  />
                  <Column
                    header="Qty"
                    style={{ minWidth: 140 }}
                    body={(r: NewBatchRowT) => (
                      <InputNumber
                        value={r.Quantity}
                        onValueChange={(e) => setLineModalNewBatches((p) => p.map((x) => (x.id === r.id ? { ...x, Quantity: num(e.value) } : x)))}
                        min={0}
                        mode="decimal"
                        minFractionDigits={0}
                        maxFractionDigits={3}
                        inputStyle={{ width: 120, textAlign: 'right' }}
                      />
                    )}
                  />
                  <Column header="" style={{ width: 70 }} body={(r: NewBatchRowT) => <Button icon="pi pi-trash" severity="danger" text onClick={() => removeNewBatchRow(r.id)} />} />
                </DataTable>

                <small className="text-600">If BatchAllocations are filled, their sum must equal Quantity. If empty, backend will auto-create batch.</small>
              </>
            ) : (
              <small className="text-600">Item is non-batch. Only quantity is required.</small>
            )}

            <div className="flex justify-content-end gap-2">
              <Button label="Cancel" severity="secondary" onClick={() => setLineModalOpen(false)} />
              <Button label="Save" icon="pi pi-check" severity="success" onClick={saveLineModal} />
            </div>
          </div>
        ) : null}
      </Dialog>

      <Dialog header="Send Return To SAP" visible={sendModalOpen} onHide={() => setSendModalOpen(false)} style={{ width: '36rem', maxWidth: '95vw' }} modal draggable={false}>
        <div className="flex flex-column gap-3">
          <div>
            <label className="block mb-2">Warehouse</label>
            <Dropdown value={selectedWhs} options={whsOptions} onChange={(e) => setSelectedWhs((e.value as string) ?? null)} placeholder={whsLoading ? 'Loading...' : 'Select warehouse'} filter showClear className="w-full" disabled={whsLoading} />
          </div>

          <div>
            <label className="block mb-2">Bin</label>
            <Dropdown value={selectedBinAbsEntry} options={binOptions} onChange={(e) => setSelectedBinAbsEntry(Number(e.value) || null)} placeholder={selectedWhs ? (binsLoading ? 'Loading...' : 'Select bin') : 'Select warehouse first'} filter showClear className="w-full" disabled={!selectedWhs || binsLoading} />
          </div>

          <div className="flex justify-content-end gap-2">
            <Button label="Cancel" severity="secondary" onClick={() => setSendModalOpen(false)} />
            <Button label={sendingToSap ? 'Sending...' : 'Send'} icon="pi pi-send" severity="success" disabled={sendingToSap} onClick={sendToSap} />
          </div>
        </div>
      </Dialog>
    </>
  );
}
