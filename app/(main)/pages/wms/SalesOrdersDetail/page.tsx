// src/app/(main)/pages/wms/SalesOrdersDetail/page.tsx
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
import { ProgressBar } from 'primereact/progressbar';
import { FilterMatchMode } from 'primereact/api';
import { InputNumber } from 'primereact/inputnumber';

import api from '@/app/api/api';
import { useOrderPickRoom } from '@/app/socket/useOrderPickRoom';

type OrderDocLineT = {
  // header fields (takror kelishi mumkin — 1chi rowdan olamiz)
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

  // line fields (API qaytarishi SHART bo'lganlar)
  LineNum?: number | null;
  ItemCode: string;
  ItemName?: string | null;
  WhsCode: string;
  WhsName?: string | null;

  Quantity: number | string;
  OpenQty?: number | string;

  CollectedQuantity?: number | string;
  CollectedCount?: number | string;

  // UI
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
  // CreateDate: '2026-01-21' ; DocTime: '1345' yoki 1345
  const cd = createDate ? String(createDate).trim() : '';
  if (!cd) return '';

  let t = '';
  if (docTime != null) {
    const raw = String(docTime).trim();
    // SAP DocTime ko'pincha 1345 (HHmm)
    if (/^\d{3,4}$/.test(raw)) {
      const padded = raw.padStart(4, '0');
      t = `${padded.slice(0, 2)}:${padded.slice(2, 4)}:00`;
    } else if (/^\d{2}:\d{2}/.test(raw)) {
      t = raw.length === 5 ? `${raw}:00` : raw;
    }
  }
  const iso = t ? `${cd}T${t}` : cd;
  return iso;
}

