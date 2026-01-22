// src/app/(main)/access/tabs/WorkAreasTab.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from 'primereact/card';
import { Toast } from 'primereact/toast';
import { InputText } from 'primereact/inputtext';
import { Dropdown } from 'primereact/dropdown';
import { MultiSelect } from 'primereact/multiselect';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Divider } from 'primereact/divider';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import api from '@/app/api/api';

type OptionT = { label: string; value: string };

type BranchApiT = { BPLId: number; BPLName: string };
type WhsApiT = { WhsCode: string; WhsName: string; BPLid: number; BinActivat: 'Y' | 'N' };
type UserApiT = {
  empID: number;
  lastName: string;
  firstName: string;
  dept?: number | string | null; 
  U_LOGIN?: string | null;
};

type WorkAreaHeaderApiT = {
  DocEntry: number;
  DocNum: number;
  Remark?: string | null;
  U_Filial?: string | number | null;
  U_Checker?: string | null;
  U_WhsCodes?: string | null;
};

type WorkAreaRowApiT = {
  U_UserCode: string;
  DocEntry: number;
};

type CollectorRowT = { id: string; userCode: string | null };

const uid = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`;

const unwrap = <T,>(res: any): T => {
  if (res && typeof res === 'object' && 'data' in res) return res.data as T;
  return res as T;
};

const safeStr = (v: any) => (v === null || v === undefined ? '' : String(v));

const parseWhsCodes = (raw?: string | null): string[] => {
  const s = (raw || '').trim();
  if (!s) return [];

  if (s.startsWith('[') && s.endsWith(']')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map((x) => String(x).trim()).filter(Boolean);
    } catch {}
  }

  return s
    .split(/[,\|;]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
};

const getUserCode = (u: UserApiT) => {
  return u.U_LOGIN && u.U_LOGIN.trim() ? u.U_LOGIN.trim() : String(u.empID);
};

const getDept = (u: UserApiT) => {
  const n = Number(u.dept);
  return Number.isFinite(n) ? n : 0;
};

export default function WorkAreasTab() {
  const toast = useRef<Toast>(null);

  const [loadingSave, setLoadingSave] = useState(false);
  const [loadingDict, setLoadingDict] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);

  const [branches, setBranches] = useState<BranchApiT[]>([]);
  const [allWhs, setAllWhs] = useState<WhsApiT[]>([]);
  const [users, setUsers] = useState<UserApiT[]>([]);

  const [workAreas, setWorkAreas] = useState<WorkAreaHeaderApiT[]>([]);
  const [selectedWorkArea, setSelectedWorkArea] = useState<number | null>(null);

  const [docEntry, setDocEntry] = useState<number | null>(null);
  const [docNum, setDocNum] = useState<number | null>(null);

  const [remark, setRemark] = useState('');
  const [branch, setBranch] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [checker, setChecker] = useState<string | null>(null);

  const [collectorRows, setCollectorRows] = useState<CollectorRowT[]>([]);

  const isEditMode = !!docEntry;

  const branchOptions: OptionT[] = useMemo(
    () => branches.map((b) => ({ label: `${b.BPLId} - ${b.BPLName}`, value: String(b.BPLId) })),
    [branches]
  );

  const filteredWhs = useMemo(() => {
    if (!branch) return [];
    return allWhs.filter((w) => String(w.BPLid) === String(branch));
  }, [allWhs, branch]);

  const whsOptions: OptionT[] = useMemo(() => {
    const base = filteredWhs.map((w) => ({ label: `${w.WhsCode} - ${w.WhsName}`, value: w.WhsCode }));
    const exists = new Set(base.map((x) => x.value));
    const missing = warehouses
      .filter((code) => !exists.has(code))
      .map((code) => ({ label: code, value: code }));
    return [...base, ...missing];
  }, [filteredWhs, warehouses]);

  const controllerOptions: OptionT[] = useMemo(() => {
    return users
      .filter((u) => getDept(u) === 1)
      .map((u) => {
        const code = getUserCode(u);
        const fullName = `${u.lastName || ''} ${u.firstName || ''}`.trim();
        return { label: `${code} - ${fullName || 'Без имени'}`, value: code };
      });
  }, [users]);

  const collectorOptions: OptionT[] = useMemo(() => {
    return users
      .filter((u) => getDept(u) === 2)
      .map((u) => {
        const code = getUserCode(u);
        const fullName = `${u.lastName || ''} ${u.firstName || ''}`.trim();
        return { label: `${code} - ${fullName || 'Без имени'}`, value: code };
      });
  }, [users]);

  const collectorsPayload = useMemo(() => {
    return collectorRows
      .map((r) => (r.userCode ? String(r.userCode).trim() : ''))
      .filter(Boolean);
  }, [collectorRows]);

  const usedCollectorCodes = useMemo(() => {
    return new Set(collectorRows.map((r) => r.userCode).filter(Boolean) as string[]);
  }, [collectorRows]);

  const optionsForCollectorRow = (row: CollectorRowT) => {
    return collectorOptions.filter((o) => !usedCollectorCodes.has(o.value) || o.value === row.userCode);
  };

  const workAreaOptions: { label: string; value: number }[] = useMemo(() => {
    return (workAreas || []).map((w) => ({
      value: w.DocEntry,
      label: `${w.DocNum} - ${w.Remark || 'Без комментария'}`,
    }));
  }, [workAreas]);

  const loadDictionariesAndWorkAreas = async () => {
    try {
      setLoadingDict(true);

      const [br, whs, us, wa] = await Promise.all([
        api.get('/getBranchsApi'),
        api.get('/getWhsCodesApi'),
        api.get('/getUsersAllApi'),
        api.get('/getWorksAreaHeaderApi'),
      ]);

      setBranches(unwrap<BranchApiT[]>(br) || []);
      setAllWhs(unwrap<WhsApiT[]>(whs) || []);
      setUsers(unwrap<UserApiT[]>(us) || []);
      setWorkAreas(unwrap<WorkAreaHeaderApiT[]>(wa) || []);
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: e?.response?.data?.message || 'Не удалось загрузить справочники/рабочие зоны',
        life: 3500,
      });
    } finally {
      setLoadingDict(false);
    }
  };

  const loadWorkAreaRows = async (de: number) => {
    try {
      setLoadingRows(true);

      const res = await api.get('/getWorksAreaRowsApi', { params: { docEntry: de } });
      const rows = unwrap<WorkAreaRowApiT[]>(res) || [];

      const collectors = rows.map((r) => safeStr(r.U_UserCode).trim()).filter(Boolean);
      setCollectorRows(collectors.map((code) => ({ id: uid(), userCode: code })));
    } catch (e: any) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Внимание',
        detail: e?.response?.data?.message || 'Не удалось загрузить строки сборщиков',
        life: 3000,
      });
      setCollectorRows([]);
    } finally {
      setLoadingRows(false);
    }
  };

  useEffect(() => {
    loadDictionariesAndWorkAreas();
  }, []);

  // ===== MODE: CREATE NEW =====
  const startCreateNew = () => {
    // agar xohlasang confirm ham qo‘shamiz, hozir sodda
    setSelectedWorkArea(null);
    setDocEntry(null);
    setDocNum(null);
    setRemark('');
    setBranch(null);
    setWarehouses([]);
    setChecker(null);
    setCollectorRows([]);
    toast.current?.show({ severity: 'info', summary: 'Режим', detail: 'Создание новой рабочей зоны', life: 2000 });
  };

  // ===== APPLY EXISTING =====
  const applyHeaderToForm = async (header: WorkAreaHeaderApiT) => {
    const de = header.DocEntry;

    setDocEntry(de);
    setDocNum(header.DocNum ?? null);
    setRemark(header.Remark || '');

    const filial = header.U_Filial;
    setBranch(filial === null || filial === undefined || filial === '' ? null : String(filial));

    setChecker(header.U_Checker ? String(header.U_Checker) : null);
    setWarehouses(parseWhsCodes(header.U_WhsCodes));

    await loadWorkAreaRows(de);
  };

  const onWorkAreaChange = async (docEntryValue: number | null) => {
    setSelectedWorkArea(docEntryValue);

    if (!docEntryValue) {
      startCreateNew();
      return;
    }

    const header = workAreas.find((w) => Number(w.DocEntry) === Number(docEntryValue));
    if (!header) {
      toast.current?.show({ severity: 'warn', summary: 'Не найдено', detail: 'WorkArea не найден в списке', life: 2500 });
      startCreateNew();
      return;
    }

    await applyHeaderToForm(header);
  };

  // ===== RESET =====
  const askReset = () => {
    confirmDialog({
      message: 'Сбросить форму?',
      header: 'Подтверждение',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Да',
      rejectLabel: 'Нет',
      accept: startCreateNew,
    });
  };

  useEffect(() => {
    if (!branch) {
      setWarehouses([]);
      return;
    }
    const allowed = new Set(filteredWhs.map((w) => w.WhsCode));
    setWarehouses((prev) => prev.filter((code) => allowed.has(code)));
  }, [branch]); 

  const addCollectorRow = () => setCollectorRows((prev) => [...prev, { id: uid(), userCode: null }]);
  const removeCollectorRow = (rowId: string) => setCollectorRows((prev) => prev.filter((r) => r.id !== rowId));

  const setCollectorUser = (rowId: string, code: string | null) => {
    if (code) {
      const dup = collectorRows.some((r) => r.id !== rowId && r.userCode === code);
      if (dup) {
        toast.current?.show({ severity: 'warn', summary: 'Дубликат', detail: 'Этот сборщик уже добавлен', life: 2500 });
        return;
      }
    }
    setCollectorRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, userCode: code } : r)));
  };

  const collectorsCell = (row: CollectorRowT) => (
    <Dropdown
      value={row.userCode}
      options={optionsForCollectorRow(row)}
      onChange={(e) => setCollectorUser(row.id, e.value)}
      placeholder="Выберите сборщика"
      filter
      showClear
      style={{ width: '100%' }}
      disabled={!branch}
    />
  );

  const actionsCell = (row: CollectorRowT) => (
    <Button icon="pi pi-trash" severity="danger" text onClick={() => removeCollectorRow(row.id)} tooltip="Удалить" />
  );

  const saveDraft = async  () => {
    try {
      
    
    if (!remark || !remark.trim()) {
  toast.current?.show({ severity: 'warn', summary: 'Проверка', detail: 'Комментарий (Remark) обязателен', life: 2500 });
  return;
}

    if (!branch) {
      toast.current?.show({ severity: 'warn', summary: 'Проверка', detail: 'Выберите филиал', life: 2500 });
      return;
    }
    if (!checker) {
      toast.current?.show({ severity: 'warn', summary: 'Проверка', detail: 'Выберите контролёра', life: 2500 });
      return;
    }
    if (!warehouses.length) {
      toast.current?.show({ severity: 'warn', summary: 'Проверка', detail: 'Выберите склады', life: 2500 });
      return;
    }

    setLoadingSave(true);

    const payloadBase = {
      Remark: remark?.trim() || '',
      U_Filial: branch,             
      U_Checker: checker,           
      U_WhsCodes: warehouses,       
      Collectors: collectorsPayload, 
    };

    if (docEntry) {
      // UPDATE
      const payload = {
        action: 'update',
        DocEntry: docEntry,
        DocNum: docNum,
        ...payloadBase,
      };
       await api.post('patchWorksAreaApi' , payload )
      
      toast.current?.show({ severity: 'success', summary: 'Обновление', detail: 'Payload выведен в console.log', life: 2500 });
    } else {
      const payload = {
        action: 'create',
        ...payloadBase,
      };
       await api.post('postWorksAreaApi' , payload )
      toast.current?.show({ severity: 'success', summary: 'Создание', detail: 'Payload выведен в console.log', life: 2500 });
    }

    
    } catch (error) {
      console.log(error)
    } finally {
      setLoadingSave(false);

    }
  };

  const deleteWorkArea = async () => {
  if (!docEntry) return;

  confirmDialog({
    header: 'Удалить?',
    icon: 'pi pi-exclamation-triangle',
    message: `Удалить рабочую зону (DocEntry: ${docEntry})?`,
    acceptLabel: 'Да, удалить',
    rejectLabel: 'Отмена',
    accept: async () => {
      try {
        setLoadingSave(true);

        await api.post('DeleteWorksAreaApi', { DocEntry: docEntry, DocNum: docNum });

        toast.current?.show({ severity: 'success', summary: 'Удалено', detail: 'Рабочая зона удалена', life: 2500 });

        await loadDictionariesAndWorkAreas();
        startCreateNew();
      } catch (error: any) {
        console.log(error);
        toast.current?.show({
          severity: 'error',
          summary: 'Ошибка',
          detail: error?.response?.data?.message || 'Не удалось удалить',
          life: 3500,
        });
      } finally {
        setLoadingSave(false);
      }
    },
  });
};


  return (
    <>
      <Toast ref={toast} />
      <ConfirmDialog />

      <Card>
        {/* TOP */}
        <div className="grid">
          <div className="col-12 md:col-7">
            <label className="block mb-2">Рабочая зона</label>
            <Dropdown
              value={selectedWorkArea}
              options={workAreaOptions}
              optionLabel="label"
              optionValue="value"
              onChange={(e) => onWorkAreaChange(e.value ?? null)}
              placeholder={loadingDict ? 'Загрузка...' : 'Выберите рабочую зону'}
              filter
              showClear
              className="w-full"
            />
            <small className="text-600">
              Режим: <b>{isEditMode ? 'Редактирование' : 'Создание'}</b>
              {isEditMode ? ' (загружена существующая зона)' : ' (новая зона)'}
            </small>
          </div>

          <div className="col-12 md:col-5 flex align-items-end justify-content-end gap-2">
            <Button
              label="Новая рабочая зона"
              icon="pi pi-plus"
              onClick={startCreateNew}
              severity="success"
              outlined
            />
            <Button
              label={loadingDict ? 'Обновление...' : 'Обновить'}
              icon="pi pi-refresh"
              severity="secondary"
              onClick={loadDictionariesAndWorkAreas}
              disabled={loadingDict}
            />
            <Button label="Сброс" icon="pi pi-times" severity="secondary" onClick={askReset} />
            {isEditMode && (
            <Button
              label="Удалить"
              icon="pi pi-trash"
              severity="danger"
              outlined
              onClick={deleteWorkArea}
              disabled={loadingSave}
            />
          )}
          </div>
        </div>

        <Divider />

        {/* FORM */}
        <div className="grid">
          <div className="col-12 md:col-4">
            <label className="block mb-2">Филиал</label>
            <Dropdown
              value={branch}
              options={branchOptions}
              onChange={(e) => setBranch(e.value)}
              placeholder={loadingDict ? 'Загрузка...' : 'Выберите филиал'}
              filter
              showClear
              className="w-full"
            />
          </div>

          <div className="col-12 md:col-4">
            <label className="block mb-2">Контролёр</label>
            <Dropdown
              value={checker}
              options={controllerOptions}
              onChange={(e) => setChecker(e.value)}
              placeholder={!branch ? 'Сначала выберите филиал' : 'Выберите контролёра'}
              filter
              showClear
              className="w-full"
              disabled={!branch}
            />
          </div>

          <div className="col-12 md:col-4">
            <label className="block mb-2">Комментарий</label>
            <InputText value={remark} onChange={(e) => setRemark(e.target.value)} className="w-full" placeholder="Комментарий" />
          </div>

          <div className="col-12">
            <label className="block mb-2">Склады</label>
            <MultiSelect
              value={warehouses}
              options={whsOptions}
              onChange={(e) => setWarehouses(e.value || [])}
              placeholder={!branch ? 'Сначала выберите филиал' : 'Выберите склады'}
              filter
              className="w-full"
              display="chip"
              disabled={!branch}
            />
          </div>
        </div>

        <Divider />

        {/* COLLECTORS */}
        <div className="flex align-items-center justify-content-between mb-2">
          <div className="text-900 font-medium">
            Сборщики{' '}
            {loadingRows ? <span className="text-600"> — загрузка...</span> : null}
          </div>

          <Button label="Добавить строку" icon="pi pi-plus" onClick={addCollectorRow} />
        </div>

        <DataTable value={collectorRows} dataKey="id" emptyMessage="Нет сборщиков">
          <Column header="#" body={(_, opt) => (opt.rowIndex ?? 0) + 1} style={{ width: 60 }} />
          <Column header="Сборщик" body={collectorsCell} />
          <Column header="" body={actionsCell} style={{ width: 70 }} />
        </DataTable>

        <Divider />

        <div className="flex gap-2">
          <Button
            label={isEditMode ? 'Сохранить изменения' : 'Создать'}
            icon="pi pi-check"
            disabled={loadingSave}
            loading={loadingSave}
            onClick={saveDraft}
          />
          <Button label="Отменить" icon="pi pi-times" severity="secondary" onClick={askReset} />
        </div>
      </Card>
    </>
  );
}
