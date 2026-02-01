// src/app/(main)/pages/wms/SalesOrdersDetail/page.tsx
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
import { useOrderPickRoom } from '@/app/socket/useOrderPickRoom';

import CollectAllocationsModal, { CollectLineT } from '../../components/CollectAllocationsModal';
const safeInt = (v: any, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};


type UserStampT = {
  empID?: number;
  userId?: string;
  username?: string;
  fullName?: string;
};

type BinAllocT = {
  BinAbsEntry: number;
  BinCode?: string;
  BatchNumber?: string | null;
  ExpDate?: string | null;
  Quantity: number;
};

type CollectEventT = {
  at?: string;
  by?: UserStampT;
  BinAbsEntry?: number;
  BinCode?: string;
  BatchNumber?: string | null;
  ExpDate?: string | null;
  QtyDelta?: number;
  CountDelta?: number;
  note?: string;
};

type OrderDocLineT = {
  // header
  DocNum: number;
  DocEntry: number;
  DocStatus?: string | null;
  DocDate?: string | null;
  DocDueDate?: string | null;
  CardCode?: string | null;
  CardName?: string | null;
  Comments?: string | null;
  DocTime?: string | number | null;
  CreateDate?: string | null;
  BPLName?: string | null;
  U_State?: string | null;
  U_WorkAreaName?: string | null;
  SlpName?: string | null;

  // line
  LineNum?: number | null;
  ItemCode: string;
  ItemName?: string | null;
  WhsCode: string;
  WhsName?: string | null;

  Quantity: number | string;
  OpenQty?: number | string;

  CollectedQuantity?: number | string;
  CollectedCount?: number | string;

  BinAllocations?: BinAllocT[];
  CollectedEvents?: CollectEventT[];
  LastCollectedAt?: string | null;
  LastCollectedBy?: UserStampT | null;

  uiKey?: string;
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
const clamp = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v));

function buildDocCreatedAt(createDate?: any, docTime?: any) {
  const cd = createDate ? String(createDate).trim() : '';
  if (!cd) return '';
  let t = '';
  if (docTime != null) {
    const raw = String(docTime).trim();
    if (/^\d{3,4}$/.test(raw)) {
      const padded = raw.padStart(4, '0');
      t = `${padded.slice(0, 2)}:${padded.slice(2, 4)}:00`;
    } else if (/^\d{2}:\d{2}/.test(raw)) {
      t = raw.length === 5 ? `${raw}:00` : raw;
    }
  }
  return t ? `${cd}T${t}` : cd;
}

const normStr = (v: any) => String(v ?? '').trim();