export default function SalesOrdersDetailPage() {
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

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<OrderDocLineT[]>([]);

  const [globalFilterValue, setGlobalFilterValue] = useState('');
  const [filters, setFilters] = useState<DataTableFilterMeta>({
    global: { value: null, matchMode: FilterMatchMode.CONTAINS },
  });

  // uiKey: ideal -> LineNum, fallback -> ItemCode|||WhsCode
  const lineKey = (r: OrderDocLineT) => {
    const ln = r.LineNum;
    if (ln != null && Number.isFinite(Number(ln))) return `L:${Number(ln)}`;
    return `K:${String(r.ItemCode || '').trim()}|||${String(r.WhsCode || '').trim()}`;
  };

  const [editCollected, setEditCollected] = useState<Record<string, number>>({});
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [savingAll, setSavingAll] = useState(false);

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

    const dirtyCount = Object.values(dirty).filter(Boolean).length;

    return {
      lines: arr.length,
      openQty,
      collected,
      remaining,
      pct: clamp(pct),
      dirtyCount,
    };
  }, [rows, dirty]);

  const onGlobalFilterChange = (value: string) => {
    const _filters: DataTableFilterMeta = { ...filters };
    (_filters['global'] as any).value = value;
    setFilters(_filters);
    setGlobalFilterValue(value);
  };

  const load = async () => {
    try {
      if (!DocEntry) {
        toast.current?.show({ severity: 'warn', summary: 'Внимание', detail: 'DocEntry не указан в URL', life: 3000 });
        return;
      }

      setLoading(true);

      // ✅ Siz backendda shu API ni qilasiz (SAP + Mongo merge):
      // - lines: ItemCode, ItemName, LineNum, WhsCode, WhsName, Quantity/OpenQty
      // - mongo: CollectedQuantity/CollectedCount ...
      const res = await api.get('/getOrdersDocsItemsApi', { params: { DocEntry, DocNum } });


      const data = (res?.data ?? res) as OrderDocLineT[];
      const normalized = (Array.isArray(data) ? data : []).map((r) => {
        const key = `L:${r.LineNum != null ? Number(r.LineNum) : ''}`.trim();
        return { ...r, uiKey: key };
      });

      setRows(normalized);

      setEditCollected((prev) => {
        const next = { ...prev };
        for (const r of normalized) {
          const k = lineKey(r);
          if (next[k] === undefined) next[k] = num(r.CollectedQuantity);
        }
        return next;
      });

      // reload bo'lganda dirty ni reset qilamiz (xohlasangiz saqlab qolasiz)
      setDirty({});
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
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [DocEntry]);

  // realtime: serverdan lineUpdated kelsa UI update
  useEffect(() => {
    if (!socket) return;

    const onLineUpdated = (p: any) => {
      const ln = p?.Line?.LineNum ?? p?.LineNum ?? p?.Line?.lineNum;
      const item = String(p?.Line?.ItemCode || p?.ItemCode || '').trim();
      const whs = String(p?.Line?.WhsCode || p?.WhsCode || '').trim();

      const k =
        ln != null && Number.isFinite(Number(ln))
          ? `L:${Number(ln)}`
          : `K:${item}|||${whs}`;

      const newQty = num(p?.Line?.CollectedQuantity ?? p?.CollectedQuantity);
      const newCount = num(p?.Line?.CollectedCount ?? p?.CollectedCount);

      setRows((prev) =>
        prev.map((r) => {
          if (lineKey(r) !== k) return r;
          const open = num(r.OpenQty ?? r.Quantity);
          return {
            ...r,
            CollectedQuantity: newQty,
            CollectedCount: newCount || num(r.CollectedCount),
            // remaining UI uchun hisoblab qo'yamiz (server qaytarmasa ham)
            OpenQty: r.OpenQty ?? r.Quantity,
          };
        })
      );

      setEditCollected((prev) => ({ ...prev, [k]: newQty }));
      setDirty((prev) => ({ ...prev, [k]: false }));
    };

    const onLineAdded = (p: any) => {
      const line = p?.Line;
      if (!line) return;
      setRows((prev) => [...prev, line]);
    };

    const onLineRemoved = (p: any) => {
      const ln = p?.LineNum;
      const item = String(p?.ItemCode || '').trim();
      const whs = String(p?.WhsCode || '').trim();
      const k = ln != null ? `L:${Number(ln)}` : `K:${item}|||${whs}`;
      setRows((prev) => prev.filter((r) => lineKey(r) !== k));
      setEditCollected((prev) => {
        const n = { ...prev };
        delete n[k];
        return n;
      });
      setDirty((prev) => {
        const n = { ...prev };
        delete n[k];
        return n;
      });
    };

    socket.on('orderPick:lineUpdated', onLineUpdated);
    socket.on('orderPick:lineAdded', onLineAdded);
    socket.on('orderPick:lineRemoved', onLineRemoved);

    return () => {
      socket.off('orderPick:lineUpdated', onLineUpdated);
      socket.off('orderPick:lineAdded', onLineAdded);
      socket.off('orderPick:lineRemoved', onLineRemoved);
    };
  }, [socket]);

  const docStatusTag = useMemo(() => {
    if (!rows.length) return <Tag value="Пусто" severity="secondary" />;
    if (totals.remaining <= 0 && totals.openQty > 0) return <Tag value="Собрано" severity="success" />;
    if (totals.collected > 0) return <Tag value="В процессе" severity="warning" />;
    return <Tag value="Не начато" severity="danger" />;
  }, [rows.length, totals.remaining, totals.openQty, totals.collected]);

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
          <span className="text-600 text-sm">
            {fmtNum(collected, 2)} / {fmtNum(open, 2)}
          </span>
          <span className="text-600 text-sm">{Math.round(pct)}%</span>
        </div>
        <ProgressBar value={pct} showValue={false} style={{ height: 8 }} />
      </div>
    );
  };

  const saveAll = async () => {
    if (!socket || !socket.connected) {
      toast.current?.show({ severity: 'warn', summary: 'Socket', detail: 'Нет соединения', life: 2500 });
      return;
    }

    const dirtyKeys = Object.keys(dirty).filter((k) => dirty[k]);
    if (!dirtyKeys.length) {
      toast.current?.show({ severity: 'info', summary: 'Сохранение', detail: 'Нет изменений', life: 1500 });
      return;
    }

    setSavingAll(true);

    let okCount = 0;
    let failCount = 0;

    // line -> payload topish
    const rowByKey = new Map<string, OrderDocLineT>();
    for (const r of rows) rowByKey.set(lineKey(r), r);

    for (const k of dirtyKeys) {
      const r = rowByKey.get(k);
      if (!r) continue;

      const open = num(r.OpenQty ?? r.Quantity);
      const newQty = Math.max(0, Math.min(num(editCollected[k]), open));

      // eslint-disable-next-line no-await-in-loop
      await new Promise<void>((resolve) => {
        socket.emit(
          'orderPick:setCollected',
          {
            DocEntry: Number(DocEntry),
            DocNum: Number(DocNum),
            LineNum: r.LineNum,
            ItemCode: r.ItemCode,
            WhsCode: r.WhsCode,
            CollectedQuantity: newQty,
          },
          (ack: any) => {
            if (!ack?.ok) {
              failCount += 1;
            } else {
              okCount += 1;
            }
            resolve();
          }
        );
      });
    }

    setSavingAll(false);

    if (failCount > 0) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Сохранено частично',
        detail: `OK: ${okCount}, Ошибка: ${failCount}`,
        life: 3500,
      });
    } else {
      toast.current?.show({ severity: 'success', summary: 'Сохранено', detail: `Строк: ${okCount}`, life: 2500 });
    }
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
                {room ? <Tag value={room} severity="info" /> : <Tag value="Room: -" severity="secondary" />}
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
                Заказ получен: {headerInfo?.createdIso ? fmtDateTime(headerInfo.createdIso) : '-'}
              </div>
            </div>
          </div>

          <Divider className="my-3" />

          <div className="flex flex-column gap-2">
            <div className="flex align-items-center justify-content-between flex-wrap gap-2">
              <div className="flex align-items-center gap-2 flex-wrap">
                <Tag value={`OpenQty: ${fmtNum(totals.openQty, 2)}`} severity="info" />
                <Tag value={`Собрано: ${fmtNum(totals.collected, 2)}`} severity="success" />
                <Tag value={`Осталось: ${fmtNum(totals.remaining, 2)}`} severity={totals.remaining <= 0 ? 'success' : 'warning'} />
                <Tag value={`Изменений: ${totals.dirtyCount}`} severity={totals.dirtyCount ? 'warning' : 'secondary'} />
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
              <Column
                header="#"
                style={{ width: 80 }}
                body={(r: OrderDocLineT) => (r.LineNum != null ? r.LineNum : '-')}
              />
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

              {/* ✅ “Собрано” — edit input */}
              <Column
                header="Собрано (ввод)"
                style={{ minWidth: 220 }}
                body={(r: OrderDocLineT) => {
                  const k = lineKey(r);
                  const open = num(r.OpenQty ?? r.Quantity);
                  const value = editCollected[k] ?? num(r.CollectedQuantity);
                  const isDirty = !!dirty[k] && value !== num(r.CollectedQuantity);

                  return (
                    <div className="flex align-items-center gap-2">
                      <InputNumber
                        value={value}
                        min={0}
                        max={open}
                        inputStyle={{ width: 120, textAlign: 'right' }}
                        onValueChange={(e) => {
                          const v = num(e.value);
                          setEditCollected((p) => ({ ...p, [k]: v }));
                          setDirty((p) => ({ ...p, [k]: true }));
                        }}
                      />
                      {isDirty ? <Tag value="*" severity="warning" /> : <Tag value=" " severity="secondary" />}
                    </div>
                  );
                }}
              />

              <Column
                header="Осталось"
                sortable
                style={{ minWidth: 130, textAlign: 'right' }}
                body={(r: OrderDocLineT) => {
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
                field="CollectedCount"
                header="Сборов"
                sortable
                style={{ minWidth: 110, textAlign: 'right' }}
                body={(r: OrderDocLineT) => fmtNum(r.CollectedCount, 0)}
              />
            </DataTable>
          </div>

          <Divider className="my-3" />

          {/* ✅ Pastki umumiy save panel */}
          <div className="flex flex-wrap justify-content-between align-items-center gap-2">
            <div className="flex align-items-center gap-2 flex-wrap">
              <Tag value={`Строк: ${totals.lines}`} />
              <Tag value={`OpenQty: ${fmtNum(totals.openQty, 2)}`} severity="info" />
              <Tag value={`Собрано: ${fmtNum(totals.collected, 2)}`} severity="success" />
              <Tag value={`Осталось: ${fmtNum(totals.remaining, 2)}`} severity={totals.remaining <= 0 ? 'success' : 'warning'} />
            </div>

            <div className="flex align-items-center gap-2 flex-wrap">
              <Button
                label={savingAll ? 'Сохранение...' : `Сохранить изменения (${totals.dirtyCount})`}
                icon="pi pi-save"
                severity="success"
                disabled={!totals.dirtyCount || savingAll || !connected}
                onClick={saveAll}
              />
              <Button
                label="Сбросить ввод"
                icon="pi pi-undo"
                severity="secondary"
                disabled={!totals.dirtyCount || savingAll}
                onClick={() => {
                  // revert inputs to current rows.CollectedQuantity
                  const next: Record<string, number> = {};
                  for (const r of rows) next[lineKey(r)] = num(r.CollectedQuantity);
                  setEditCollected(next);
                  setDirty({});
                }}
              />
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
