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
import { FilterMatchMode } from 'primereact/api';

import api from '@/app/api/api';

type DetailRowT = {
  ObjType?: string | number | null;
  DocEntry?: number | null;
  DocNum?: number | null;
  DocStatus?: string | null;
  DocDate?: string | null;
  DocDueDate?: string | null;
  DocTime?: string | number | null;
  CreateDate?: string | null;
  CardCode?: string | null;
  CardName?: string | null;
  Comments?: string | null;
  BPLId?: number | null;
  BPLName?: string | null;
  U_State?: string | null;
  U_WorkArea?: number | null;
  U_Filial?: string | null;
  U_Checker?: string | null;
  U_WorkAreaName?: string | null;
  SlpCode?: number | null;
  SlpName?: string | null;
  LineNum?: number | null;
  BaseType?: number | null;
  BaseEntry?: number | null;
  BaseLine?: number | null;
  ItemCode?: string | null;
  ItemName?: string | null;
  Quantity?: number | string | null;
  OpenQty?: number | string | null;
  WhsCode?: string | null;
  WhsName?: string | null;
  OnHand?: number | string | null;
  OnHandAll?: number | string | null;
  BVolume?: number | string | null;
  BWeight1?: number | string | null;
  LineVolume?: number | string | null;
  LineWeight?: number | string | null;
  ToWhsCode?: string | null;
  ToWhsName?: string | null;
};

const OBJ_DELIVERY = 15;
const OBJ_TRANSFER_REQUEST = 67;

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

const fmtDateTime = (v: unknown) => {
  if (!v) return '';
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString('ru-RU');
};

function inferObjType(rawObjType: string, rawDocType: string): number {
  const byObjType = Number(rawObjType);
  if (Number.isFinite(byObjType)) return byObjType;
  return String(rawDocType).toUpperCase() === 'TRANSFER' ? OBJ_TRANSFER_REQUEST : OBJ_DELIVERY;
}

