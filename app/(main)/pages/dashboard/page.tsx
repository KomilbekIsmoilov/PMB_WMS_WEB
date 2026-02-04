'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import { Card } from 'primereact/card';
import { Toast } from 'primereact/toast';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import { Divider } from 'primereact/divider';
import { Calendar } from 'primereact/calendar';
import { Chart } from 'primereact/chart';
import { ProgressBar } from 'primereact/progressbar';

import api from '@/app/api/api';

type OrderDocT = {
  DocNum?: number | null;
  DocEntry?: number | null;
  DocDate?: string | null;
  CreateDate?: string | null;
  DocTime?: string | number | null;
  CardCode?: string | null;
  CardName?: string | null;
  U_State?: string | null;
  StartedAt?: string | null;
  FinishedAt?: string | null;
};

type TransferDocT = {
  DocNum?: number | null;
  DocEntry?: number | null;
  DocDate?: string | null;
  ToWhsCode?: string | null;
  ToWhsName?: string | null;
  U_State?: string | null;
  StartedAt?: string | null;
  FinishedAt?: string | null;
};

type PurchaseDocT = {
  DocNum?: number | null;
  DocEntry?: number | null;
  DocDate?: string | null;
  CardCode?: string | null;
  CardName?: string | null;
  U_State?: string | null;
};

type DeliveryLogT = {
  status?: string | null;
  StartedAt?: string | null;
  CompletedAt?: string | null;
};

type DeliveryDocT = {
  DocType?: string | null;
  DocNum?: number | null;
  DocEntry?: number | null;
  DocDate?: string | null;
  CardCode?: string | null;
  CardName?: string | null;
  ToWhsCode?: string | null;
  ToWhsName?: string | null;
  U_State?: string | null;
  deliveryLog?: DeliveryLogT | null;
};

type ReturnDocT = {
  DocNum?: number | null;
  DocEntry?: number | null;
  DocDate?: string | null;
  CardCode?: string | null;
  CardName?: string | null;
  Status?: string | null;
};

type BinTransferDocT = {
  _id?: string;
  DocNum?: number | null;
  DocEntry?: number | null;
  OpenedAt?: string | null;
  createdAt?: string | null;
  FromWhsCode?: string | null;
  ToWhsCode?: string | null;
  Status?: string | null;
};

type PickerReportRowT = {
  empID: number;
  lastName?: string | null;
  firstName?: string | null;
  TotalQty?: number | string | null;
  TotalVolume?: number | string | null;
  TotalWeight?: number | string | null;
};

