// app/(main)/page.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Card } from 'primereact/card';
import { Dropdown } from 'primereact/dropdown';
import { Calendar } from 'primereact/calendar';
import { Button } from 'primereact/button';
import { Divider } from 'primereact/divider';
import { Tag } from 'primereact/tag';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Chart } from 'primereact/chart';
import { ProgressBar } from 'primereact/progressbar';

type OptionT = { label: string; value: string };

type RecentDocT = {
  id: string;
  DocNum: number;
  DocType: 'Заказ' | 'Перемещение' | 'Инвентаризация' | 'Возврат';
  CardName: string;
  WhsCode: string;
  Total: number;
  Curr: 'USD' | 'UZS';
  Status: 'Новый' | 'В сборке' | 'Отгружено' | 'Отменён';
  DocDate: string;
};

type StockAlertT = {
  id: string;
  ItemCode: string;
  ItemName: string;
  WhsCode: string;
  OnHand: number;
  MinLevel: number;
};

type PickerStatT = {
  id: string;
  Name: string;
  Picks: number;
  Lines: number;
  Accuracy: number; // %
};

const uid = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`;

const fmtMoney = (v: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(v));

const todayStr = () => {
  const d = new Date();
  return d.toLocaleDateString('ru-RU');
};

export default function WmsDashboardPage() {
  const [loading, setLoading] = useState(true);

  // Filters (frontend mock)
  const branchOptions: OptionT[] = useMemo(
    () => [
      { label: 'Все филиалы', value: 'ALL' },
      { label: '1 - Ташкент', value: '1' },
      { label: '2 - Фергана', value: '2' },
      { label: '3 - Самарканд', value: '3' },
      { label: '4 - Нукус', value: '4' },
    ],
    []
  );

  const whsOptions: OptionT[] = useMemo(
    () => [
      { label: 'Все склады', value: 'ALL' },
      { label: '01 - Основной', value: '01' },
      { label: '02 - Кабель', value: '02' },
      { label: '03 - Брак', value: '03' },
    ],
    []
  );

  const [branch, setBranch] = useState<string>('ALL');
  const [whs, setWhs] = useState<string>('ALL');
  const [range, setRange] = useState<Date[] | null>(null);

  // ===== MOCK DATA =====
  const [kpi, setKpi] = useState({
    newOrders: 0,
    inPicking: 0,
    shipped: 0,
    returns: 0,
    transferRequests: 0,
    stockAlerts: 0,
  });

  const [recentDocs, setRecentDocs] = useState<RecentDocT[]>([]);
  const [stockAlerts, setStockAlerts] = useState<StockAlertT[]>([]);
  const [pickers, setPickers] = useState<PickerStatT[]>([]);

  const [lineChartData, setLineChartData] = useState<any>(null);
  const [doughnutData, setDoughnutData] = useState<any>(null);

  const reloadMock = () => {
    setLoading(true);

    setTimeout(() => {
      // KPI random
      const newOrders = 18 + Math.floor(Math.random() * 12);
      const inPicking = 8 + Math.floor(Math.random() * 10);
      const shipped = 25 + Math.floor(Math.random() * 18);
      const returns = 1 + Math.floor(Math.random() * 6);
      const transferRequests = 5 + Math.floor(Math.random() * 10);
      const stockAlertsCount = 6 + Math.floor(Math.random() * 12);

      setKpi({
        newOrders,
        inPicking,
        shipped,
        returns,
        transferRequests,
        stockAlerts: stockAlertsCount,
      });

      // Recent docs
      const docs: RecentDocT[] = Array.from({ length: 12 }).map((_, i) => {
        const types: RecentDocT['DocType'][] = ['Заказ', 'Перемещение', 'Инвентаризация', 'Возврат'];
        const statuses: RecentDocT['Status'][] = ['Новый', 'В сборке', 'Отгружено', 'Отменён'];

        const DocType = types[Math.floor(Math.random() * types.length)];
        const Status = statuses[Math.floor(Math.random() * statuses.length)];
        const whsCode = ['01', '02', '03'][Math.floor(Math.random() * 3)];

        const amount = 200 + Math.floor(Math.random() * 4500);
        const curr: 'USD' | 'UZS' = DocType === 'Заказ' ? 'USD' : Math.random() > 0.5 ? 'USD' : 'UZS';

        const dd = new Date();
        dd.setDate(dd.getDate() - Math.floor(Math.random() * 6));

        return {
          id: uid(),
          DocNum: 100000 + i + Math.floor(Math.random() * 250),
          DocType,
          CardName: ['OOO Plastherm', 'OOO PMB', 'Ferro Trade', 'Europrint', 'Mega Lux'][Math.floor(Math.random() * 5)],
          WhsCode: whsCode,
          Total: curr === 'USD' ? amount : amount * 12000,
          Curr: curr,
          Status,
          DocDate: dd.toLocaleDateString('ru-RU'),
        };
      });

      setRecentDocs(docs);

      // Stock alerts
      const alerts: StockAlertT[] = Array.from({ length: stockAlertsCount }).map((_, i) => {
        const onHand = Math.floor(Math.random() * 20);
        const minLevel = 10 + Math.floor(Math.random() * 30);
        return {
          id: uid(),
          ItemCode: `ITM-${1000 + i}`,
          ItemName: ['Лампа', 'Панель', 'Кабель', 'Люстра', 'Плафон'][Math.floor(Math.random() * 5)] + ` ${i + 1}`,
          WhsCode: ['01', '02', '03'][Math.floor(Math.random() * 3)],
          OnHand: onHand,
          MinLevel: minLevel,
        };
      });

      setStockAlerts(alerts);

      // Picker stats
      const pickerList: PickerStatT[] = [
        { id: uid(), Name: 'Алишер', Picks: 32, Lines: 210, Accuracy: 98 },
        { id: uid(), Name: 'Сардор', Picks: 27, Lines: 180, Accuracy: 96 },
        { id: uid(), Name: 'Дилшод', Picks: 24, Lines: 165, Accuracy: 97 },
        { id: uid(), Name: 'Бекзод', Picks: 18, Lines: 130, Accuracy: 94 },
        { id: uid(), Name: 'Рустам', Picks: 15, Lines: 110, Accuracy: 95 },
      ].map((x) => ({
        ...x,
        Picks: x.Picks + Math.floor(Math.random() * 6),
        Lines: x.Lines + Math.floor(Math.random() * 40),
        Accuracy: Math.min(99, x.Accuracy + Math.floor(Math.random() * 2)),
      }));

      setPickers(pickerList);

      // Charts (last 7 days)
      const labels = Array.from({ length: 7 }).map((_, idx) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - idx));
        return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
      });

      const ordersSeries = labels.map(() => 10 + Math.floor(Math.random() * 25));
      const shippedSeries = labels.map(() => 8 + Math.floor(Math.random() * 30));

      setLineChartData({
        labels,
        datasets: [
          { label: 'Заказы', data: ordersSeries },
          { label: 'Отгрузки', data: shippedSeries },
        ],
      });

      setDoughnutData({
        labels: ['Новый', 'В сборке', 'Отгружено', 'Отменён'],
        datasets: [
          {
            data: [
              12 + Math.floor(Math.random() * 12),
              8 + Math.floor(Math.random() * 10),
              25 + Math.floor(Math.random() * 18),
              1 + Math.floor(Math.random() * 6),
            ],
          },
        ],
      });

      setLoading(false);
    }, 450);
  };

  useEffect(() => {
    reloadMock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh on filters change (still mock)
  useEffect(() => {
    if (!loading) reloadMock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch, whs]);

  const statusSeverity = (s: RecentDocT['Status']) => {
    switch (s) {
      case 'Новый':
        return 'info';
      case 'В сборке':
        return 'warning';
      case 'Отгружено':
        return 'success';
      case 'Отменён':
        return 'danger';
      default:
        return 'secondary';
    }
  };

  const docTypeIcon = (t: RecentDocT['DocType']) => {
    switch (t) {
      case 'Заказ':
        return 'pi pi-shopping-cart';
      case 'Перемещение':
        return 'pi pi-arrow-right-arrow-left';
      case 'Инвентаризация':
        return 'pi pi-list-check';
      case 'Возврат':
        return 'pi pi-undo';
      default:
        return 'pi pi-file';
    }
  };

  const moneyCell = (row: RecentDocT) => (
    <span className="font-medium">
      {fmtMoney(row.Total)} {row.Curr}
    </span>
  );

  const statusCell = (row: RecentDocT) => <Tag value={row.Status} severity={statusSeverity(row.Status)} />;

  const docTypeCell = (row: RecentDocT) => (
    <div className="flex align-items-center gap-2">
      <i className={docTypeIcon(row.DocType)} />
      <span>{row.DocType}</span>
    </div>
  );

  const stockLevelCell = (row: StockAlertT) => {
    const pct = Math.min(100, Math.round((row.OnHand / Math.max(1, row.MinLevel)) * 100));
    return (
      <div>
        <div className="text-700 mb-1">
          {row.OnHand} / {row.MinLevel}
        </div>
        <ProgressBar value={pct} showValue={false} />
      </div>
    );
  };

  return (
    <div className="flex flex-column gap-3">
      {/* HEADER */}
      <div className="flex align-items-center justify-content-between flex-wrap gap-2">
        <div>
          <div className="text-900 text-2xl font-semibold">WMS Dashboard</div>
          <div className="text-600">Сегодня: {todayStr()} • Данные временно mock (без backend)</div>
        </div>

        <div className="flex align-items-center gap-2 flex-wrap">
          <Dropdown
            value={branch}
            options={branchOptions}
            onChange={(e) => setBranch(e.value)}
            className="w-15rem"
            placeholder="Филиал"
          />
          <Dropdown value={whs} options={whsOptions} onChange={(e) => setWhs(e.value)} className="w-15rem" placeholder="Склад" />

          <Calendar
            value={range as any}
            onChange={(e) => setRange(e.value as any)}
            selectionMode="range"
            readOnlyInput
            placeholder="Период"
            className="w-15rem"
          />

          <Button icon="pi pi-refresh" label="Обновить" onClick={reloadMock} loading={loading} />
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid">
        <div className="col-12 md:col-4 xl:col-2">
          <Card className="h-full">
            <div className="flex align-items-center justify-content-between">
              <div>
                <div className="text-600 mb-1">Новые заказы</div>
                <div className="text-900 text-2xl font-semibold">{kpi.newOrders}</div>
              </div>
              <i className="pi pi-shopping-cart text-2xl text-blue-500" />
            </div>
          </Card>
        </div>

        <div className="col-12 md:col-4 xl:col-2">
          <Card className="h-full">
            <div className="flex align-items-center justify-content-between">
              <div>
                <div className="text-600 mb-1">В сборке</div>
                <div className="text-900 text-2xl font-semibold">{kpi.inPicking}</div>
              </div>
              <i className="pi pi-box text-2xl text-orange-500" />
            </div>
          </Card>
        </div>

        <div className="col-12 md:col-4 xl:col-2">
          <Card className="h-full">
            <div className="flex align-items-center justify-content-between">
              <div>
                <div className="text-600 mb-1">Отгружено</div>
                <div className="text-900 text-2xl font-semibold">{kpi.shipped}</div>
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
              </div>
              <i className="pi pi-undo text-2xl text-purple-500" />
            </div>
          </Card>
        </div>

        <div className="col-12 md:col-4 xl:col-2">
          <Card className="h-full">
            <div className="flex align-items-center justify-content-between">
              <div>
                <div className="text-600 mb-1">Заявки на перемещение</div>
                <div className="text-900 text-2xl font-semibold">{kpi.transferRequests}</div>
              </div>
              <i className="pi pi-arrow-right-arrow-left text-2xl text-teal-500" />
            </div>
          </Card>
        </div>

        <div className="col-12 md:col-4 xl:col-2">
          <Card className="h-full">
            <div className="flex align-items-center justify-content-between">
              <div>
                <div className="text-600 mb-1">Мин. остатки</div>
                <div className="text-900 text-2xl font-semibold">{kpi.stockAlerts}</div>
              </div>
              <i className="pi pi-exclamation-triangle text-2xl text-red-500" />
            </div>
          </Card>
        </div>
      </div>

      {/* CHARTS */}
      <div className="grid">
        <div className="col-12 xl:col-8">
          <Card>
            <div className="flex align-items-center justify-content-between">
              <div className="text-900 font-medium text-lg">Динамика за 7 дней</div>
              <div className="text-600 text-sm">Заказы vs Отгрузки</div>
            </div>
            <Divider />
            <Chart type="line" data={lineChartData || { labels: [], datasets: [] }} />
          </Card>
        </div>

        <div className="col-12 xl:col-4">
          <Card>
            <div className="flex align-items-center justify-content-between">
              <div className="text-900 font-medium text-lg">Статусы документов</div>
              <div className="text-600 text-sm">Общая картина</div>
            </div>
            <Divider />
            <Chart type="doughnut" data={doughnutData || { labels: [], datasets: [] }} />
          </Card>
        </div>
      </div>

      {/* TABLES */}
      <div className="grid">
        {/* Recent docs */}
        <div className="col-12 xl:col-8">
          <Card>
            <div className="flex align-items-center justify-content-between flex-wrap gap-2">
              <div className="text-900 font-medium text-lg">Последние документы</div>
              <Button label="Показать все" icon="pi pi-angle-right" severity="secondary" outlined />
            </div>
            <Divider />

            <DataTable value={recentDocs} loading={loading} paginator rows={8} dataKey="id" emptyMessage="Нет данных">
              <Column header="Тип" body={docTypeCell} style={{ width: 190 }} />
              <Column field="DocNum" header="DocNum" style={{ width: 110 }} />
              <Column field="CardName" header="Контрагент" />
              <Column field="WhsCode" header="Склад" style={{ width: 90 }} />
              <Column header="Сумма" body={moneyCell} style={{ width: 160 }} />
              <Column header="Статус" body={statusCell} style={{ width: 150 }} />
              <Column field="DocDate" header="Дата" style={{ width: 120 }} />
            </DataTable>
          </Card>
        </div>

        {/* Stock alerts */}
        <div className="col-12 xl:col-4">
          <Card>
            <div className="flex align-items-center justify-content-between flex-wrap gap-2">
              <div className="text-900 font-medium text-lg">Критические остатки</div>
              <Tag value="Важно" severity="danger" />
            </div>
            <Divider />

            <DataTable value={stockAlerts} loading={loading} dataKey="id" scrollable scrollHeight="380px" emptyMessage="Нет критических позиций">
              <Column field="ItemCode" header="Код" style={{ width: 110 }} />
              <Column field="ItemName" header="Наименование" />
              <Column field="WhsCode" header="Склад" style={{ width: 80 }} />
              <Column header="Уровень" body={stockLevelCell} style={{ width: 180 }} />
            </DataTable>
          </Card>
        </div>
      </div>

      {/* Pickers stats */}
      <Card>
        <div className="flex align-items-center justify-content-between flex-wrap gap-2">
          <div className="text-900 font-medium text-lg">Производительность сборщиков</div>
          <div className="text-600 text-sm">Сегодня • mock</div>
        </div>
        <Divider />

        <DataTable value={pickers} loading={loading} dataKey="id" emptyMessage="Нет данных">
          <Column field="Name" header="Сборщик" />
          <Column field="Picks" header="Сборок" style={{ width: 120 }} />
          <Column field="Lines" header="Строк" style={{ width: 120 }} />
          <Column
            header="Точность"
            body={(r: PickerStatT) => (
              <div className="flex align-items-center gap-2">
                <ProgressBar value={r.Accuracy} showValue={false} style={{ width: 140 }} />
                <span className="text-700">{r.Accuracy}%</span>
              </div>
            )}
            style={{ width: 240 }}
          />
        </DataTable>
      </Card>
    </div>
  );
}
