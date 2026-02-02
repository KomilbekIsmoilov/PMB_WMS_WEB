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

import api from '@/app/api/api';
import { usePurchaseDocRoom } from '@/app/socket/usePurchaseDocRoom';
import { InputNumber } from 'primereact/inputnumber';

type PurchaseDocRowT = {
  DocNum: number;
  DocEntry: number;
  DocDate: string;
  DocDueDate: string;
  CardCode: string;
  CardName: string;
  SlpCode?: number | null;
  SlpName?: string | null;
  U_WorkArea?: number | string | null;
  U_WorkAreaName?: string | null; 
  ItemCode: string;
  ItemName: string;
  Quantity: number | string;  
  OpenQty: number | string;  
  WhsCode: string;
  Karobka?: number | string | null;
  Volume?: number | string | null;
  Weight?: number | string | null;
  CollectedQuantity?: number | string;
  RemainingQuantity?: number | string;
  CollectedCount?: number | string;
  lineNum?: number;
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

const clamp = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v));

export default function PurchaseDocDetailPage() {
  const toast = useRef<Toast>(null);
  const router = useRouter();
  const sp = useSearchParams();

  const DocEntry = sp.get('DocEntry') || '';
  const DocNum = sp.get('DocNum') || '';

  const docEntryNum = useMemo(() => {
    const n = Number(DocEntry);
    return Number.isFinite(n) ? n : NaN;
  }, [DocEntry]);

  const { socket, connected, room, error: socketError } = usePurchaseDocRoom(Number.isFinite(docEntryNum) ? docEntryNum : null);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PurchaseDocRowT[]>([]);

  const [globalFilterValue, setGlobalFilterValue] = useState('');
  const [filters, setFilters] = useState<DataTableFilterMeta>({
    global: { value: null, matchMode: FilterMatchMode.CONTAINS },
  });
  const lineKey = (r: PurchaseDocRowT) =>
  `${String(r.ItemCode || '').trim()}|||${String(r.WhsCode || '').trim()}`;

const [editCollected, setEditCollected] = useState<Record<string, number>>({});
const [dirty, setDirty] = useState<Record<string, boolean>>({});
const [saving, setSaving] = useState<Record<string, boolean>>({});

// yuqorida state qo'shing
const [mounted, setMounted] = useState(false);

useEffect(() => {
  setMounted(true);
}, []);


  const headerInfo = useMemo(() => {
    const r = rows?.[0];
    if (!r) return null;

    return {
      DocNum: r.DocNum,
      DocEntry: r.DocEntry,
      DocDate: r.DocDate,
      DocDueDate: r.DocDueDate,
      CardCode: r.CardCode,
      CardName: r.CardName,
      SlpName: r.SlpName,
      WorkAreaName: r.U_WorkAreaName,
      WorkArea: r.U_WorkArea,
    };
  }, [rows]);

  const totals = useMemo(() => {
    const arr = rows || [];
    const openQty = arr.reduce((s, r) => s + num(r.OpenQty), 0);
    const collected = arr.reduce((s, r) => s + num(r.CollectedQuantity), 0);
    const remaining = arr.reduce((s, r) => s + num(r.RemainingQuantity), 0);

    const karobka = arr.reduce((s, r) => s + num(r.Karobka), 0);
    const volume = arr.reduce((s, r) => s + num(r.Volume), 0);
    const weight = arr.reduce((s, r) => s + num(r.Weight), 0);

    const pct = openQty > 0 ? (collected / openQty) * 100 : 0;

    return {
      lines: arr.length,
      openQty,
      collected,
      remaining,
      karobka,
      volume,
      weight,
      pct: clamp(pct),
    };
  }, [rows]);

  const onGlobalFilterChange = (value: string) => {
    const _filters: DataTableFilterMeta = { ...filters };
    (_filters['global'] as any).value = value;
    setFilters(_filters);
    setGlobalFilterValue(value);
  };

  const load = async () => {
    try {
      if (!DocEntry) {
        toast.current?.show({
          severity: 'warn',
          summary: 'Внимание',
          detail: 'DocEntry не указан в URL',
          life: 3000,
        });
        return;
      }

      setLoading(true);

      const res = await api.get('/PurchaseDocDetailPageApi', {
        params: { DocEntry, DocNum },
      });

      const data = (res?.data ?? res) as PurchaseDocRowT[];
      const normalized = (Array.isArray(data) ? data : []).map((r, idx) => ({
        ...r,
        lineNum: idx + 1,
      }));

      setRows(normalized);
      setEditCollected(() => {
        const next: Record<string, number> = {};
        for (const r of normalized) {
          const k = lineKey(r);
          next[k] = num(r.CollectedQuantity);
        }
        return next;
      });
      setDirty(() => {
        const next: Record<string, boolean> = {};
        for (const r of normalized) {
          const k = lineKey(r);
          next[k] = false;
        }
        return next;
      });
      setSaving({});
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

  const saveCollected = (r: PurchaseDocRowT) => {
  if (!socket || !socket.connected) {
    toast.current?.show({ severity: 'warn', summary: 'Socket', detail: 'Нет соединения', life: 2500 });
    return;
  }

  const k = lineKey(r);
  const newQty = num(editCollected[k]);
  const open = num(r.OpenQty ?? r.Quantity);

  if (newQty < 0) {
    toast.current?.show({ severity: 'warn', summary: 'Ошибка', detail: 'Кол-во не может быть < 0', life: 2500 });
    return;
  }
  if (newQty > open) {
    toast.current?.show({ severity: 'warn', summary: 'Ошибка', detail: 'Собрано не может быть больше OpenQty', life: 2500 });
    return;
  }

  setSaving((p) => ({ ...p, [k]: true }));

  socket.emit(
    'purchaseDoc:setCollected',
    {
      DocEntry: Number(DocEntry),
      DocNum: Number(DocNum),
      ItemCode: r.ItemCode,
      WhsCode: r.WhsCode,
      CollectedQuantity: newQty,
    },
    (ack: any) => {
      if (!ack?.ok) {
        setSaving((p) => ({ ...p, [k]: false }));
        toast.current?.show({ severity: 'error', summary: 'Ошибка', detail: ack?.message || 'Не удалось сохранить', life: 3000 });
        return;
      }

      // UI yangilanish serverdan "purchaseDoc:lineUpdated" bilan keladi
      toast.current?.show({ severity: 'success', summary: 'Сохранено', detail: r.ItemCode, life: 1200 });
    }
  );
};


  useEffect(() => {
  if (!socket) return;

  const onLineUpdated = (p: any) => {
    const item = String(p?.ItemCode || '').trim();
    const whs = String(p?.WhsCode || '').trim();
    const k = `${item}|||${whs}`;
    const newQty = num(p?.CollectedQuantity);
    const newCount = num(p?.CollectedCount);

    // rows update
    setRows((prev) =>
      prev.map((r) => {
        if (lineKey(r) !== k) return r;
        const open = num(r.OpenQty ?? r.Quantity);
        return {
          ...r,
          CollectedQuantity: newQty,
          RemainingQuantity: Math.max(open - newQty, 0),
          CollectedCount: newCount || num(r.CollectedCount),
        };
      })
    );

    // input state sync
    setEditCollected((prev) => ({ ...prev, [k]: newQty }));
    setDirty((prev) => ({ ...prev, [k]: false }));
    setSaving((prev) => ({ ...prev, [k]: false }));
  };

  socket.on('purchaseDoc:lineUpdated', onLineUpdated);
  return () => {
    socket.off('purchaseDoc:lineUpdated', onLineUpdated);
  };
}, [socket]);


  useEffect(() => {
    load();
  }, [DocEntry]);

  const docStatusTag = useMemo(() => {
    if (!rows.length) return <Tag value="Пусто" severity="secondary" />;
    if (totals.remaining <= 0 && totals.openQty > 0) return <Tag value="Собрано" severity="success" />;
    if (totals.collected > 0) return <Tag value="В процессе" severity="warning" />;
    return <Tag value="Не начато" severity="danger" />;
  }, [rows.length, totals.remaining, totals.openQty, totals.collected]);

  const rowClassName = (r: PurchaseDocRowT) => {
    const open = num(r.OpenQty);
    const rem = num(r.RemainingQuantity);
    const col = num(r.CollectedQuantity);

    if (open > 0 && rem <= 0) return 'bg-green-50';
    if (col > 0) return 'bg-yellow-50';
    return '';
  };

  const progressBody = (r: PurchaseDocRowT) => {
    const open = Math.max(num(r.OpenQty), 0);
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

  const dirtyCount = useMemo(() => Object.values(dirty).filter(Boolean).length, [dirty]);

  
const saveAllDirty = () => {
  if (!socket || !socket.connected) {
    toast.current?.show({ severity: 'warn', summary: 'Socket', detail: 'Нет соединения', life: 2500 });
    return;
  }

  const dirtyLines = getDirtyLines();

  if (!dirtyLines.length) {
    toast.current?.show({ severity: 'info', summary: 'Сохранение', detail: 'Нет изменений', life: 2000 });
    return;
  }

  // UI: hammasini saving qilib qo'yamiz
  setSaving((prev) => {
    const next = { ...prev };
    for (const r of rows) {
      const k = lineKey(r);
      if (dirty[k]) next[k] = true;
    }
    return next;
  });

  socket.emit(
    'purchaseDoc:setCollectedBatch',
    {
      DocEntry: Number(DocEntry),
      DocNum: Number(DocNum),
      Lines: dirtyLines, 
    },
    (ack: any) => {
      if (!ack?.ok) {
        setSaving((prev) => {
          const next = { ...prev };
          for (const r of rows) {
            const k = lineKey(r);
            if (dirty[k]) next[k] = false;
          }
          return next;
        });

        toast.current?.show({ severity: 'error', summary: 'Ошибка', detail: ack?.message || 'Не удалось сохранить', life: 3500 });
        return;
      }

      toast.current?.show({ severity: 'success', summary: 'Сохранено', detail: `Строк: ${dirtyLines.length}`, life: 1500 });

      setTimeout(() => {
        setSaving((prev) => {
          const next = { ...prev };
          for (const r of rows) {
            const k = lineKey(r);
            if (dirty[k]) next[k] = false;
          }
          return next;
        });
      }, 500);
    }
  );
};
  const footer = (
    <div className="flex flex-wrap justify-content-between align-items-center gap-2">
      <div className="flex align-items-center gap-2 flex-wrap">
        <Tag value={`Строк: ${totals.lines}`} />
        <Tag value={`OpenQty: ${fmtNum(totals.openQty, 2)}`} severity="info" />
        <Tag value={`Собрано: ${fmtNum(totals.collected, 2)}`} severity="success" />
        <Tag value={`Осталось: ${fmtNum(totals.remaining, 2)}`} severity={totals.remaining <= 0 ? 'success' : 'warning'} />
      </div>

      <div className="flex align-items-center gap-2 flex-wrap">
        <Button
            label={dirtyCount ? `Сохранить (${dirtyCount})` : 'Сохранить'}
            icon="pi pi-save"
            severity="success"
            disabled={!dirtyCount || !connected}
            onClick={saveAllDirty}
        />
        <Button
          label="Отправить в SAP"
          icon="pi pi-send"
          severity="success"
          disabled={!rows.length || totals.remaining > 0}
          onClick={() => {
            toast.current?.show({
              severity: 'info',
              summary: 'SAP',
              detail: 'Пока без API. Дальше подключим отправку.',
              life: 2500,
            });
          }}
        />
        <Button
          label="Barcode"
          icon="pi pi-barcode"
          severity="secondary"
          disabled={!rows.length}
          onClick={() => {
            toast.current?.show({
              severity: 'info',
              summary: 'Barcode',
              detail: 'Пока без API. Дальше подключим печать.',
              life: 2500,
            });
          }}
        />
        <Button
          label="Накладная"
          icon="pi pi-file"
          severity="help"
          disabled={!rows.length}
          onClick={() => {
            toast.current?.show({
              severity: 'info',
              summary: 'Накладная',
              detail: 'Пока без API. Дальше подключим печать/просмотр.',
              life: 2500,
            });
          }}
        />
      </div>
    </div>
  );

  const getDirtyLines = () => {
    const list: Array<{ ItemCode: string; WhsCode: string; CollectedQuantity: number }> = [];

    for (const r of rows) {
      const k = lineKey(r);

      const newQty = num(editCollected[k]);
      const open = num(r.OpenQty ?? r.Quantity);
      const current = num(r.CollectedQuantity);

      if (newQty === current) continue;
      if (!dirty[k] && newQty === current) continue;

      // validatsiya (xohlasangiz qattiqroq qilamiz)
      if (newQty < 0 || newQty > open) continue;

      list.push({
        ItemCode: r.ItemCode,
        WhsCode: r.WhsCode,
        CollectedQuantity: newQty,
      });
    }

    return list;
  };



  return (
    <>
      <Toast ref={toast} />

      <div className="flex flex-column gap-3">
        <div className="flex align-items-center justify-content-between gap-2 flex-wrap">
          <div className="flex align-items-center gap-2 flex-wrap">
            <Button label="Назад" icon="pi pi-arrow-left" severity="secondary" onClick={() => router.back()} />
            <Button label={loading ? 'Загрузка...' : 'Обновить'} icon="pi pi-refresh" severity="secondary" disabled={loading} onClick={load} />
            {docStatusTag}
          </div>

          <div className="flex align-items-center gap-2 flex-wrap">
            {mounted ? (
                <>
                <Tag
                    value={connected ? 'Socket: Online' : 'Socket: Offline'}
                    severity={connected ? 'success' : 'danger'}
                />
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
                <span className="text-xl font-semibold">
                  Закупка № {headerInfo?.DocNum ?? DocNum ?? '-'}
                </span>
              </div>

              <div className="text-600">
                {headerInfo ? `${headerInfo.CardCode} • ${headerInfo.CardName}` : 'Загрузка данных...'}
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
            </div>

            <div className="col-12 md:col-3">
              <div className="text-600 text-sm">Зона</div>
              <div className="font-semibold">{headerInfo?.WorkAreaName || '-'}</div>
              {headerInfo?.WorkArea ? <div className="text-500 text-sm">U_WorkArea: {String(headerInfo.WorkArea)}</div> : null}
            </div>
          </div>

          <Divider className="my-3" />

          <div className="flex flex-column gap-2">
            <div className="flex align-items-center justify-content-between flex-wrap gap-2">
              <div className="flex align-items-center gap-2 flex-wrap">
                <Tag value={`OpenQty: ${fmtNum(totals.openQty, 2)}`} severity="info" />
                <Tag value={`Собрано: ${fmtNum(totals.collected, 2)}`} severity="success" />
                <Tag value={`Осталось: ${fmtNum(totals.remaining, 2)}`} severity={totals.remaining <= 0 ? 'success' : 'warning'} />
                <Tag value={`Коробка: ${fmtNum(totals.karobka, 2)}`} severity="secondary" />
                <Tag value={`Объём: ${fmtNum(totals.volume, 3)}`} severity="secondary" />
                <Tag value={`Вес: ${fmtNum(totals.weight, 3)}`} severity="secondary" />
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
              dataKey="lineNum"
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
              globalFilterFields={['ItemCode', 'ItemName']}
            >
              <Column field="lineNum" header="#" style={{ width: 70 }} />
              <Column field="ItemCode" header="Код" sortable style={{ minWidth: 140 }} />
              <Column field="ItemName" header="Товар" sortable style={{ minWidth: 320 }} />

              <Column
                field="OpenQty"
                header="OpenQty"
                sortable
                style={{ minWidth: 120, textAlign: 'right' }}
                body={(r: PurchaseDocRowT) => <span className="font-semibold">{fmtNum(r.OpenQty, 2)}</span>}
              />
            <Column
            header="Собрано"
            style={{ minWidth: 150, textAlign: 'right' }}
            body={(r: PurchaseDocRowT) => {
                const k = lineKey(r);
                const open = num(r.OpenQty ?? r.Quantity);
                const value = editCollected[k] ?? num(r.CollectedQuantity);

                const isSaving = !!saving[k];     
                const isDirty = value !== num(r.CollectedQuantity);

                return (
                <div className="flex align-items-center justify-content-end gap-2">
                    <InputNumber
                    value={value}
                    min={0}
                    max={open}
                    inputStyle={{ width: 120, textAlign: 'right' }}
                    onValueChange={(e) => {
                        const v = num(e.value);
                        setEditCollected((p) => ({ ...p, [k]: v }));
                        setDirty((p) => ({ ...p, [k]: v !== num(r.CollectedQuantity) }));
                    }}
                    disabled={isSaving}
                    />
                    <Button
                      icon="pi pi-save"
                      severity="success"
                      text
                      disabled={!connected || !isDirty || isSaving}
                      onClick={() => saveCollected(r)}
                      tooltip="РЎРѕС…СЂР°РЅРёС‚СЊ"
                    />
                </div>
                );
            }}
            />

              <Column
                header="Прогресс"
                style={{ minWidth: 220 }}
                body={progressBody}
              />





              <Column
                field="RemainingQuantity"
                header="Осталось"
                sortable
                style={{ minWidth: 130, textAlign: 'right' }}
                body={(r: PurchaseDocRowT) => (
                  <span className={num(r.RemainingQuantity) <= 0 ? 'text-green-700 font-semibold' : 'font-semibold'}>
                    {fmtNum(r.RemainingQuantity, 2)}
                  </span>
                )}
              />

              <Column
                field="CollectedCount"
                header="Сборов"
                sortable
                style={{ minWidth: 110, textAlign: 'right' }}
                body={(r: PurchaseDocRowT) => fmtNum(r.CollectedCount, 0)}
              />

              <Column
                field="Karobka"
                header="Коробка"
                sortable
                style={{ minWidth: 120, textAlign: 'right' }}
                body={(r: PurchaseDocRowT) => fmtNum(r.Karobka, 2)}
              />

              <Column
                field="Volume"
                header="Объём"
                sortable
                style={{ minWidth: 120, textAlign: 'right' }}
                body={(r: PurchaseDocRowT) => fmtNum(r.Volume, 3)}
              />

              <Column
                field="Weight"
                header="Вес"
                sortable
                style={{ minWidth: 120, textAlign: 'right' }}
                body={(r: PurchaseDocRowT) => fmtNum(r.Weight, 3)}
              />

              <Column field="WhsCode" header="Whs" sortable style={{ minWidth: 90 }} />
            </DataTable>
          </div>

          <Divider className="my-3" />

          {footer}
        </Card>
      </div>
    </>
  );
}