export default function DeliveryDocsDetailPage() {
  const toast = useRef<Toast>(null);
  const router = useRouter();
  const sp = useSearchParams();

  const docEntry = sp.get('DocEntry') || '';
  const docNum = sp.get('DocNum') || '';
  const rawObjType = sp.get('ObjType') || '';
  const rawDocType = sp.get('DocType') || '';

  const objType = useMemo(() => inferObjType(rawObjType, rawDocType), [rawDocType, rawObjType]);
  const isTransfer = objType === OBJ_TRANSFER_REQUEST;

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<DetailRowT[]>([]);

  const [globalFilterValue, setGlobalFilterValue] = useState('');
  const [filters, setFilters] = useState<DataTableFilterMeta>({
    global: { value: null, matchMode: FilterMatchMode.CONTAINS },
  });

  const headerInfo = useMemo(() => {
    const r = rows[0];
    if (!r) return null;
    return {
      DocNum: r.DocNum ?? Number(docNum),
      DocEntry: r.DocEntry ?? Number(docEntry),
      ObjType: r.ObjType ?? objType,
      DocDate: r.DocDate,
      DocDueDate: r.DocDueDate,
      CreateDate: r.CreateDate,
      DocTime: r.DocTime,
      DocStatus: r.DocStatus,
      CardCode: r.CardCode,
      CardName: r.CardName,
      ToWhsCode: r.ToWhsCode,
      ToWhsName: r.ToWhsName,
      SlpName: r.SlpName,
      BPLName: r.BPLName,
      U_State: r.U_State,
      U_WorkAreaName: r.U_WorkAreaName,
      Comments: r.Comments,
    };
  }, [docEntry, docNum, objType, rows]);

  const totals = useMemo(() => {
    return {
      lines: rows.length,
      qty: rows.reduce((s, r) => s + num(r.Quantity), 0),
      openQty: rows.reduce((s, r) => s + num(r.OpenQty), 0),
      volume: rows.reduce((s, r) => s + num(r.LineVolume), 0),
      weight: rows.reduce((s, r) => s + num(r.LineWeight), 0),
    };
  }, [rows]);

  const load = useCallback(async () => {
    try {
      if (!docEntry) {
        toast.current?.show({ severity: 'warn', summary: 'Внимание', detail: 'DocEntry не указан в URL', life: 3000 });
        return;
      }

      setLoading(true);
      const res = await api.get('/getDeliveryOrTransferItemsApi', {
        params: {
          ObjType: objType,
          DocEntry: docEntry,
        },
      });

      const data = (res?.data ?? res) as DetailRowT[];
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: e?.response?.data?.message || 'Не удалось загрузить документ доставки',
        life: 3500,
      });
    } finally {
      setLoading(false);
    }
  }, [docEntry, objType]);

  useEffect(() => {
    load();
  }, [load]);

  const onGlobalFilterChange = (value: string) => {
    const next = { ...filters };
    (next.global as { value: string | null }).value = value;
    setFilters(next);
    setGlobalFilterValue(value);
  };

  return (
    <>
      <Toast ref={toast} />

      <div className="flex flex-column gap-3">
        <div className="flex align-items-center gap-2 flex-wrap">
          <Button label="Назад" icon="pi pi-arrow-left" severity="secondary" onClick={() => router.back()} />
          <Button
            label={loading ? 'Загрузка...' : 'Обновить'}
            icon="pi pi-refresh"
            severity="secondary"
            disabled={loading}
            onClick={load}
          />
          <Tag value={isTransfer ? 'TRANSFER' : 'DELIVERY'} severity={isTransfer ? 'info' : 'success'} />
          <Tag value={`ObjType: ${headerInfo?.ObjType ?? objType}`} severity="secondary" />
          <Tag value={`DocEntry: ${headerInfo?.DocEntry ?? docEntry || '-'}`} />
          <Tag value={`DocNum: ${headerInfo?.DocNum ?? docNum || '-'}`} />
        </div>

        <Card
          className="shadow-2 border-round-xl"
          title={
            <div className="flex flex-column gap-1">
              <div className="flex align-items-center gap-2 flex-wrap">
                <span className="text-xl font-semibold">
                  {isTransfer ? 'Документ перемещения' : 'Документ доставки'} № {headerInfo?.DocNum ?? docNum || '-'}
                </span>
              </div>
              <div className="text-600">
                {isTransfer
                  ? `${headerInfo?.ToWhsCode || '-'} • ${headerInfo?.ToWhsName || '-'}`
                  : `${headerInfo?.CardCode || '-'} • ${headerInfo?.CardName || '-'}`}
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
              <div className="text-600 text-sm">Статус / зона</div>
              <div className="font-semibold">{headerInfo?.U_State || '-'}</div>
              <div className="text-500 text-sm">{headerInfo?.U_WorkAreaName || ''}</div>
            </div>
          </div>

          <div className="mt-2 text-600 text-sm">
            Создано: {fmtDateTime(headerInfo?.CreateDate)} {headerInfo?.DocTime ? `(${String(headerInfo.DocTime)})` : ''}
          </div>
          {headerInfo?.Comments ? <div className="mt-2">Комментарий: {headerInfo.Comments}</div> : null}

          <Divider className="my-3" />

          <div className="flex align-items-center justify-content-between flex-wrap gap-2">
            <div className="flex align-items-center gap-2 flex-wrap">
              <Tag value={`Строк: ${totals.lines}`} />
              <Tag value={`Qty: ${fmtNum(totals.qty, 2)}`} severity="info" />
              <Tag value={`OpenQty: ${fmtNum(totals.openQty, 2)}`} severity="warning" />
              <Tag value={`Volume: ${fmtNum(totals.volume, 3)}`} severity="success" />
              <Tag value={`Weight: ${fmtNum(totals.weight, 3)}`} severity="secondary" />
            </div>

            <span className="p-input-icon-left">
              <i className="pi pi-search" />
              <InputText
                value={globalFilterValue}
                onChange={(e) => onGlobalFilterChange(e.target.value)}
                placeholder="Поиск: код / товар / склад..."
                style={{ width: 360 }}
              />
            </span>
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
              emptyMessage="Нет данных"
              scrollable
              scrollHeight="560px"
              filters={filters}
              onFilter={(e) => setFilters(e.filters)}
              globalFilterFields={['ItemCode', 'ItemName', 'WhsCode', 'WhsName', 'ToWhsCode', 'ToWhsName']}
            >
              <Column header="#" style={{ width: 70 }} body={(r: DetailRowT) => (r.LineNum != null ? r.LineNum : '-')} />
              <Column field="ItemCode" header="Код" sortable style={{ minWidth: 140 }} />
              <Column field="ItemName" header="Товар" sortable style={{ minWidth: 320 }} />
              <Column
                header="Склад"
                sortable
                style={{ minWidth: 220 }}
                body={(r: DetailRowT) => (
                  <div className="flex flex-column">
                    <span className="font-medium">{r.WhsName || r.WhsCode || '-'}</span>
                    <span className="text-500 text-sm">{r.WhsCode || '-'}</span>
                  </div>
                )}
              />
              <Column
                header="Куда"
                sortable
                style={{ minWidth: 220 }}
                body={(r: DetailRowT) =>
                  r.ToWhsCode || r.ToWhsName ? (
                    <div className="flex flex-column">
                      <span className="font-medium">{r.ToWhsName || r.ToWhsCode}</span>
                      <span className="text-500 text-sm">{r.ToWhsCode}</span>
                    </div>
                  ) : (
                    <span className="text-500">-</span>
                  )
                }
              />
              <Column
                header="Qty"
                sortable
                style={{ minWidth: 120, textAlign: 'right' }}
                body={(r: DetailRowT) => <span className="font-semibold">{fmtNum(r.Quantity, 2)}</span>}
              />
              <Column
                header="OpenQty"
                sortable
                style={{ minWidth: 120, textAlign: 'right' }}
                body={(r: DetailRowT) => <span className="font-semibold">{fmtNum(r.OpenQty, 2)}</span>}
              />
              <Column
                header="На складе"
                sortable
                style={{ minWidth: 120, textAlign: 'right' }}
                body={(r: DetailRowT) => <span className="font-semibold">{fmtNum(r.OnHand, 2)}</span>}
              />
              <Column
                header="Всего на складе"
                sortable
                style={{ minWidth: 140, textAlign: 'right' }}
                body={(r: DetailRowT) => <span className="font-semibold">{fmtNum(r.OnHandAll, 2)}</span>}
              />
              <Column
                header="Volume"
                sortable
                style={{ minWidth: 110, textAlign: 'right' }}
                body={(r: DetailRowT) => fmtNum(r.LineVolume, 3)}
              />
              <Column
                header="Weight"
                sortable
                style={{ minWidth: 110, textAlign: 'right' }}
                body={(r: DetailRowT) => fmtNum(r.LineWeight, 3)}
              />
            </DataTable>
          </div>
        </Card>
      </div>
    </>
  );
}

