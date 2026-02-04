// src/app/(main)/pages/wms/TransferRequestsDetail/page.tsx
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
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';

import api from '@/app/api/api';
import { useOrderPickRoom } from '@/app/socket/useOrderPickRoom';

import CollectAllocationsModal, { CollectLineT } from '../../components/CollectAllocationsModal';
import ItemsPickerModal, { PickedItemT } from '../../components/ItemsPickerModal';

const safeInt = (v: any, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

const API_LINES = '/getTransferDocsItemsApi';

type UserStampT = {
  empID?: number;
  userId?: string;
  username?: string;
  fullName?: string;
};

type PickDetailT = {
  by?: UserStampT | null;

  FromWhsCode?: string | null;
  FromWhsName?: string | null;

  BinAbsEntry: number;
  BinCode?: string | null;

  BatchNumber?: string | null;

  Qty: number;

  UpdatedAt?: string | Date | null;
};

type TransferDocLineT = {
  DocNum: number;
  DocEntry: number;
  DocStatus?: string | null;
  DocDate?: string | null;
  DocDueDate?: string | null;
  ToWhsCode?: string | null;
  ToWhsName?: string | null;
  Comments?: string | null;
  DocTime?: string | number | null;
  CreateDate?: string | null;
  BPLName?: string | null;
  U_State?: string | null;
  U_WorkArea?: number | null;
  U_WorkAreaName?: string | null;
  SlpName?: string | null;

  LineNum?: number | null;
  ItemCode: string;
  ItemName?: string | null;
  WhsCode: string;
  WhsName?: string | null;

  Quantity: number | string;
  OpenQty?: number | string;
  OnHand?: number | string;
  OnHandAll?: number | string;

  CollectedQuantity?: number | string;
  CollectedCount?: number | string;

  // ✅ NEW
  PickDetails?: PickDetailT[];

  // optional meta
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
const normStr = (v: any) => String(v ?? '').trim();

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

export default function TransferRequestsDetailPage() {
  // -------- modal state --------
  const [collectOpen, setCollectOpen] = useState(false);
  const [collectLine, setCollectLine] = useState<CollectLineT | null>(null);
  const [collectKey, setCollectKey] = useState<string | null>(null);
  const [itemsModalOpen, setItemsModalOpen] = useState(false);
  const toast = useRef<Toast>(null);
  const router = useRouter();
  const sp = useSearchParams();

  const DocEntry = sp.get('DocEntry') || '';
  const DocNum = sp.get('DocNum') || '';

  const docEntryNum = useMemo(() => {
    const n = Number(DocEntry);
    return Number.isFinite(n) ? n : NaN;
  }, [DocEntry]);
    const [selectedLineKeys, setSelectedLineKeys] = useState<string[]>([]);
  const [sendingToSap, setSendingToSap] = useState(false);

  const { socket, connected, room, error: socketError } = useOrderPickRoom(
    Number.isFinite(docEntryNum) ? docEntryNum : null
  );
  const [joinedRoom, setJoinedRoom] = useState<string>('');

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<TransferDocLineT[]>([]);

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



  
  const makeUiKey = useCallback((line: any) => lineKey(line), [lineKey]);

  const patchOrInsertRow = useCallback(
    (prev: TransferDocLineT[], rawLine: any) => {
      if (!rawLine) return prev;

      const k = makeUiKey(rawLine);
      const idx = prev.findIndex((x) => lineKey(x) === k);

      const header = prev?.[0] || null;

      const filled: TransferDocLineT = {
        DocEntry: safeInt(rawLine.DocEntry ?? header?.DocEntry ?? DocEntry, 0),
        DocNum: safeInt(rawLine.DocNum ?? header?.DocNum ?? DocNum, 0),
        DocStatus: rawLine.DocStatus ?? header?.DocStatus,
        DocDate: rawLine.DocDate ?? header?.DocDate,
        DocDueDate: rawLine.DocDueDate ?? header?.DocDueDate,
        ToWhsCode: rawLine.ToWhsCode ?? header?.ToWhsCode,
        ToWhsName: rawLine.ToWhsName ?? header?.ToWhsName,
        Comments: rawLine.Comments ?? header?.Comments,
        DocTime: rawLine.DocTime ?? header?.DocTime,
        CreateDate: rawLine.CreateDate ?? header?.CreateDate,
        BPLName: rawLine.BPLName ?? header?.BPLName,
        U_State: rawLine.U_State ?? header?.U_State,
        U_WorkArea: rawLine.U_WorkArea ?? header?.U_WorkArea,
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

        // ✅ NEW
        PickDetails: Array.isArray(rawLine.PickDetails) ? rawLine.PickDetails : [],

        LastCollectedAt: rawLine.LastCollectedAt ?? null,
        LastCollectedBy: rawLine.LastCollectedBy ?? null,
      };

      if (idx >= 0) {
        const cur = prev[idx];
        const next: TransferDocLineT = {
          ...cur,
          ...filled,
          uiKey: cur.uiKey || k,
          PickDetails: Array.isArray(filled.PickDetails) && filled.PickDetails.length
            ? filled.PickDetails
            : (Array.isArray(cur.PickDetails) ? cur.PickDetails : []),
        };
        const out = [...prev];
        out[idx] = next;
        return out;
      }

      return [...prev, { ...filled, uiKey: k }];
    },
    [DocEntry, DocNum, lineKey, makeUiKey]
  );

  const removeRowByPayload = useCallback(
    (prev: TransferDocLineT[], p: any) => {
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
      ToWhsCode: r.ToWhsCode,
      ToWhsName: r.ToWhsName,
      SlpName: r.SlpName,
      WorkAreaName: r.U_WorkAreaName,
      BPLName: r.BPLName,
      createdIso,
      Comments: r.Comments,
      U_State: r.U_State,
      U_WorkArea: r.U_WorkArea,
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

  const onGlobalFilterChange = (value: string) => {
    const _filters: DataTableFilterMeta = { ...filters };
    (_filters['global'] as any).value = value;
    setFilters(_filters);
    setGlobalFilterValue(value);
  };

  const load = useCallback(async () => {
    try {
      if (!DocEntry) {
        toast.current?.show({ severity: 'warn', summary: 'Внимание', detail: 'DocEntry не указан в URL', life: 3000 });
        return;
      }
      setLoading(true);

      const res = await api.get(API_LINES, {
        params: {
          DocEntry,
          DocNum,
          includePickDetails: 1, 
        },
      });

      const data = (res?.data ?? res) as TransferDocLineT[];
      console.log(data)

      const normalized = (Array.isArray(data) ? data : []).map((r) => {
        const key = makeUiKey(r);
        return { ...r, uiKey: key };
      });

      setRows(normalized);
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: e?.response?.data?.message || 'Не удалось загрузить запрос',
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

    const onLinesSynced = () => {
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

  const rowClassName = (r: TransferDocLineT) => {
    const open = num(r.OpenQty ?? r.Quantity);
    const col = num(r.CollectedQuantity);
    if (open > 0 && col >= open) return 'bg-green-50';
    if (col > 0) return 'bg-yellow-50';
    return '';
  };

  const selectedRows = useMemo(() => {
    const set = new Set(selectedLineKeys);
    return (rows || []).filter((r) => set.has(r.uiKey || lineKey(r)));
  }, [rows, selectedLineKeys, lineKey]);

  const selectedCount = selectedRows.length;

  const notReadySelected = useMemo(() => {
    return selectedRows.filter((r) => {
      const open = num(r.OpenQty ?? r.Quantity);
      const col = num(r.CollectedQuantity);
      const rem = Math.max(open - col, 0);
      return rem > 1e-9;
    });
  }, [selectedRows]);

  const buildLineRef = (r: TransferDocLineT) => ({
    LineNum: r.LineNum ?? null,
    ItemCode: r.ItemCode,
    WhsCode: r.WhsCode,
  });

  const doSendToSap = useCallback(async () => {
    if (!Number.isFinite(docEntryNum)) {
      toast.current?.show({ severity: 'warn', summary: 'Внимание', detail: 'DocEntry неверный', life: 3000 });
      return;
    }
    if (!selectedRows.length) {
      toast.current?.show({ severity: 'warn', summary: 'Внимание', detail: 'Выберите строки', life: 2500 });
      return;
    }

    if (notReadySelected.length) {
      const first = notReadySelected.slice(0, 3).map((x) => x.ItemCode).join(', ');
      toast.current?.show({
        severity: 'warn',
        summary: 'Нельзя отправить',
        detail: `Есть не собранные строки: ${first}${notReadySelected.length > 3 ? '...' : ''}`,
        life: 3500,
      });
      return;
    }

    try {
      setSendingToSap(true);

      const payload = {
        DocEntry: docEntryNum,
        DocNum: safeInt(DocNum, 0),
        lines: selectedRows.map(buildLineRef),
      };

      const res = await api.post('/sendPickedLinesToSapApi', payload);

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
  }, [docEntryNum, DocNum, selectedRows, notReadySelected, load]);

  const confirmSendToSap = useCallback(() => {
    if (!selectedRows.length) {
      toast.current?.show({ severity: 'warn', summary: 'Внимание', detail: 'Выберите строки', life: 2500 });
      return;
    }

    confirmDialog({
      header: 'Подтверждение',
      icon: 'pi pi-exclamation-triangle',
      message: `Отправить в SAP выбранные строки (${selectedRows.length})?`,
      acceptLabel: sendingToSap ? 'Отправка...' : 'Отправить',
      rejectLabel: 'Отмена',
      acceptClassName: 'p-button-success',
      rejectClassName: 'p-button-secondary',
      accept: () => doSendToSap(),
    });
  }, [selectedRows.length, doSendToSap, sendingToSap]);

  const addItems = async (items: PickedItemT[]) => {
    await api.post('/postTransferDocAddItemsApi', {
      DocEntry: docEntryNum,
      DocNum: safeInt(DocNum, 0),
      Items: items,
    });

    toast.current?.show({
      severity: 'success',
      summary: 'Готово',
      detail: `Добавлено: ${items.length}`,
      life: 2500,
    });

    await load();
  };

  const deleteLine = async (r: TransferDocLineT) => {
    try {
      await api.post('/deleteTransferDocLineApi', {
        DocEntry: docEntryNum,
        DocNum: safeInt(DocNum, 0),
        LineNum: r.LineNum ?? null,
        ItemCode: r.ItemCode,
        WhsCode: r.WhsCode,
      });

      setRows((prev) => prev.filter((x) => lineKey(x) !== lineKey(r)));
      toast.current?.show({ severity: 'success', summary: 'Удалено', detail: r.ItemCode, life: 2000 });
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: e?.response?.data?.message || 'Не удалось удалить строку',
        life: 3500,
      });
    }
  };

  const confirmDelete = (r: TransferDocLineT) => {
    confirmDialog({
      header: 'Удалить товар?',
      icon: 'pi pi-exclamation-triangle',
      message: `Удалить ${r.ItemCode} ${r.ItemName || ''}?`,
      acceptLabel: 'Удалить',
      rejectLabel: 'Отмена',
      acceptClassName: 'p-button-danger',
      accept: () => deleteLine(r),
    });
  };
  const progressBody = (r: TransferDocLineT) => {
    const open = Math.max(num(r.OpenQty ?? r.Quantity), 0);
    const collected = Math.max(num(r.CollectedQuantity), 0);
    const pct = open > 0 ? clamp((collected / open) * 100) : 0;

    return (
      <div className="flex flex-column gap-1" style={{ minWidth: 180 }}>
        <div className="flex align-items-center justify-content-between">
          <span className="text-600 text-sm">
            {fmtNum(collected, 2)} / {fmtNum(open, 2)}
          </span>
          <span className="text-600 text-sm">{Math.round(pct)}%</span>
        </div>
        <ProgressBar value={pct} showValue={false} style={{ height: 8 }} />
      </div>
    );
  };

  const openCollectModal = (r: TransferDocLineT) => {
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
      OnHand : r.OnHand,
      OnHandAll : r.OnHandAll,
      CollectedQuantity: r.CollectedQuantity,
      PickDetails: Array.isArray(r.PickDetails) ? r.PickDetails : [],
    });
    console.log('collectLine:', {
      LineNum: r.LineNum,
      ItemCode: r.ItemCode,
      ItemName: r.ItemName,
      WhsCode: r.WhsCode,
      WhsName: r.WhsName,
      Quantity: r.Quantity,
      OpenQty: r.OpenQty,
      OnHand : r.OnHand,
      OnHandAll : r.OnHandAll,
      CollectedQuantity: r.CollectedQuantity,
      PickDetails: Array.isArray(r.PickDetails) ? r.PickDetails : [],
    });

    setCollectOpen(true);
  };

  useEffect(() => {
    if (!collectOpen || !collectKey) return;

    const r = rows.find((x) => lineKey(x) === collectKey);
    if (!r) return;

    setCollectLine((prev : any) => {
      if (!prev) return prev;
      return {
        ...prev,
        CollectedQuantity: r.CollectedQuantity,
        PickDetails: Array.isArray(r.PickDetails) ? r.PickDetails : [],
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
      <ConfirmDialog />


      <div className="flex flex-column gap-3">
        <div className="flex align-items-center justify-content-between gap-2 flex-wrap">
          <div className="flex align-items-center gap-2 flex-wrap">
            <Button
              label={sendingToSap ? 'Отправка...' : `В SAP (${selectedCount})`}
              icon="pi pi-send"
              severity="success"
              disabled={loading || sendingToSap || selectedCount === 0}
              onClick={confirmSendToSap}
            />

            <Button label="Назад" icon="pi pi-arrow-left" severity="secondary" onClick={() => router.back()} />

            <Button
              label={loading ? 'Загрузка...' : 'Обновить'}
              icon="pi pi-refresh"
              severity="secondary"
              disabled={loading}
              onClick={load}
            />

            <Button label="Добавить товары" icon="pi pi-plus" onClick={() => setItemsModalOpen(true)} />

            {docStatusTag}
          </div>


          <div className="flex align-items-center gap-2 flex-wrap">
            {mounted ? (
              <>
                <Tag value={connected ? 'Socket: Online' : 'Socket: Offline'} severity={connected ? 'success' : 'danger'} />
                <Tag
                  value={(joinedRoom || room) ? String(joinedRoom || room) : 'Room: -'}
                  severity={(joinedRoom || room) ? 'info' : 'secondary'}
                />
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
                <span className="text-xl font-semibold">Перемещение № {headerInfo?.DocNum ?? DocNum ?? '-'}</span>
              </div>
              <div className="text-600">
                {headerInfo ? `${headerInfo.ToWhsCode || ''} • ${headerInfo.ToWhsName || ''}` : 'Загрузка данных...'}
              </div>
            </div>
          }
        >
          <div className="grid">
            <div className="col-12 md:col-3">
              <div className="text-600 text-sm">Р”Р°С‚Р°</div>
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
              <div className="text-500 text-sm">
                Запрос создан: {headerInfo?.createdIso ? fmtDateTime(headerInfo.createdIso) : '-'}
              </div>
            </div>
          </div>

          <Divider className="my-3" />

          <div className="flex flex-column gap-2">
            <div className="flex align-items-center justify-content-between flex-wrap gap-2">
              <div className="flex align-items-center gap-2 flex-wrap">
                <Tag value={`OpenQty: ${fmtNum(totals.openQty, 2)}`} severity="info" />
                <Tag value={`Собрано: ${fmtNum(totals.collected, 2)}`} severity="success" />
                <Tag
                  value={`Осталось: ${fmtNum(totals.remaining, 2)}`}
                  severity={totals.remaining <= 0 ? 'success' : 'warning'}
                />
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
              selection={selectedRows as any}
              onSelectionChange={(e) => {
                const arr = Array.isArray(e.value) ? (e.value as TransferDocLineT[]) : [];
                setSelectedLineKeys(arr.map((x) => x.uiKey || lineKey(x)));
              }}
              metaKeySelection={false}
            >
              <Column selectionMode="multiple" headerStyle={{ width: '3rem' }} />

              <Column header="#" style={{ width: 70 }} body={(r: TransferDocLineT) => (r.LineNum != null ? r.LineNum : '-')} />
              <Column field="ItemCode" header="Код" sortable style={{ minWidth: 140 }} />
              <Column field="ItemName" header="Товар" sortable style={{ minWidth: 320 }} />

              <Column
                header="Склад"
                style={{ minWidth: 220 }}
                body={(r: TransferDocLineT) => (
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
                body={(r: TransferDocLineT) => <span className="font-semibold">{fmtNum(r.OpenQty ?? r.Quantity, 2)}</span>}
              />

              <Column header="Прогресс" style={{ minWidth: 220 }} body={progressBody} />

              <Column
                header="Собрано"
                sortable
                style={{ minWidth: 120, textAlign: 'right' }}
                body={(r: TransferDocLineT) => <span className="font-semibold">{fmtNum(r.CollectedQuantity, 2)}</span>}
              />

              <Column
                header="Осталось"
                sortable
                style={{ minWidth: 120, textAlign: 'right' }}
                body={(r: TransferDocLineT) => {
                  const open = num(r.OpenQty ?? r.Quantity);
                  const collected = num(r.CollectedQuantity);
                  const remaining = Math.max(open - collected, 0);
                  return (
                    <span className={remaining <= 0 && open > 0 ? 'text-green-700 font-semibold' : 'font-semibold'}>
                      {fmtNum(remaining, 2)}
                    </span>
                  );
                }}
              />

              <Column
                header="Действие"
                style={{ minWidth: 160 }}
                body={(r: TransferDocLineT) => (
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
                body={(r: TransferDocLineT) => fmtNum(r.CollectedCount, 0)}
              />
              <Column
                header=""
                style={{ width: 70 }}
                body={(r: TransferDocLineT) => (
                  <Button icon="pi pi-trash" severity="danger" text onClick={() => confirmDelete(r)} />
                )}
              />
            </DataTable>
          </div>

          <Divider className="my-3" />

          <div className="flex flex-wrap justify-content-between align-items-center gap-2">
            <div className="flex align-items-center gap-2 flex-wrap">
              <Tag value={`Строк: ${totals.lines}`} />
              <Tag value={`OpenQty: ${fmtNum(totals.openQty, 2)}`} severity="info" />
              <Tag value={`Собрано: ${fmtNum(totals.collected, 2)}`} severity="success" />
              <Tag
                value={`Осталось: ${fmtNum(totals.remaining, 2)}`}
                severity={totals.remaining <= 0 ? 'success' : 'warning'}
              />
            </div>
          </div>
        </Card>
      </div>

      <ItemsPickerModal
        visible={itemsModalOpen}
        onHide={() => setItemsModalOpen(false)}
        endpoint="/getItemsForTransferDocApi"
        params={{ DocEntry, DocNum }}
        onSubmit={addItems}
      />

      <CollectAllocationsModal
        visible={collectOpen}
        onHide={closeCollectModal}
        toastRef={toast}
        socket={socket}
        connected={connected}
        DocEntry={Number(DocEntry)}
        DocNum={Number(DocNum)}
        WorkAreaDocEntry={headerInfo?.U_WorkArea ?? null}
        line={collectLine}
      />
    </>
  );
}