export default function SalesOrdersDetailPage() {
  // -------- modal state --------
  const [collectOpen, setCollectOpen] = useState(false);
  const [collectLine, setCollectLine] = useState<CollectLineT | null>(null);
  const [collectKey, setCollectKey] = useState<string | null>(null);

  const toast = useRef<Toast>(null);
  const router = useRouter();
  const sp = useSearchParams();

  const DocEntry = sp.get('DocEntry') || '';
  const DocNum = sp.get('DocNum') || '';

  const docEntryNum = useMemo(() => {
    const n = Number(DocEntry);
    return Number.isFinite(n) ? n : NaN;
  }, [DocEntry]);

  const { socket, connected, room, error: socketError } = useOrderPickRoom(Number.isFinite(docEntryNum) ? docEntryNum : null);
  const [joinedRoom, setJoinedRoom] = useState<string>(''); // ✅ join ack’dan room

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<OrderDocLineT[]>([]);

  const [globalFilterValue, setGlobalFilterValue] = useState('');
  const [filters, setFilters] = useState<DataTableFilterMeta>({
    global: { value: null, matchMode: FilterMatchMode.CONTAINS },
  });

  // -------- key helpers --------
  const lineKey = useCallback((r: { LineNum?: any; ItemCode?: any; WhsCode?: any }) => {
    const ln = r?.LineNum;
    if (ln != null && Number.isFinite(Number(ln))) return `L:${Number(ln)}`;
    return `K:${normStr(r?.ItemCode)}|||${normStr(r?.WhsCode)}`;
  }, []);

  const makeUiKey = useCallback((line: any) => {
    return lineKey(line);
  }, [lineKey]);

  const patchOrInsertRow = useCallback(
    (prev: OrderDocLineT[], rawLine: any) => {
      if (!rawLine) return prev;

      const k = makeUiKey(rawLine);
      const idx = prev.findIndex((x) => lineKey(x) === k);

      const header = prev?.[0] || null;

      // ✅ addLine’dan keladigan Line’da header fields yo‘q bo‘lishi mumkin
      const filled = {
        DocEntry: safeInt(rawLine.DocEntry ?? header?.DocEntry ?? DocEntry, 0),
        DocNum: safeInt(rawLine.DocNum ?? header?.DocNum ?? DocNum, 0),
        DocStatus: rawLine.DocStatus ?? header?.DocStatus,
        DocDate: rawLine.DocDate ?? header?.DocDate,
        DocDueDate: rawLine.DocDueDate ?? header?.DocDueDate,
        CardCode: rawLine.CardCode ?? header?.CardCode,
        CardName: rawLine.CardName ?? header?.CardName,
        Comments: rawLine.Comments ?? header?.Comments,
        DocTime: rawLine.DocTime ?? header?.DocTime,
        CreateDate: rawLine.CreateDate ?? header?.CreateDate,
        BPLName: rawLine.BPLName ?? header?.BPLName,
        U_State: rawLine.U_State ?? header?.U_State,
        U_WorkAreaName: rawLine.U_WorkAreaName ?? header?.U_WorkAreaName,
        SlpName: rawLine.SlpName ?? header?.SlpName,

        LineNum: rawLine.LineNum ?? null,
        ItemCode: rawLine.ItemCode ?? '',
        ItemName: rawLine.ItemName ?? null,
        WhsCode: rawLine.WhsCode ?? '',
        WhsName: rawLine.WhsName ?? null,

        Quantity: rawLine.Quantity ?? 0,
        OpenQty: rawLine.OpenQty ?? rawLine.Quantity ?? 0,

        CollectedQuantity: rawLine.CollectedQuantity ?? 0,
        CollectedCount: rawLine.CollectedCount ?? 0,

        BinAllocations: rawLine.BinAllocations ?? [],
        CollectedEvents: rawLine.CollectedEvents ?? [],
        LastCollectedAt: rawLine.LastCollectedAt ?? null,
        LastCollectedBy: rawLine.LastCollectedBy ?? null,
      } as OrderDocLineT;

      if (idx >= 0) {
        const cur = prev[idx];
        const next = { ...cur, ...filled, uiKey: cur.uiKey || k };
        const out = [...prev];
        out[idx] = next;
        return out;
      }

      // ✅ new row
      return [...prev, { ...filled, uiKey: k }];
    },
    [DocEntry, DocNum, lineKey, makeUiKey]
  );

  const removeRowByPayload = useCallback(
    (prev: OrderDocLineT[], p: any) => {
      const line = p?.Line || p?.line || null;
      const ln = line?.LineNum ?? p?.LineNum;
      const item = normStr(line?.ItemCode ?? p?.ItemCode);
      const whs = normStr(line?.WhsCode ?? p?.WhsCode);

      const k =
        ln != null && Number.isFinite(Number(ln))
          ? `L:${Number(ln)}`
          : `K:${item}|||${whs}`;

      return prev.filter((r) => lineKey(r) !== k);
    },
    [lineKey]
  );

  // -------- header/totals --------
  const headerInfo = useMemo(() => {
    const r = rows?.[0];
    if (!r) return null;
    const createdIso = buildDocCreatedAt(r.CreateDate, r.DocTime);
    return {
      DocNum: r.DocNum ?? Number(DocNum),
      DocEntry: r.DocEntry ?? Number(DocEntry),
      DocDate: r.DocDate,
      DocDueDate: r.DocDueDate,
      CardCode: r.CardCode,
      CardName: r.CardName,
      SlpName: r.SlpName,
      WorkAreaName: r.U_WorkAreaName,
      BPLName: r.BPLName,
      createdIso,
      Comments: r.Comments,
      U_State: r.U_State,
      DocStatus: r.DocStatus,
    };
  }, [rows, DocNum, DocEntry]);

  const totals = useMemo(() => {
    const arr = rows || [];
    const openQty = arr.reduce((s, r) => s + num(r.OpenQty ?? r.Quantity), 0);
    const collected = arr.reduce((s, r) => s + num(r.CollectedQuantity), 0);
    const remaining = Math.max(openQty - collected, 0);
    const pct = openQty > 0 ? (collected / openQty) * 100 : 0;
    return { lines: arr.length, openQty, collected, remaining, pct: clamp(pct) };
  }, [rows]);

  const docStatusTag = useMemo(() => {
    if (!rows.length) return <Tag value="Пусто" severity="secondary" />;
    if (totals.remaining <= 0 && totals.openQty > 0) return <Tag value="Собрано" severity="success" />;
    if (totals.collected > 0) return <Tag value="В процессе" severity="warning" />;
    return <Tag value="Не начато" severity="danger" />;
  }, [rows.length, totals.remaining, totals.openQty, totals.collected]);

  // -------- filters --------
  const onGlobalFilterChange = (value: string) => {
    const _filters: DataTableFilterMeta = { ...filters };
    (_filters['global'] as any).value = value;
    setFilters(_filters);
    setGlobalFilterValue(value);
  };

  // -------- load from API --------
  const load = useCallback(async () => {
    try {
      if (!DocEntry) {
        toast.current?.show({ severity: 'warn', summary: 'Внимание', detail: 'DocEntry не указан в URL', life: 3000 });
        return;
      }
      setLoading(true);

      const res = await api.get('/getOrdersDocsItemsApi', { params: { DocEntry, DocNum, includeEvents: 1 } });
      const data = (res?.data ?? res) as OrderDocLineT[];

      const normalized = (Array.isArray(data) ? data : []).map((r) => {
        const key = makeUiKey(r);
        return { ...r, uiKey: key };
      });

      setRows(normalized);
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: e?.response?.data?.message || 'Не удалось загрузить заказ',
        life: 3500,
      });
    } finally {
      setLoading(false);
    }
  }, [DocEntry, DocNum, makeUiKey]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!socket || !connected) return;
    if (!Number.isFinite(docEntryNum)) return;

    socket.emit('orderPick:joinDoc', { DocEntry: docEntryNum }, (ack: any) => {
      if (ack?.ok && ack?.room) setJoinedRoom(String(ack.room));
    });

    return () => {
      socket.emit('orderPick:leaveDoc', { DocEntry: docEntryNum });
    };
  }, [socket, connected, docEntryNum]);

  useEffect(() => {
    if (!socket) return;

    const onLineUpdated = (p: any) => {
      const line = p?.Line || p?.line || null;
      if (!line) return;
      setRows((prev) => patchOrInsertRow(prev, line));
    };

    const onLineAdded = (p: any) => {
      const line = p?.Line || p?.line || null;
      if (!line) return;
      setRows((prev) => patchOrInsertRow(prev, line));
    };

    const onLineRemoved = (p: any) => {
      setRows((prev) => removeRowByPayload(prev, p));
    };

    const onLinesSynced = (p: any) => {
      load();
    };

    socket.on('orderPick:lineUpdated', onLineUpdated);
    socket.on('orderPick:lineAdded', onLineAdded);
    socket.on('orderPick:lineRemoved', onLineRemoved);
    socket.on('orderPick:linesSynced', onLinesSynced);

    return () => {
      socket.off('orderPick:lineUpdated', onLineUpdated);
      socket.off('orderPick:lineAdded', onLineAdded);
      socket.off('orderPick:lineRemoved', onLineRemoved);
      socket.off('orderPick:linesSynced', onLinesSynced);
    };
  }, [socket, patchOrInsertRow, removeRowByPayload, load]);

  // -------- table renders --------
  const rowClassName = (r: OrderDocLineT) => {
    const open = num(r.OpenQty ?? r.Quantity);
    const col = num(r.CollectedQuantity);
    if (open > 0 && col >= open) return 'bg-green-50';
    if (col > 0) return 'bg-yellow-50';
    return '';
  };

  const progressBody = (r: OrderDocLineT) => {
    const open = Math.max(num(r.OpenQty ?? r.Quantity), 0);
    const collected = Math.max(num(r.CollectedQuantity), 0);
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

  const renderCollectedByUsers = (r: OrderDocLineT) => {
    const ev = Array.isArray(r.CollectedEvents) ? r.CollectedEvents : [];
    const m = new Map<string, { name: string; qty: number }>();

    for (const e of ev) {
      const q = num(e?.QtyDelta);
      if (!q) continue;
      const name = normStr(e?.by?.fullName || e?.by?.username) || '—';
      const key = String(e?.by?.empID || name);
      const cur = m.get(key) || { name, qty: 0 };
      cur.qty += q;
      m.set(key, cur);
    }

    const arr = Array.from(m.values()).filter((x) => x.qty !== 0).sort((a, b) => b.qty - a.qty);
    if (!arr.length) return <span className="text-500">-</span>;

    return (
      <div className="flex flex-wrap gap-1">
        {arr.slice(0, 6).map((x, idx) => (
          <Tag key={idx} value={`${x.name}: ${fmtNum(x.qty, 2)}`} severity="info" />
        ))}
        {arr.length > 6 ? <Tag value={`+${arr.length - 6}`} severity="secondary" /> : null}
      </div>
    );
  };

  const renderBins = (r: OrderDocLineT) => {
    const bins = Array.isArray(r.BinAllocations) ? r.BinAllocations : [];
    if (!bins.length) return <span className="text-500">-</span>;
    const sorted = [...bins].sort((a, b) => num(b.Quantity) - num(a.Quantity));

    return (
      <div className="flex flex-column gap-1">
        {sorted.slice(0, 4).map((b, idx) => (
          <div key={idx} className="flex justify-content-between gap-2">
            <span className="font-medium">{b.BinCode || b.BinAbsEntry}</span>
            <span className="text-600">{fmtNum(b.Quantity, 2)}</span>
          </div>
        ))}
        {sorted.length > 4 ? <span className="text-500 text-sm">+ ещё {sorted.length - 4}</span> : null}
      </div>
    );
  };

  const renderBatches = (r: OrderDocLineT) => {
    const bins = Array.isArray(r.BinAllocations) ? r.BinAllocations : [];
    const m = new Map<string, number>();
    for (const b of bins) {
      const bn = normStr(b.BatchNumber);
      if (!bn) continue;
      m.set(bn, (m.get(bn) || 0) + num(b.Quantity));
    }
    const arr = Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    if (!arr.length) return <span className="text-500">-</span>;

    return (
      <div className="flex flex-wrap gap-1">
        {arr.slice(0, 5).map(([bn, q]) => (
          <Tag key={bn} value={`${bn}: ${fmtNum(q, 2)}`} severity="success" />
        ))}
        {arr.length > 5 ? <Tag value={`+${arr.length - 5}`} severity="secondary" /> : null}
      </div>
    );
  };

  // -------- modal open/close + live sync --------
  const openCollectModal = (r: OrderDocLineT) => {
    const k = lineKey(r);
    setCollectKey(k);

    setCollectLine({
      LineNum: r.LineNum,
      ItemCode: r.ItemCode,
      ItemName: r.ItemName,
      WhsCode: r.WhsCode,
      WhsName: r.WhsName,
      Quantity: r.Quantity,
      OpenQty: r.OpenQty,
      CollectedQuantity: r.CollectedQuantity,
      BinAllocations: r.BinAllocations || [],
      CollectedEvents: r.CollectedEvents || [],
    });

    setCollectOpen(true);
  };

  useEffect(() => {
    if (!collectOpen || !collectKey) return;

    const r = rows.find((x) => lineKey(x) === collectKey);
    if (!r) return;

    setCollectLine((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        CollectedQuantity: r.CollectedQuantity,
        BinAllocations: r.BinAllocations || [],
        CollectedEvents: r.CollectedEvents || [],
      };
    });
  }, [rows, collectOpen, collectKey, lineKey]);

  const closeCollectModal = () => {
    setCollectOpen(false);
    setCollectLine(null);
    setCollectKey(null);
  };

  return (
    <>
      <Toast ref={toast} />

      <div className="flex flex-column gap-3">
        <div className="flex align-items-center justify-content-between gap-2 flex-wrap">
          <div className="flex align-items-center gap-2 flex-wrap">
            <Button label="Назад" icon="pi pi-arrow-left" severity="secondary" onClick={() => router.back()} />
            <Button
              label={loading ? 'Загрузка...' : 'Обновить'}
              icon="pi pi-refresh"
              severity="secondary"
              disabled={loading}
              onClick={load}
            />
            {docStatusTag}
          </div>

          <div className="flex align-items-center gap-2 flex-wrap">
            {mounted ? (
              <>
                <Tag value={connected ? 'Socket: Online' : 'Socket: Offline'} severity={connected ? 'success' : 'danger'} />
                <Tag value={(joinedRoom || room) ? String(joinedRoom || room) : 'Room: -'} severity={(joinedRoom || room) ? 'info' : 'secondary'} />
                {socketError ? <Tag value={`Socket error: ${socketError}`} severity="warning" /> : null}
              </>
            ) : (
              <>
                <Tag value="Socket: ..." severity="secondary" />
                <Tag value="Room: -" severity="secondary" />
              </>
            )}
          </div>
        </div>

        <Card
          className="shadow-2 border-round-xl"
          title={
            <div className="flex flex-column gap-1">
              <div className="flex align-items-center gap-2 flex-wrap">
                <span className="text-xl font-semibold">Заказ № {headerInfo?.DocNum ?? DocNum ?? '-'}</span>
              </div>
              <div className="text-600">{headerInfo ? `${headerInfo.CardCode || ''} • ${headerInfo.CardName || ''}` : 'Загрузка данных...'}</div>
            </div>
          }
        >
          <div className="grid">
            <div className="col-12 md:col-3">
              <div className="text-600 text-sm">Дата</div>
              <div className="font-semibold">{fmtDate(headerInfo?.DocDate)}</div>
            </div>
            <div className="col-12 md:col-3">
              <div className="text-600 text-sm">Срок</div>
              <div className="font-semibold">{fmtDate(headerInfo?.DocDueDate)}</div>
            </div>
            <div className="col-12 md:col-3">
              <div className="text-600 text-sm">Менеджер</div>
              <div className="font-semibold">{headerInfo?.SlpName || '-'}</div>
              <div className="text-500 text-sm">{headerInfo?.BPLName || ''}</div>
            </div>
            <div className="col-12 md:col-3">
              <div className="text-600 text-sm">Зона</div>
              <div className="font-semibold">{headerInfo?.WorkAreaName || '-'}</div>
              <div className="text-500 text-sm">Заказ получен: {headerInfo?.createdIso ? fmtDateTime(headerInfo.createdIso) : '-'}</div>
            </div>
          </div>

          <Divider className="my-3" />

          <div className="flex flex-column gap-2">
            <div className="flex align-items-center justify-content-between flex-wrap gap-2">
              <div className="flex align-items-center gap-2 flex-wrap">
                <Tag value={`OpenQty: ${fmtNum(totals.openQty, 2)}`} severity="info" />
                <Tag value={`Собрано: ${fmtNum(totals.collected, 2)}`} severity="success" />
                <Tag value={`Осталось: ${fmtNum(totals.remaining, 2)}`} severity={totals.remaining <= 0 ? 'success' : 'warning'} />
              </div>

              <span className="p-input-icon-left">
                <i className="pi pi-search" />
                <InputText
                  value={globalFilterValue}
                  onChange={(e) => onGlobalFilterChange(e.target.value)}
                  placeholder="Поиск: код / название товара..."
                  style={{ width: 360 }}
                />
              </span>
            </div>

            <ProgressBar value={totals.pct} showValue={false} style={{ height: 10 }} />
            <div className="text-600 text-sm">Прогресс: {Math.round(totals.pct)}%</div>
          </div>

          <div className="mt-3">
            <DataTable
              value={rows}
              loading={loading}
              dataKey="uiKey"
              paginator
              rows={20}
              rowsPerPageOptions={[20, 50, 100]}
              stripedRows
              rowHover
              showGridlines
              size="small"
              emptyMessage="Нет данных"
              scrollable
              scrollHeight="560px"
              rowClassName={rowClassName}
              filters={filters}
              onFilter={(e) => setFilters(e.filters)}
              globalFilterFields={['ItemCode', 'ItemName', 'WhsCode', 'WhsName']}
            >
              <Column header="#" style={{ width: 70 }} body={(r: OrderDocLineT) => (r.LineNum != null ? r.LineNum : '-')} />
              <Column field="ItemCode" header="Код" sortable style={{ minWidth: 140 }} />
              <Column field="ItemName" header="Товар" sortable style={{ minWidth: 320 }} />

              <Column
                header="Склад"
                style={{ minWidth: 220 }}
                body={(r: OrderDocLineT) => (
                  <div className="flex flex-column">
                    <span className="font-medium">{r.WhsName || r.WhsCode}</span>
                    <span className="text-500 text-sm">{r.WhsCode}</span>
                  </div>
                )}
              />

              <Column
                header="OpenQty"
                sortable
                style={{ minWidth: 120, textAlign: 'right' }}
                body={(r: OrderDocLineT) => <span className="font-semibold">{fmtNum(r.OpenQty ?? r.Quantity, 2)}</span>}
              />

              <Column header="Прогресс" style={{ minWidth: 220 }} body={progressBody} />

              <Column
                header="Собрано"
                sortable
                style={{ minWidth: 120, textAlign: 'right' }}
                body={(r: OrderDocLineT) => <span className="font-semibold">{fmtNum(r.CollectedQuantity, 2)}</span>}
              />

              <Column
                header="Осталось"
                sortable
                style={{ minWidth: 120, textAlign: 'right' }}
                body={(r: OrderDocLineT) => {
                  const open = num(r.OpenQty ?? r.Quantity);
                  const collected = num(r.CollectedQuantity);
                  const remaining = Math.max(open - collected, 0);
                  return <span className={remaining <= 0 && open > 0 ? 'text-green-700 font-semibold' : 'font-semibold'}>{fmtNum(remaining, 2)}</span>;
                }}
              />
              <Column
                header="Действие"
                style={{ minWidth: 160 }}
                body={(r: OrderDocLineT) => (
                  <Button
                    label="Собрать"
                    icon="pi pi-plus"
                    severity="success"
                    size="small"
                    disabled={!connected}
                    onClick={() => openCollectModal(r)}
                  />
                )}
              />

              <Column
                field="CollectedCount"
                header="Сборов"
                sortable
                style={{ minWidth: 110, textAlign: 'right' }}
                body={(r: OrderDocLineT) => fmtNum(r.CollectedCount, 0)}
              />
            </DataTable>
          </div>

          <Divider className="my-3" />

          <div className="flex flex-wrap justify-content-between align-items-center gap-2">
            <div className="flex align-items-center gap-2 flex-wrap">
              <Tag value={`Строк: ${totals.lines}`} />
              <Tag value={`OpenQty: ${fmtNum(totals.openQty, 2)}`} severity="info" />
              <Tag value={`Собрано: ${fmtNum(totals.collected, 2)}`} severity="success" />
              <Tag value={`Осталось: ${fmtNum(totals.remaining, 2)}`} severity={totals.remaining <= 0 ? 'success' : 'warning'} />
            </div>
          </div>
        </Card>
      </div>

      <CollectAllocationsModal
        visible={collectOpen}
        onHide={closeCollectModal}
        toastRef={toast}
        socket={socket}
        connected={connected}
        DocEntry={Number(DocEntry)}
        DocNum={Number(DocNum)}
        line={collectLine}
      />
    </>
  );
}
