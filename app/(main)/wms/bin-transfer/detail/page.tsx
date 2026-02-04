'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from 'primereact/card';
import { Toast } from 'primereact/toast';
import { Tag } from 'primereact/tag';
import { Button } from 'primereact/button';
import { Divider } from 'primereact/divider';
import { DataTable, DataTableFilterMeta } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputText } from 'primereact/inputtext';
import { ProgressBar } from 'primereact/progressbar';
import { FilterMatchMode } from 'primereact/api';
import api from '@/app/api/api';
import { useBinToBinRoom } from '@/app/socket/useBinToBinRoom';
import BinMoveModal from '../../../pages/components/BinMoveModal';

type BinTransferHeaderT = {
  _id?: string;
  DocNum?: number | null;
  DocEntry?: number | null;
  OpenedAt?: string | null;
  createdAt?: string | null;
  FromWhsCode?: string | null;
  FromWhsName?: string | null;
  ToWhsCode?: string | null;
  ToWhsName?: string | null;
  U_WorkArea?: number | null;
  U_WorkAreaName?: string | null;
  Status?: string | null;
};

type BinTransferLineT = {
  LineNum?: number | null;
  ItemCode: string;
  ItemName?: string | null;
  Quantity: number | string;
  FromWhsCode?: string | null;
  FromWhsName?: string | null;
  FromBinAbsEntry?: number | null;
  FromBinCode?: string | null;
  ToWhsCode?: string | null;
  ToWhsName?: string | null;
  ToBinAbsEntry?: number | null;
  ToBinCode?: string | null;
  MovedQuantity?: number | string;
  MoveDetails?: Array<{
    by?: { empID?: number; fullName?: string };
    FromBinAbsEntry?: number;
    FromBinCode?: string;
    ToBinAbsEntry?: number;
    ToBinCode?: string;
    BatchNumber?: string | null;
    Qty?: number | string;
    UpdatedAt?: string | null;
  }>;
  uiKey?: string;
};

type BinApiT = { BinAbsEntry: number; BinCode: string; WhsCode?: string; WhsName?: string; AbsEntry?: number };

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

