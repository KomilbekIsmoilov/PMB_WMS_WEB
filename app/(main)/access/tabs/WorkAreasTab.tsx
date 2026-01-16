// src/app/(main)/access/tabs/WorkAreasTab.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from 'primereact/card';
import { Toast } from 'primereact/toast';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { Dropdown } from 'primereact/dropdown';
import { MultiSelect } from 'primereact/multiselect';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Divider } from 'primereact/divider';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import api from '@/app/api/api';
import axios from 'axios';

type OptionT = { label: string; value: string };

type BranchT = { code: string; name: string };
type WhsT = { WhsCode: string; WhsName: string };
type EmpT = { EmpID: string; Name: string };

type CollectorRowT = { id: string; empId: string | null };

type WorkAreaDocT = {
  DocEntry: number;
  U_Name: string;
  U_Remark?: string | null;
  U_Branch?: string | null;
  U_ControllerEmpID?: string | null;
  Warehouses?: string[];
  Collectors?: string[];
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || ''; 

const uid = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`;

export default function WorkAreasTab() {
  const toast = useRef<Toast>(null);

  // Search/load
  const [searchDocEntry, setSearchDocEntry] = useState<number | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);

  // Form state
  const [docEntry, setDocEntry] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [remark, setRemark] = useState('');

  const [branch, setBranch] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [controllerEmpId, setControllerEmpId] = useState<string | null>(null);

  // collectors grid
  const [collectorRows, setCollectorRows] = useState<CollectorRowT[]>([]);

  // Dictionaries
  const [branches, setBranches] = useState<BranchT[]>([]);
  const [whsList, setWhsList] = useState<WhsT[]>([]);
  const [employees, setEmployees] = useState<EmpT[]>([]); // umumiy ro‘yxat (filialga qarab)
  const [loadingDict, setLoadingDict] = useState(false);

  const branchOptions: OptionT[] = useMemo(
    () => branches.map(b => ({ label: `${b.code} - ${b.name}`, value: b.code })),
    [branches]
  );

  const whsOptions: OptionT[] = useMemo(
    () => whsList.map(w => ({ label: `${w.WhsCode} - ${w.WhsName}`, value: w.WhsCode })),
    [whsList]
  );

  const employeeOptions: OptionT[] = useMemo(
    () => employees.map(e => ({ label: `${e.EmpID} - ${e.Name}`, value: e.EmpID })),
    [employees]
  );

  const usedCollectorIds = useMemo(() => {
    return new Set(collectorRows.map(r => r.empId).filter(Boolean) as string[]);
  }, [collectorRows]);


  const apiGet = async <T,>(url: string, params?: any) => {
    const res = await axios.get<T>(`${API_BASE}${url}`, { params });
    return res.data;
  };

  const apiPost = async <T,>(url: string, body: any) => {
    const res = await axios.post<T>(`${API_BASE}${url}`, body);
    return res.data;
  };

  const apiPut = async <T,>(url: string, body: any) => {
    const res = await axios.put<T>(`${API_BASE}${url}`, body);
    return res.data;
  };


  useEffect(() => {
    const load = async () => {
      try {
        setLoadingDict(true);

        // 1) Filiallar
        // GET /api/dict/branches -> [{code,name}]
        const br  = await api.get('/api/dict/branches');
        setBranches(br  || []);

      } catch (e) {
        toast.current?.show({ severity: 'error', summary: 'Ошибка', detail: 'Справочники не загрузились', life: 3000 });
      } finally {
        setLoadingDict(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Branch o'zgarsa: warehouses + employees qayta yuklash
  useEffect(() => {
    const loadByBranch = async () => {
      try {
        if (!branch) {
          setWhsList([]);
          setEmployees([]);
          setWarehouses([]);
          setControllerEmpId(null);
          setCollectorRows([]);
          return;
        }

        // 2) Skaldlar
        // GET /api/dict/warehouses?branch=TSH
        const whs = await api.get<WhsT[]>('/api/dict/warehouses', { branch });
        setWhsList(whs || []);

        // 3) Hodimlar (контролёр + сборщики shu ro‘yxatdan)
        // GET /api/dict/employees?branch=TSH
        const emps = await api.get<EmpT[]>('/api/dict/employees', { branch });
        setEmployees(emps || []);
      } catch (e) {
        toast.current?.show({ severity: 'warn', summary: 'Внимание', detail: 'Не удалось загрузить данные по филиалу', life: 3000 });
      }
    };
    loadByBranch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch]);

  // ---------------------------
  // Reset form
  // ---------------------------
  const resetForm = () => {
    setDocEntry(null);
    setName('');
    setRemark('');
    setBranch(null);
    setWarehouses([]);
    setControllerEmpId(null);
    setCollectorRows([]);
    setSearchDocEntry(null);
  };

  const askReset = () => {
    confirmDialog({
      message: 'Сбросить форму?',
      header: 'Подтверждение',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Да',
      rejectLabel: 'Нет',
      accept: resetForm,
    });
  };

  // ---------------------------
  // Collectors table logic
  // ---------------------------
  const addCollectorRow = () => {
    setCollectorRows(prev => [...prev, { id: uid(), empId: null }]);
  };

  const removeCollectorRow = (rowId: string) => {
    setCollectorRows(prev => prev.filter(r => r.id !== rowId));
  };

  const setCollectorEmp = (rowId: string, empId: string | null) => {
    // duplicate protection
    if (empId && usedCollectorIds.has(empId)) {
      toast.current?.show({ severity: 'warn', summary: 'Дубликат', detail: 'Этот сборщик уже добавлен', life: 2500 });
      return;
    }
    setCollectorRows(prev => prev.map(r => (r.id === rowId ? { ...r, empId } : r)));
  };

  const collectorsPayload = useMemo(() => {
    return collectorRows.map(r => r.empId).filter(Boolean) as string[];
  }, [collectorRows]);

  // ---------------------------
  // Load document for update
  // ---------------------------
  const loadDoc = async () => {
    if (!searchDocEntry) {
      toast.current?.show({ severity: 'info', summary: 'DocEntry', detail: 'Введите DocEntry', life: 2500 });
      return;
    }

    try {
      setLoadingDoc(true);

      // GET /api/work-areas/:docEntry
      const doc = await apiGet<WorkAreaDocT>(`/api/work-areas/${searchDocEntry}`);

      setDocEntry(doc?.DocEntry ?? searchDocEntry);
      setName(doc?.U_Name ?? '');
      setRemark(doc?.U_Remark ?? '');
      setBranch(doc?.U_Branch ?? null);
      setControllerEmpId(doc?.U_ControllerEmpID ?? null);
      setWarehouses(doc?.Warehouses ?? []);

      const cols = (doc?.Collectors ?? []).map((empId) => ({ id: uid(), empId }));
      setCollectorRows(cols);

      toast.current?.show({ severity: 'success', summary: 'Загружено', detail: `DocEntry ${searchDocEntry}`, life: 2000 });
    } catch (e) {
      toast.current?.show({ severity: 'error', summary: 'Ошибка', detail: 'Документ не найден или ошибка API', life: 3000 });
    } finally {
      setLoadingDoc(false);
    }
  };

  // ---------------------------
  // Save (create / update)
  // ---------------------------
  const save = async () => {
    // validation
    if (!name.trim()) {
      toast.current?.show({ severity: 'warn', summary: 'Проверка', detail: 'Введите название рабочей зоны', life: 2500 });
      return;
    }
    if (!branch) {
      toast.current?.show({ severity: 'warn', summary: 'Проверка', detail: 'Выберите филиал', life: 2500 });
      return;
    }
    if (!warehouses.length) {
      toast.current?.show({ severity: 'warn', summary: 'Проверка', detail: 'Выберите склады', life: 2500 });
      return;
    }
    if (!controllerEmpId) {
      toast.current?.show({ severity: 'warn', summary: 'Проверка', detail: 'Выберите контролёра', life: 2500 });
      return;
    }

    const payload = {
      U_Name: name.trim(),
      U_Remark: remark?.trim() || '',
      U_Branch: branch,
      U_ControllerEmpID: controllerEmpId,
      Warehouses: warehouses,
      Collectors: collectorsPayload,
    };

    try {
      if (docEntry) {

        await api.put(`/api/work-areas/${docEntry}`, payload);
        toast.current?.show({ severity: 'success', summary: 'Обновлено', detail: `DocEntry ${docEntry}`, life: 2500 });
      } else {

        const created = await api.post<{ DocEntry: number }>('/api/work-areas', payload);
        const newDocEntry = created?.DocEntry;
        if (newDocEntry) setDocEntry(newDocEntry);
        toast.current?.show({ severity: 'success', summary: 'Создано', detail: `DocEntry ${newDocEntry || ''}`, life: 2500 });
      }
    } catch (e) {
      toast.current?.show({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось сохранить (API)', life: 3500 });
    }
  };

  // ---------------------------
  // Render helpers
  // ---------------------------
  const collectorsCell = (row: CollectorRowT) => {
    return (
      <Dropdown
        value={row.empId}
        options={employeeOptions}
        onChange={(e) => setCollectorEmp(row.id, e.value)}
        placeholder="Выберите сборщика"
        filter
        showClear
        style={{ width: '100%' }}
      />
    );
  };

  const actionsCell = (row: CollectorRowT) => {
    return (
      <Button
        icon="pi pi-trash"
        severity="danger"
        text
        onClick={() => removeCollectorRow(row.id)}
        tooltip="Удалить"
      />
    );
  };

  return (
    <>
      <Toast ref={toast} />
      <ConfirmDialog />

      <Card>
        {/* Top: load by DocEntry */}
        <div className="grid">
          <div className="col-12 md:col-3">
            <label className="block mb-2">DocEntry (загрузить)</label>
            <InputNumber
              value={searchDocEntry}
              onValueChange={(e) => setSearchDocEntry(e.value ?? null)}
              placeholder="Введите DocEntry"
              className="w-full"
              useGrouping={false}
            />
          </div>
          <div className="col-12 md:col-3 flex align-items-end gap-2">
            <Button
              label={loadingDoc ? 'Загрузка...' : 'Загрузить'}
              icon="pi pi-download"
              onClick={loadDoc}
              disabled={loadingDoc}
            />
            <Button label="Сброс" icon="pi pi-refresh" severity="secondary" onClick={askReset} />
          </div>
          <div className="col-12 md:col-6 flex align-items-end justify-content-end">
            <div className="text-600">
              {docEntry ? <>Режим: <b>Редактирование</b> (DocEntry {docEntry})</> : <>Режим: <b>Создание</b></>}
            </div>
          </div>
        </div>

        <Divider />

        {/* Header form like SAP screenshot */}
        <div className="grid">
          <div className="col-12 md:col-3">
            <label className="block mb-2">DocEntry</label>
            <InputNumber value={docEntry} className="w-full" disabled useGrouping={false} />
          </div>

          <div className="col-12 md:col-6">
            <label className="block mb-2">Название рабочей зоны</label>
            <InputText value={name} onChange={(e) => setName(e.target.value)} className="w-full" placeholder="Например: Зона A" />
          </div>

          <div className="col-12 md:col-3">
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

          <div className="col-12 md:col-6">
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

          <div className="col-12 md:col-3">
            <label className="block mb-2">Контролёр</label>
            <Dropdown
              value={controllerEmpId}
              options={employeeOptions}
              onChange={(e) => setControllerEmpId(e.value)}
              placeholder={!branch ? 'Сначала выберите филиал' : 'Выберите контролёра'}
              filter
              showClear
              className="w-full"
              disabled={!branch}
            />
          </div>

          <div className="col-12 md:col-3">
            <label className="block mb-2">Remark</label>
            <InputText value={remark} onChange={(e) => setRemark(e.target.value)} className="w-full" placeholder="Комментарий" />
          </div>
        </div>

        <Divider />

        {/* Collectors grid */}
        <div className="flex align-items-center justify-content-between mb-2">
          <div className="text-900 font-medium">Сборщики (работают в этой зоне)</div>
          <Button label="Добавить строку" icon="pi pi-plus" onClick={addCollectorRow} />
        </div>

        <DataTable value={collectorRows} dataKey="id" emptyMessage="Нет сборщиков">
          <Column header="#" body={(_, opt) => (opt.rowIndex ?? 0) + 1} style={{ width: 60 }} />
          <Column header="Сборщики ID" body={collectorsCell} />
          <Column header="" body={actionsCell} style={{ width: 70 }} />
        </DataTable>

        <Divider />

        <div className="flex gap-2">
          <Button label={docEntry ? 'Сохранить изменения' : 'Создать'} icon="pi pi-check" onClick={save} />
          <Button label="Отменить" icon="pi pi-times" severity="secondary" onClick={askReset} />
        </div>
      </Card>
    </>
  );
}