type RecentRowT = {
  id: string;
  source: 'ORDER' | 'TRANSFER' | 'PURCHASE' | 'DELIVERY' | 'RETURN' | 'BIN';
  DocNum?: number | null;
  DocEntry?: number | null;
  docId?: string | null;
  DocDate?: string | null;
  Title?: string | null;
  Code?: string | null;
  Status?: string | null;
  DocType?: string | null;
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

const toDateObj = (v: any): Date | null => {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

const normalizeState = (v: any) =>
  String(v ?? '')
    .toLowerCase()
    .trim()
    .replace(/[вЂ™`Вґ]/g, "'")
    .replace(/\s+/g, ' ');

const statusSeverity = (s?: string | null) => {
  const t = normalizeState(s);
  if (!t) return 'secondary';
  if (t.includes('ошиб') || t.includes('error') || t.includes('fail')) return 'danger';
  if (t.includes('готов') || t.includes('заверш') || t.includes('done') || t.includes('complete')) return 'success';
  if (t.includes('в процессе') || t.includes('сбор') || t.includes('yig') || t.includes('progress')) return 'warning';
  if (t.includes('нов') || t.includes('yangi')) return 'info';
  return 'secondary';
};

type StatusCounts = {
  total: number;
  new: number;
  inProgress: number;
  done: number;
  error: number;
  other: number;
};

const statusBucket = (raw: any): keyof StatusCounts => {
  const t = normalizeState(raw);
  if (!t) return 'other';
  if (t.includes('ошиб') || t.includes('error') || t.includes('fail') || t.includes('toliq emas') || t.includes("to'liq emas"))
    return 'error';
  if (
    t.includes('готов') ||
    t.includes('заверш') ||
    t.includes('done') ||
    t.includes('complete') ||
    t.includes('отгруж') ||
    t.includes('закры') ||
    t.includes("yig'ib bo") ||
    t.includes('yigib bo') ||
    t.includes('yetkazildi')
  )
    return 'done';
  if (
    t.includes('в процессе') ||
    t.includes('progress') ||
    t.includes('сбор') ||
    t.includes("yig'il") ||
    t.includes('yigil') ||
    t.includes('yetkazilmo')
  )
    return 'inProgress';
  if (t.includes('нов') || t.includes('yangi')) return 'new';
  return 'other';
};

const countStatuses = <T,>(list: T[], getStatus: (item: T) => any): StatusCounts => {
  const base: StatusCounts = { total: 0, new: 0, inProgress: 0, done: 0, error: 0, other: 0 };
  return (list || []).reduce((acc, item) => {
    acc.total += 1;
    const key = statusBucket(getStatus(item));
    acc[key] += 1;
    return acc;
  }, base);
};

const statusSummary = (c: StatusCounts) => {
  if (!c.total) return '—';
  const parts = [`Новые ${c.new}`, `В процессе ${c.inProgress}`, `Готово ${c.done}`];
  if (c.error) parts.push(`Ошибка ${c.error}`);
  if (c.other) parts.push(`Прочее ${c.other}`);
  return parts.join(' • ');
};

const fmtDateParam = (d: Date | null) => {
  if (!d) return null;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const inRange = (d: Date | null, from: Date | null, to: Date | null) => {
  if (!from && !to) return true;
  if (!d) return false;
  const fromStart = from ? new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0, 0, 0, 0) : null;
  const toEnd = to ? new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999) : null;
  if (fromStart && d < fromStart) return false;
  if (toEnd && d > toEnd) return false;
  return true;
};

const filterByRange = <T,>(list: T[], getDate: (item: T) => any, from: Date | null, to: Date | null) => {
  if (!from && !to) return list;
  return list.filter((item) => inRange(toDateObj(getDate(item)), from, to));
};

const fullName = (r: PickerReportRowT) => `${r.lastName || ''} ${r.firstName || ''}`.trim() || 'Без имени';

export default function WmsDashboardPage() {
  const toast = useRef<Toast>(null);

  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [range, setRange] = useState<Date[] | null>(null);
  const [initialLoaded, setInitialLoaded] = useState(false);

  const [orders, setOrders] = useState<OrderDocT[]>([]);
  const [transfers, setTransfers] = useState<TransferDocT[]>([]);
  const [purchases, setPurchases] = useState<PurchaseDocT[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryDocT[]>([]);
  const [returns, setReturns] = useState<ReturnDocT[]>([]);
  const [binTransfers, setBinTransfers] = useState<BinTransferDocT[]>([]);
  const [pickers, setPickers] = useState<PickerReportRowT[]>([]);

  const from = range?.[0] ?? null;
  const to = range?.[1] ?? null;

  const loadAll = async () => {
    try {
      setLoading(true);
      const [ordersRes, transfersRes, purchasesRes, deliveriesRes, returnsRes, binRes, pickersRes] = await Promise.allSettled([
        api.get('/getOrdersDocsApi'),
        api.get('/getTransferDocsApi'),
        api.get('/getPurchaseDocsApi'),
        api.get('/getDeliveryDocsApi'),
        api.get('/getReturnDocsApi'),
        api.get('/getBinToBinApi'),
        api.get('/getPickersActivityReportApi', {
          params: {
            from: fmtDateParam(from),
            to: fmtDateParam(to),
          },
        }),
      ]);

      const unwrap = (r: PromiseSettledResult<any>) => (r.status === 'fulfilled' ? (r.value?.data ?? r.value ?? []) : []);
      const failed = [ordersRes, transfersRes, purchasesRes, deliveriesRes, returnsRes, binRes, pickersRes].filter((r) => r.status === 'rejected');

      setOrders(unwrap(ordersRes) as OrderDocT[]);
      setTransfers(unwrap(transfersRes) as TransferDocT[]);
      setPurchases(unwrap(purchasesRes) as PurchaseDocT[]);
      setDeliveries(unwrap(deliveriesRes) as DeliveryDocT[]);
      setReturns(unwrap(returnsRes) as ReturnDocT[]);
      setBinTransfers(unwrap(binRes) as BinTransferDocT[]);
      setPickers(unwrap(pickersRes) as PickerReportRowT[]);

      if (failed.length) {
        toast.current?.show({
          severity: 'warn',
          summary: 'Часть данных недоступна',
          detail: `Не удалось загрузить: ${failed.length} источник(ов)` ,
          life: 3500,
        });
      }

      setLastUpdated(new Date());
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: e?.response?.data?.message || 'Не удалось загрузить дашборд',
        life: 3500,
      });
    } finally {
      setLoading(false);
      setInitialLoaded(true);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!initialLoaded) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const ordersFiltered = useMemo(() => filterByRange(orders, (r) => r.DocDate ?? r.CreateDate, from, to), [orders, from, to]);
  const transfersFiltered = useMemo(() => filterByRange(transfers, (r) => r.DocDate, from, to), [transfers, from, to]);
  const purchasesFiltered = useMemo(() => filterByRange(purchases, (r) => r.DocDate, from, to), [purchases, from, to]);
  const deliveriesFiltered = useMemo(() => filterByRange(deliveries, (r) => r.DocDate, from, to), [deliveries, from, to]);
  const returnsFiltered = useMemo(() => filterByRange(returns, (r) => r.DocDate, from, to), [returns, from, to]);
  const binTransfersFiltered = useMemo(
    () => filterByRange(binTransfers, (r) => r.OpenedAt ?? r.createdAt, from, to),
    [binTransfers, from, to]
  );

  const kpi = useMemo(
    () => ({
      orders: ordersFiltered.length,
      transfers: transfersFiltered.length,
      purchases: purchasesFiltered.length,
      deliveries: deliveriesFiltered.length,
      returns: returnsFiltered.length,
      binTransfers: binTransfersFiltered.length,
    }),
    [ordersFiltered, transfersFiltered, purchasesFiltered, deliveriesFiltered, returnsFiltered, binTransfersFiltered]
  );

  const orderStatus = useMemo(() => countStatuses(ordersFiltered, (r) => (r as OrderDocT).U_State), [ordersFiltered]);
  const transferStatus = useMemo(() => countStatuses(transfersFiltered, (r) => (r as TransferDocT).U_State), [transfersFiltered]);
  const purchaseStatus = useMemo(() => countStatuses(purchasesFiltered, (r) => (r as PurchaseDocT).U_State), [purchasesFiltered]);
  const deliveryStatus = useMemo(
    () => countStatuses(deliveriesFiltered, (r) => (r as DeliveryDocT).deliveryLog?.status ?? (r as DeliveryDocT).U_State),
    [deliveriesFiltered]
  );
  const returnStatus = useMemo(() => countStatuses(returnsFiltered, (r) => (r as ReturnDocT).Status), [returnsFiltered]);
  const binStatus = useMemo(() => countStatuses(binTransfersFiltered, (r) => (r as BinTransferDocT).Status), [binTransfersFiltered]);

  const recentDocs = useMemo<RecentRowT[]>(() => {
    const list: RecentRowT[] = [];

    ordersFiltered.forEach((r, idx) => {
      list.push({
        id: `ORDER-${r.DocEntry ?? r.DocNum ?? idx}`,
        source: 'ORDER',
        DocNum: r.DocNum ?? null,
        DocEntry: r.DocEntry ?? null,
        DocDate: r.DocDate ?? r.CreateDate ?? null,
        Title: r.CardName ?? null,
        Code: r.CardCode ?? null,
        Status: r.U_State ?? null,
      });
    });

    transfersFiltered.forEach((r, idx) => {
      list.push({
        id: `TRANSFER-${r.DocEntry ?? r.DocNum ?? idx}`,
        source: 'TRANSFER',
        DocNum: r.DocNum ?? null,
        DocEntry: r.DocEntry ?? null,
        DocDate: r.DocDate ?? null,
        Title: r.ToWhsName ?? r.ToWhsCode ?? null,
        Code: r.ToWhsCode ?? null,
        Status: r.U_State ?? null,
      });
    });

    purchasesFiltered.forEach((r, idx) => {
      list.push({
        id: `PURCHASE-${r.DocEntry ?? r.DocNum ?? idx}`,
        source: 'PURCHASE',
        DocNum: r.DocNum ?? null,
        DocEntry: r.DocEntry ?? null,
        DocDate: r.DocDate ?? null,
        Title: r.CardName ?? null,
        Code: r.CardCode ?? null,
        Status: r.U_State ?? null,
      });
    });

    deliveriesFiltered.forEach((r, idx) => {
      const type = String(r.DocType ?? '').toUpperCase();
      const isTransfer = type === 'TRANSFER';
      list.push({
        id: `DELIVERY-${r.DocEntry ?? r.DocNum ?? idx}`,
        source: 'DELIVERY',
        DocNum: r.DocNum ?? null,
        DocEntry: r.DocEntry ?? null,
        DocDate: r.DocDate ?? null,
        Title: isTransfer ? r.ToWhsName ?? r.ToWhsCode ?? null : r.CardName ?? null,
        Code: isTransfer ? r.ToWhsCode ?? null : r.CardCode ?? null,
        Status: r.deliveryLog?.status ?? r.U_State ?? null,
        DocType: r.DocType ?? null,
      });
    });

    returnsFiltered.forEach((r, idx) => {
      list.push({
        id: `RETURN-${r.DocEntry ?? r.DocNum ?? idx}`,
        source: 'RETURN',
        DocNum: r.DocNum ?? null,
        DocEntry: r.DocEntry ?? null,
        DocDate: r.DocDate ?? null,
        Title: r.CardName ?? null,
        Code: r.CardCode ?? null,
        Status: r.Status ?? null,
      });
    });

    binTransfersFiltered.forEach((r, idx) => {
      list.push({
        id: `BIN-${r._id ?? r.DocEntry ?? r.DocNum ?? idx}`,
        source: 'BIN',
        DocNum: r.DocNum ?? null,
        DocEntry: r.DocEntry ?? null,
        docId: r._id ?? null,
        DocDate: r.OpenedAt ?? r.createdAt ?? null,
        Title: `${r.FromWhsCode ?? ''} > ${r.ToWhsCode ?? ''}`.trim() || null,
        Code: r.ToWhsCode ?? null,
        Status: r.Status ?? null,
      });
    });

    return list
      .sort((a, b) => {
        const da = toDateObj(a.DocDate)?.getTime() ?? 0;
        const db = toDateObj(b.DocDate)?.getTime() ?? 0;
        return db - da;
      })
      .slice(0, 12);
  }, [ordersFiltered, transfersFiltered, purchasesFiltered, deliveriesFiltered, returnsFiltered, binTransfersFiltered]);

  const recentTypeLabel = (src: RecentRowT['source'], docType?: string | null) => {
    if (src === 'ORDER') return 'Заказ';
    if (src === 'TRANSFER') return 'Перемещение';
    if (src === 'PURCHASE') return 'Закупка';
    if (src === 'RETURN') return 'Возврат';
    if (src === 'BIN') return 'Bin-to-Bin';
    if (src === 'DELIVERY') {
      const t = String(docType ?? '').toUpperCase();
      if (t === 'TRANSFER') return 'Доставка: перемещение';
      if (t === 'ORDER') return 'Доставка: заказ';
      return 'Доставка';
    }
    return '-';
  };

  const detailHref = (r: RecentRowT) => {
    const docEntry = encodeURIComponent(String(r.DocEntry ?? ''));
    const docNum = encodeURIComponent(String(r.DocNum ?? ''));

    if (r.source === 'ORDER') return `/pages/wms/SalesOrdersDetail?DocEntry=${docEntry}&DocNum=${docNum}`;
    if (r.source === 'TRANSFER') return `/pages/wms/TransferRequestsDetail?DocEntry=${docEntry}&DocNum=${docNum}`;
    if (r.source === 'PURCHASE') return `/pages/wms/PurchaseDocDetail?DocEntry=${docEntry}&DocNum=${docNum}`;
    if (r.source === 'RETURN') return `/wms/returns/detail?DocEntry=${docEntry}&DocNum=${docNum}`;
    if (r.source === 'BIN') {
      if (r.docId) return `/wms/bin-transfer/detail?id=${encodeURIComponent(String(r.docId))}`;
      return `/wms/bin-transfer/detail?DocEntry=${docEntry}`;
    }
    if (r.source === 'DELIVERY') {
      const t = String(r.DocType ?? '').toUpperCase();
      if (t === 'TRANSFER') return `/pages/wms/TransferRequestsDetail?DocEntry=${docEntry}&DocNum=${docNum}`;
      return `/pages/wms/SalesOrdersDetail?DocEntry=${docEntry}&DocNum=${docNum}`;
    }
    return '#';
  };

  const last7 = useMemo(() => {
    return Array.from({ length: 7 }).map((_, idx) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - idx));
      return d;
    });
  }, []);

  const countByDay = (list: any[], getDate: (r: any) => any, day: Date) => {
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0).getTime();
    const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999).getTime();
    return list.reduce((s, r) => {
      const d = toDateObj(getDate(r));
      if (!d) return s;
      const t = d.getTime();
      return t >= start && t <= end ? s + 1 : s;
    }, 0);
  };

  const lineChartData = useMemo(() => {
    const labels = last7.map((d) => d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }));
    const ordersSeries = last7.map((d) => countByDay(orders, (r) => r.DocDate ?? r.CreateDate, d));
    const transfersSeries = last7.map((d) => countByDay(transfers, (r) => r.DocDate, d));

    return {
      labels,
      datasets: [
        { label: 'Заказы', data: ordersSeries, fill: false, tension: 0.35 },
        { label: 'Перемещения', data: transfersSeries, fill: false, tension: 0.35 },
      ],
    };
  }, [last7, orders, transfers]);

  const doughnutData = useMemo(() => {
    const labels = ['Заказы', 'Перемещения', 'Закупки', 'Доставка', 'Возвраты', 'Bin-to-Bin'];
    const data = [kpi.orders, kpi.transfers, kpi.purchases, kpi.deliveries, kpi.returns, kpi.binTransfers];

    return {
      labels,
      datasets: [
        {
          data,
        },
      ],
    };
  }, [kpi]);

  const topPickers = useMemo(() => {
    return [...pickers]
      .sort((a, b) => num(b.TotalQty) - num(a.TotalQty))
      .slice(0, 8);
  }, [pickers]);

  const maxPickerWeight = useMemo(() => {
    const max = Math.max(1, ...topPickers.map((p) => num(p.TotalWeight)));
    return max;
  }, [topPickers]);

  const returnsShort = useMemo(() => {
    return [...returnsFiltered]
      .sort((a, b) => (toDateObj(b.DocDate)?.getTime() ?? 0) - (toDateObj(a.DocDate)?.getTime() ?? 0))
      .slice(0, 8);
  }, [returnsFiltered]);

  return (
    <div className="flex flex-column gap-3">
      <Toast ref={toast} />

      <div className="flex align-items-center justify-content-between flex-wrap gap-2">
        <div>
          <div className="text-900 text-2xl font-semibold">WMS Dashboard</div>
          <div className="text-600">
            Обновлено: {lastUpdated ? fmtDateTime(lastUpdated) : '—'}
          </div>
        </div>

        <div className="flex align-items-center gap-2 flex-wrap">
          <Calendar
            value={range as any}
            onChange={(e) => setRange(e.value as any)}
            selectionMode="range"
            readOnlyInput
            placeholder="Период"
            className="w-15rem"
          />
          <Button icon="pi pi-refresh" label={loading ? 'Загрузка...' : 'Обновить'} onClick={loadAll} loading={loading} />
        </div>
      </div>

      <div className="grid">
        <div className="col-12 md:col-4 xl:col-2">
          <Card className="h-full">
            <div className="flex align-items-center justify-content-between">
              <div>
                <div className="text-600 mb-1">Заказы</div>
                <div className="text-900 text-2xl font-semibold">{kpi.orders}</div>
                <div className="text-500 text-sm">{statusSummary(orderStatus)}</div>
              </div>
              <i className="pi pi-shopping-cart text-2xl text-blue-500" />
            </div>
          </Card>
        </div>

        <div className="col-12 md:col-4 xl:col-2">
          <Card className="h-full">
            <div className="flex align-items-center justify-content-between">
              <div>
                <div className="text-600 mb-1">Перемещения</div>
                <div className="text-900 text-2xl font-semibold">{kpi.transfers}</div>
                <div className="text-500 text-sm">{statusSummary(transferStatus)}</div>
              </div>
              <i className="pi pi-arrow-right-arrow-left text-2xl text-teal-500" />
            </div>
          </Card>
        </div>

        <div className="col-12 md:col-4 xl:col-2">
          <Card className="h-full">
            <div className="flex align-items-center justify-content-between">
              <div>
                <div className="text-600 mb-1">Закупки</div>
                <div className="text-900 text-2xl font-semibold">{kpi.purchases}</div>
                <div className="text-500 text-sm">{statusSummary(purchaseStatus)}</div>
              </div>
              <i className="pi pi-box text-2xl text-orange-500" />
            </div>
          </Card>
        </div>

        <div className="col-12 md:col-4 xl:col-2">
          <Card className="h-full">
            <div className="flex align-items-center justify-content-between">
              <div>
                <div className="text-600 mb-1">Доставка</div>
                <div className="text-900 text-2xl font-semibold">{kpi.deliveries}</div>
                <div className="text-500 text-sm">{statusSummary(deliveryStatus)}</div>
              </div>
              <i className="pi pi-truck text-2xl text-green-500" />
            </div>
          </Card>
        </div>

        <div className="col-12 md:col-4 xl:col-2">
          <Card className="h-full">
            <div className="flex align-items-center justify-content-between">
              <div>
                <div className="text-600 mb-1">Возвраты</div>
                <div className="text-900 text-2xl font-semibold">{kpi.returns}</div>
                <div className="text-500 text-sm">{statusSummary(returnStatus)}</div>
              </div>
              <i className="pi pi-undo text-2xl text-purple-500" />
            </div>
          </Card>
        </div>

        <div className="col-12 md:col-4 xl:col-2">
          <Card className="h-full">
            <div className="flex align-items-center justify-content-between">
              <div>
                <div className="text-600 mb-1">Bin-to-Bin</div>
                <div className="text-900 text-2xl font-semibold">{kpi.binTransfers}</div>
                <div className="text-500 text-sm">{statusSummary(binStatus)}</div>
              </div>
              <i className="pi pi-sitemap text-2xl text-red-500" />
            </div>
          </Card>
        </div>
      </div>

      <div className="grid">
        <div className="col-12 xl:col-8">
          <Card>
            <div className="flex align-items-center justify-content-between">
              <div className="text-900 font-medium text-lg">Динамика за 7 дней</div>
              <div className="text-600 text-sm">Заказы vs Перемещения</div>
            </div>
            <Divider />
            <Chart type="line" data={lineChartData} />
          </Card>
        </div>

        <div className="col-12 xl:col-4">
          <Card>
            <div className="flex align-items-center justify-content-between">
              <div className="text-900 font-medium text-lg">Структура документов</div>
              <div className="text-600 text-sm">Все типы</div>
            </div>
            <Divider />
            <Chart type="doughnut" data={doughnutData} />
          </Card>
        </div>
      </div>

      <div className="grid">
        <div className="col-12 xl:col-8">
          <Card>
            <div className="flex align-items-center justify-content-between flex-wrap gap-2">
              <div className="text-900 font-medium text-lg">Последние документы</div>
              <Button label="Обновить" icon="pi pi-refresh" severity="secondary" onClick={loadAll} disabled={loading} />
            </div>
            <Divider />

            <DataTable value={recentDocs} loading={loading} dataKey="id" emptyMessage="Нет данных">
              <Column
                header="Тип"
                body={(r: RecentRowT) => <Tag value={recentTypeLabel(r.source, r.DocType)} />}
                style={{ width: 180 }}
              />
              <Column
                header="DocNum"
                body={(r: RecentRowT) => {
                  const href = detailHref(r);
                  const label = r.DocNum ?? '-';
                  if (!href || href === '#') return <span className="font-semibold">{label}</span>;
                  return (
                    <Link href={href} className="font-semibold text-primary hover:underline">
                      {label}
                    </Link>
                  );
                }}
                style={{ width: 120 }}
              />
              <Column field="Title" header="Контрагент / Склад" />
              <Column field="Code" header="Код" style={{ width: 140 }} />
              <Column header="Дата" body={(r: RecentRowT) => fmtDate(r.DocDate)} style={{ width: 120 }} />
              <Column
                header="Статус"
                body={(r: RecentRowT) => <Tag value={r.Status ? String(r.Status) : '-'} severity={statusSeverity(r.Status)} />}
                style={{ width: 180 }}
              />
            </DataTable>
          </Card>
        </div>

        <div className="col-12 xl:col-4">
          <Card>
            <div className="flex align-items-center justify-content-between flex-wrap gap-2">
              <div className="text-900 font-medium text-lg">Возвраты (последние)</div>
              <Tag value={`Всего: ${kpi.returns}`} severity="warning" />
            </div>
            <Divider />

            <DataTable value={returnsShort} loading={loading} dataKey="DocEntry" emptyMessage="Нет данных">
              <Column field="DocNum" header="DocNum" style={{ width: 110 }} />
              <Column field="CardName" header="Контрагент" />
              <Column header="Дата" body={(r: ReturnDocT) => fmtDate(r.DocDate)} style={{ width: 120 }} />
              <Column
                header="Статус"
                body={(r: ReturnDocT) => <Tag value={r.Status ? String(r.Status) : '-'} severity={statusSeverity(r.Status)} />}
                style={{ width: 140 }}
              />
            </DataTable>
          </Card>
        </div>
      </div>

      <Card>
        <div className="flex align-items-center justify-content-between flex-wrap gap-2">
          <div className="text-900 font-medium text-lg">Активность сборщиков</div>
          <div className="text-600 text-sm">Период: {from || to ? `${fmtDate(from)} – ${fmtDate(to)}` : 'весь'}</div>
        </div>
        <Divider />

        <DataTable value={topPickers} loading={loading} dataKey="empID" emptyMessage="Нет данных">
          <Column field="empID" header="ID" style={{ width: 100 }} />
          <Column header="ФИО" body={(r: PickerReportRowT) => fullName(r)} />
          <Column header="Кол-во" body={(r: PickerReportRowT) => fmtNum(r.TotalQty, 2)} style={{ width: 120, textAlign: 'right' }} />
          <Column header="Объём" body={(r: PickerReportRowT) => fmtNum(r.TotalVolume, 3)} style={{ width: 120, textAlign: 'right' }} />
          <Column
            header="Вес"
            body={(r: PickerReportRowT) => (
              <div className="flex align-items-center gap-2">
                <ProgressBar value={Math.round((num(r.TotalWeight) / maxPickerWeight) * 100)} showValue={false} style={{ width: 140 }} />
                <span className="text-700">{fmtNum(r.TotalWeight, 3)}</span>
              </div>
            )}
            style={{ width: 220 }}
          />
        </DataTable>
      </Card>
    </div>
  );
}