export default function BinTransferDetailPage() {
  const toast = useRef<Toast>(null);
  const router = useRouter();
  const sp = useSearchParams();

  const DocEntry = sp.get('DocEntry') || '';
  const DocId = sp.get('id') || sp.get('_id') || '';

  const docEntryNum = useMemo(() => {
    const n = Number(DocEntry);
    return Number.isFinite(n) ? n : NaN;
  }, [DocEntry]);

  const docKey = useMemo(() => {
    if (DocId) return DocId;
    if (Number.isFinite(docEntryNum) && docEntryNum > 0) return docEntryNum;
    return null;
  }, [DocId, docEntryNum]);

  const { socket, connected, room, error: socketError } = useBinToBinRoom(docKey);

  const [loading, setLoading] = useState(false);
  const [header, setHeader] = useState<BinTransferHeaderT | null>(null);
  const [lines, setLines] = useState<BinTransferLineT[]>([]);
  const [bins, setBins] = useState<BinApiT[]>([]);

  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [activeLine, setActiveLine] = useState<BinTransferLineT | null>(null);

  const [selectedLineKeys, setSelectedLineKeys] = useState<string[]>([]);
  const [sendingToSap, setSendingToSap] = useState(false);

  const [lineFilterValue, setLineFilterValue] = useState('');
  const [lineFilters, setLineFilters] = useState<DataTableFilterMeta>({
    global: { value: null, matchMode: FilterMatchMode.CONTAINS },
  });

  const lineKey = useCallback((r: { LineNum?: any; ItemCode?: any; FromBinAbsEntry?: any; ToBinAbsEntry?: any }) => {
    const ln = r?.LineNum;
    if (ln != null && Number.isFinite(Number(ln))) return `L:${Number(ln)}`;
    const item = String(r?.ItemCode ?? '').trim();
    const fromBin = Number(r?.FromBinAbsEntry ?? 0);
    const toBin = Number(r?.ToBinAbsEntry ?? 0);
    return `K:${item}|||${fromBin}|||${toBin}`;
  }, []);

  const withKey = useCallback((r: BinTransferLineT) => ({ ...r, uiKey: r.uiKey || lineKey(r) }), [lineKey]);

  const load = async () => {
    try {
      if (!DocId && !Number.isFinite(docEntryNum)) {
        toast.current?.show({ severity: 'warn', summary: 'Внимание', detail: 'ID не указан', life: 2500 });
        return;
      }
      setLoading(true);

      const params: Record<string, any> = {};
      if (DocId) params.id = DocId;
      else if (Number.isFinite(docEntryNum)) params.DocEntry = docEntryNum;

      const res = await api.get('/getBinToBinApi', { params });
      const doc = (res?.data ?? res) as BinTransferHeaderT & { DocumentLines?: BinTransferLineT[] };

      setHeader(doc);
      const list = (doc?.DocumentLines ?? []) as BinTransferLineT[];
      setLines(list.map((l) => withKey(l)));
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: e?.response?.data?.message || 'Не удалось загрузить документ',
        life: 3500,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [DocId, docEntryNum]);

  useEffect(() => {
    if (!socket) return;

    const onLineUpdated = (p: any) => {
      const updated = p?.Line;
      if (!updated) return;

      const normalized = withKey(updated);
      setLines((prev) =>
        prev.map((l) => {
          if (Number.isFinite(Number(updated.LineNum)) && Number(l.LineNum) === Number(updated.LineNum)) return normalized;
          if (!Number.isFinite(Number(updated.LineNum)) && l.ItemCode === updated.ItemCode) return normalized;
          return l;
        })
      );

      if (p?.Status) {
        setHeader((prev) => (prev ? { ...prev, Status: p.Status } : prev));
      }
    };

    socket.on('binToBin:lineUpdated', onLineUpdated);
    return () => {
      socket.off('binToBin:lineUpdated', onLineUpdated);
    };
  }, [socket, withKey]);

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
    } catch {
      setBins([]);
    }
  };

  useEffect(() => {
    if (!header?.FromWhsCode) return;
    loadBins(String(header.FromWhsCode));
  }, [header?.FromWhsCode]);

  const totals = useMemo(() => {
    const totalQty = lines.reduce((s, r) => s + num(r.Quantity), 0);
    const moved = lines.reduce((s, r) => {
      const base = num(r.MovedQuantity);
      if (base > 0) return s + base;
      const details = Array.isArray(r.MoveDetails) ? r.MoveDetails : [];
      const sum = details.reduce((ss, d) => ss + num(d?.Qty), 0);
      return s + sum;
    }, 0);
    const pct = totalQty > 0 ? (moved / totalQty) * 100 : 0;
    return { totalQty, moved, pct: Math.max(0, Math.min(100, pct)) };
  }, [lines]);

  const onLineFilterChange = (value: string) => {
    const next = { ...lineFilters };
    (next['global'] as any).value = value;
    setLineFilters(next);
    setLineFilterValue(value);
  };

  const selectedRows = useMemo(() => {
    const set = new Set(selectedLineKeys);
    return (lines || []).filter((r) => set.has(r.uiKey || lineKey(r)));
  }, [lines, selectedLineKeys, lineKey]);

  const selectedCount = selectedRows.length;

  const buildLineRef = (r: BinTransferLineT) => ({
    LineNum: r.LineNum ?? null,
    ItemCode: r.ItemCode,
    FromBinAbsEntry: r.FromBinAbsEntry ?? null,
    ToBinAbsEntry: r.ToBinAbsEntry ?? null,
    Quantity: num(r.Quantity),
    MovedQuantity: num(r.MovedQuantity),
  });

  const sendToSap = useCallback(async () => {
    if (!selectedRows.length) {
      toast.current?.show({ severity: 'warn', summary: 'Внимание', detail: 'Выберите строки', life: 2500 });
      return;
    }

    try {
      setSendingToSap(true);

      const payload = {
        ...(DocId ? { id: DocId } : {}),
        ...(Number.isFinite(docEntryNum) ? { DocEntry: docEntryNum } : {}),
        lines: selectedRows.map(buildLineRef),
      };

      const res = await api.post('/sendBinToBinLinesToSapApi', payload);

      toast.current?.show({
        severity: 'success',
        summary: 'Готово',
        detail: res?.data?.message || `Отправлено в SAP: ${selectedRows.length} строк`,
        life: 3500,
      });

      setSelectedLineKeys([]);
      await load();
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: e?.response?.data?.message || 'Не удалось отправить в SAP',
        life: 4500,
      });
    } finally {
      setSendingToSap(false);
    }
  }, [selectedRows, DocId, docEntryNum, load]);

  const openMoveModal = (line: BinTransferLineT) => {
    setActiveLine(line);
    setMoveModalOpen(true);
  };

  const progressBody = (r: BinTransferLineT) => {
    const open = Math.max(num(r.Quantity), 0);
    const moved = Math.max(
      num(r.MovedQuantity) ||
        (Array.isArray(r.MoveDetails) ? r.MoveDetails.reduce((s, d) => s + num(d?.Qty), 0) : 0),
      0
    );
    const pct = open > 0 ? Math.min(100, (moved / open) * 100) : 0;

    return (
      <div className="flex flex-column gap-1" style={{ minWidth: 180 }}>
        <div className="flex align-items-center justify-content-between">
          <span className="text-600 text-sm">{fmtNum(moved, 2)} / {fmtNum(open, 2)}</span>
          <span className="text-600 text-sm">{Math.round(pct)}%</span>
        </div>
        <ProgressBar value={pct} showValue={false} style={{ height: 8 }} />
      </div>
    );
  };

  return (
    <>
      <Toast ref={toast} />
      <div className="flex flex-column gap-3">
        <div className="flex align-items-center justify-content-between gap-2 flex-wrap">
          <div className="flex align-items-center gap-2 flex-wrap">
            <Button label="Назад" icon="pi pi-arrow-left" severity="secondary" onClick={() => router.back()} />
            <Button label={loading ? 'Загрузка...' : 'Обновить'} icon="pi pi-refresh" severity="secondary" onClick={load} disabled={loading} />
            <Tag value={`Прогресс: ${Math.round(totals.pct)}%`} severity="info" />
          </div>

          <div className="flex align-items-center gap-2 flex-wrap">
            <Tag value={connected ? 'Socket: Online' : 'Socket: Offline'} severity={connected ? 'success' : 'danger'} />
            {room ? <Tag value={room} severity="info" /> : <Tag value="Room: -" severity="secondary" />}
            {socketError ? <Tag value={`Socket error: ${socketError}`} severity="warning" /> : null}
          </div>
        </div>

        <Card
          className="shadow-2 border-round-xl"
          title={
            <div className="flex flex-column gap-1">
              <div className="flex align-items-center gap-2 flex-wrap">
                <span className="text-xl font-semibold">Bin → Bin</span>
                {header?._id ? <Tag value={`ID: ${header._id}`} severity="secondary" /> : null}
              </div>
              <div className="text-600">
                {header ? `${header.FromWhsCode || ''} ${header.FromWhsName || ''}`.trim() : 'Загрузка данных...'}
              </div>
            </div>
          }
        >
          <div className="grid">
            <div className="col-12 md:col-3">
              <div className="text-600 text-sm">Дата</div>
              <div className="font-semibold">{fmtDate(header?.OpenedAt || header?.createdAt)}</div>
            </div>
            <div className="col-12 md:col-3">
              <div className="text-600 text-sm">WorkArea</div>
              <div className="font-semibold">{header?.U_WorkAreaName || '-'}</div>
            </div>
            <div className="col-12 md:col-3">
              <div className="text-600 text-sm">Открыто</div>
              <div className="font-semibold">{fmtDateTime(header?.OpenedAt || header?.createdAt)}</div>
            </div>
            <div className="col-12 md:col-3">
              <div className="text-600 text-sm">Статус</div>
              <div className="font-semibold">{header?.Status || '-'}</div>
            </div>
          </div>

          <Divider className="my-3" />

          <div className="flex flex-column gap-2 mb-3">
            <div className="flex flex-wrap align-items-center gap-2">
              <Tag value={`Строк: ${lines.length}`} />
              <Tag value={`План: ${fmtNum(totals.totalQty, 2)}`} severity="info" />
              <Tag value={`Сделано: ${fmtNum(totals.moved, 2)}`} severity="success" />
              <Tag
                value={`Осталось: ${fmtNum(Math.max(totals.totalQty - totals.moved, 0), 2)}`}
                severity={totals.totalQty - totals.moved <= 0 ? 'success' : 'warning'}
              />
            </div>
            <ProgressBar value={totals.pct} showValue={false} style={{ height: 10 }} />
            <div className="text-600 text-sm">Прогресс: {Math.round(totals.pct)}%</div>
          </div>

          <div className="flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
            <div className="text-900 font-medium">Товары документа</div>
            <div className="flex align-items-center gap-2">
              {selectedCount > 0 ? (
                <Button
                  label={sendingToSap ? 'Отправка...' : `В SAP (${selectedCount})`}
                  icon="pi pi-send"
                  severity="success"
                  disabled={sendingToSap || loading}
                  onClick={sendToSap}
                />
              ) : null}
              <span className="p-input-icon-left">
                <i className="pi pi-search" />
                <InputText
                  value={lineFilterValue}
                  onChange={(e) => onLineFilterChange(e.target.value)}
                  placeholder="Поиск: код / название..."
                  style={{ width: 320 }}
                />
              </span>
            </div>
          </div>

          <DataTable
            value={lines}
            dataKey="uiKey"
            emptyMessage="Нет данных"
            showGridlines
            size="small"
            stripedRows
            rowHover
            paginator
            rows={20}
            rowsPerPageOptions={[20, 50, 100]}
            filters={lineFilters}
            onFilter={(e) => setLineFilters(e.filters)}
            globalFilterFields={['ItemCode', 'ItemName']}
            selection={selectedRows as any}
            onSelectionChange={(e) => {
              const arr = Array.isArray(e.value) ? (e.value as BinTransferLineT[]) : [];
              setSelectedLineKeys(arr.map((x) => x.uiKey || lineKey(x)));
            }}
            metaKeySelection={false}
          >
            <Column selectionMode="multiple" headerStyle={{ width: '3rem' }} />
            <Column field="LineNum" header="#" style={{ width: 70 }} />
            <Column field="ItemCode" header="Код" style={{ minWidth: 140 }} />
            <Column field="ItemName" header="Товар" style={{ minWidth: 260 }} />
            <Column field="FromBinCode" header="Откуда" style={{ minWidth: 140 }} />
            <Column field="ToBinCode" header="Куда" style={{ minWidth: 140 }} />
            <Column header="План" style={{ minWidth: 120, textAlign: 'right' }} body={(r: BinTransferLineT) => fmtNum(r.Quantity, 2)} />
            <Column
              header="Сделано"
              style={{ minWidth: 120, textAlign: 'right' }}
              body={(r: BinTransferLineT) =>
                fmtNum(
                  num(r.MovedQuantity) ||
                    (Array.isArray(r.MoveDetails) ? r.MoveDetails.reduce((s, d) => s + num(d?.Qty), 0) : 0),
                  2
                )
              }
            />
            <Column
              header="Осталось"
              style={{ minWidth: 120, textAlign: 'right' }}
              body={(r: BinTransferLineT) => {
                const moved =
                  num(r.MovedQuantity) ||
                  (Array.isArray(r.MoveDetails) ? r.MoveDetails.reduce((s, d) => s + num(d?.Qty), 0) : 0);
                return fmtNum(Math.max(num(r.Quantity) - moved, 0), 2);
              }}
            />
            <Column header="Прогресс" body={progressBody} style={{ minWidth: 220 }} />
            <Column
              header=""
              style={{ width: 120 }}
              body={(r: BinTransferLineT) => (
                <Button label="Переместить" icon="pi pi-arrow-right" size="small" onClick={() => openMoveModal(r)} />
              )}
            />
          </DataTable>
        </Card>
      </div>

      <BinMoveModal
        visible={moveModalOpen}
        onHide={() => setMoveModalOpen(false)}
        toastRef={toast}
        socket={socket}
        connected={connected}
        DocEntry={Number.isFinite(docEntryNum) ? docEntryNum : undefined}
        DocId={header?._id || DocId || undefined}
        line={activeLine}
        bins={bins}
        header={header || undefined}
        workAreaDocEntry={header?.U_WorkArea ?? null}
      />
    </>
  );
}
