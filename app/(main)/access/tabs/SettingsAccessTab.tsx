'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Toast } from 'primereact/toast';
import { DataTable, DataTableFilterMeta } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { MultiSelect } from 'primereact/multiselect';
import { Checkbox } from 'primereact/checkbox';
import { Tag } from 'primereact/tag';
import { Divider } from 'primereact/divider';
import { FilterMatchMode } from 'primereact/api';
import api from '@/app/api/api';
import { isActiveFlag, joinCsv, parseCsv, safeStr, toActiveFlag, unwrap } from '../utils';

type OptionT = { label: string; value: string };

type BranchApiT = { BPLId: number; BPLName: string };
type WhsApiT = { WhsCode: string; WhsName: string; BPLid: number; BinActivat: 'Y' | 'N' };
type UserWebApiT = {
  empID: number;
  lastName: string;
  firstName: string;
  dept?: number | string | null;
  Name?: string | null;
  U_Password?: string | null;
  U_Branch?: string | null;
  U_WhsCodes?: string | null;
  U_LOGIN?: string | null;
  Active?: string | null;
};

type FormStateT = {
  empID: number | null;
  lastName: string;
  firstName: string;
  login: string;
  password: string;
  branches: string[];
  warehouses: string[];
  active: boolean;
};

const DEPT = 3;

const emptyForm: FormStateT = {
  empID: null,
  lastName: '',
  firstName: '',
  login: '',
  password: '',
  branches: [],
  warehouses: [],
  active: true,
};

const fullName = (u: UserWebApiT) => {
  const name = `${safeStr(u.lastName)} ${safeStr(u.firstName)}`.trim();
  return name || 'Без имени';
};

export default function SettingsAccessTab() {
  const toast = useRef<Toast>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [users, setUsers] = useState<UserWebApiT[]>([]);
  const [branches, setBranches] = useState<BranchApiT[]>([]);
  const [allWhs, setAllWhs] = useState<WhsApiT[]>([]);

  const [selectedUser, setSelectedUser] = useState<UserWebApiT | null>(null);
  const [form, setForm] = useState<FormStateT>(emptyForm);

  const [globalFilterValue, setGlobalFilterValue] = useState('');
  const [filters, setFilters] = useState<DataTableFilterMeta>({
    global: { value: null, matchMode: FilterMatchMode.CONTAINS },
  });

  const load = async (keepEmpId?: number | null) => {
    try {
      setLoading(true);
      const [br, whs, us] = await Promise.all([
        api.get('/getBranchsApi'),
        api.get('/getWhsCodesApi'),
        api.get('/getUsersWebApi', { params: { dept: DEPT } }),
      ]);

      const nextBranches = unwrap<BranchApiT[]>(br) || [];
      const nextWhs = unwrap<WhsApiT[]>(whs) || [];
      const nextUsers = unwrap<UserWebApiT[]>(us) || [];

      setBranches(nextBranches);
      setAllWhs(nextWhs);
      setUsers(nextUsers);

      if (keepEmpId) {
        const found = nextUsers.find((u) => Number(u.empID) === Number(keepEmpId)) || null;
        applyUserToForm(found);
      }
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: e?.response?.data?.message || 'Не удалось загрузить данные',
        life: 3500,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onGlobalFilterChange = (value: string) => {
    const next = { ...filters };
    (next['global'] as any).value = value;
    setFilters(next);
    setGlobalFilterValue(value);
  };

  const applyUserToForm = (user: UserWebApiT | null) => {
    setSelectedUser(user);
    if (!user) {
      setForm(emptyForm);
      return;
    }

    setForm({
      empID: user.empID ?? null,
      lastName: safeStr(user.lastName),
      firstName: safeStr(user.firstName),
      login: safeStr(user.U_LOGIN),
      password: safeStr(user.U_Password),
      branches: parseCsv(user.U_Branch),
      warehouses: parseCsv(user.U_WhsCodes),
      active: isActiveFlag(user.Active),
    });
  };

  const branchOptions: OptionT[] = useMemo(
    () => branches.map((b) => ({ label: `${b.BPLId} - ${b.BPLName}`, value: String(b.BPLId) })),
    [branches]
  );

  const filteredWhs = useMemo(() => {
    if (!form.branches.length) return allWhs;
    const allowed = new Set(form.branches.map((x) => String(x)));
    return allWhs.filter((w) => allowed.has(String(w.BPLid)));
  }, [allWhs, form.branches]);

  const whsOptions: OptionT[] = useMemo(() => {
    const base = filteredWhs.map((w) => ({ label: `${w.WhsCode} - ${w.WhsName}`, value: w.WhsCode }));
    const exists = new Set(base.map((x) => x.value));
    const missing = form.warehouses
      .filter((code) => !exists.has(code))
      .map((code) => ({ label: code, value: code }));
    return [...base, ...missing];
  }, [filteredWhs, form.warehouses]);

  const activeBody = (row: UserWebApiT) => {
    const active = isActiveFlag(row.Active);
    return <Tag value={active ? 'Активен' : 'Неактивен'} severity={active ? 'success' : 'danger'} />;
  };

  const validateForm = () => {
    if (!form.empID) {
      toast.current?.show({ severity: 'warn', summary: 'Проверка', detail: 'Выберите пользователя', life: 2500 });
      return false;
    }
    if (!form.login.trim()) {
      toast.current?.show({ severity: 'warn', summary: 'Проверка', detail: 'Логин обязателен', life: 2500 });
      return false;
    }
    if (!form.password.trim()) {
      toast.current?.show({ severity: 'warn', summary: 'Проверка', detail: 'Пароль обязателен', life: 2500 });
      return false;
    }
    return true;
  };

  const saveUser = async () => {
    if (!validateForm()) return;

    const payload = {
      empID: form.empID,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      U_LOGIN: form.login.trim(),
      U_Password: form.password,
      U_Branch: joinCsv(form.branches),
      U_WhsCodes: joinCsv(form.warehouses),
      Active: toActiveFlag(form.active),
      dept: DEPT,
    };

    try {
      setSaving(true);
      await api.post('/patchUsersWebApi', payload);
      toast.current?.show({ severity: 'success', summary: 'Готово', detail: 'Настройки сохранены', life: 2500 });
      await load(form.empID);
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: e?.response?.data?.message || 'Не удалось сохранить',
        life: 3500,
      });
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <div className="flex flex-wrap align-items-center justify-content-between gap-2">
      <span className="p-input-icon-left">
        <i className="pi pi-search" />
        <InputText
          value={globalFilterValue}
          onChange={(e) => onGlobalFilterChange(e.target.value)}
          placeholder="Поиск..."
          style={{ width: 280 }}
        />
      </span>

      <Button label={loading ? 'Загрузка...' : 'Обновить'} icon="pi pi-refresh" severity="secondary" onClick={() => load(form.empID)} disabled={loading} />
    </div>
  );

  return (
    <div className="flex flex-column gap-3">
      <Toast ref={toast} />

      <DataTable
        value={users}
        loading={loading}
        dataKey="empID"
        selectionMode="single"
        selection={selectedUser}
        onSelectionChange={(e) => applyUserToForm(e.value as UserWebApiT | null)}
        paginator
        rows={15}
        rowsPerPageOptions={[15, 30, 50]}
        filters={filters}
        onFilter={(e) => setFilters(e.filters)}
        globalFilterFields={['empID', 'lastName', 'firstName', 'U_SapLogin', 'U_SapPassword', 'Active']}
        header={header}
        emptyMessage="Нет данных"
        size="small"
        showGridlines
      >
        <Column field="empID" header="ID" style={{ width: 100 }} />
        <Column header="ФИО" body={(r) => fullName(r as UserWebApiT)} style={{ minWidth: 220 }} />
        <Column field="U_SapLogin" header="Логин" style={{ minWidth: 160 }} />
        <Column header="Активность" body={activeBody} style={{ width: 140 }} />
      </DataTable>

      <Divider />

      <div className="grid">
        <div className="col-12 md:col-4">
          <label className="block mb-2">Пользователь</label>
          <InputText
            value={
              form.empID
                ? `${form.empID} - ${`${form.lastName} ${form.firstName}`.trim() || 'Без имени'}`
                : ''
            }
            readOnly
            placeholder="Выберите пользователя в таблице"
          />
        </div>
        <div className="col-12 md:col-4">
          <label className="block mb-2">Логин</label>
          <InputText value={form.login} onChange={(e) => setForm((s) => ({ ...s, login: e.target.value }))} disabled={!form.empID} />
        </div>
        <div className="col-12 md:col-4">
          <label className="block mb-2">Пароль</label>
          <InputText
            type="password"
            value={form.password}
            onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))}
            disabled={!form.empID}
          />
        </div>

        <div className="col-12 md:col-6">
          <label className="block mb-2">Филиалы</label>
          <MultiSelect
            value={form.branches}
            options={branchOptions}
            onChange={(e) => setForm((s) => ({ ...s, branches: e.value || [] }))}
            placeholder="Выберите филиалы"
            display="chip"
            filter
            className="w-full"
            disabled={!form.empID}
          />
        </div>

        <div className="col-12 md:col-6">
          <label className="block mb-2">Склады</label>
          <MultiSelect
            value={form.warehouses}
            options={whsOptions}
            onChange={(e) => setForm((s) => ({ ...s, warehouses: e.value || [] }))}
            placeholder="Выберите склады"
            display="chip"
            filter
            className="w-full"
            disabled={!form.empID}
          />
        </div>

        <div className="col-12">
          <div className="field-checkbox mt-2">
            <Checkbox inputId="active" checked={form.active} onChange={(e) => setForm((s) => ({ ...s, active: e.checked ?? false }))} disabled={!form.empID} />
            <label htmlFor="active">Активен</label>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button label={saving ? 'Сохранение...' : 'Сохранить'} icon="pi pi-check" onClick={saveUser} disabled={!form.empID || saving} />
        <Button label="Сброс" icon="pi pi-times" severity="secondary" onClick={() => applyUserToForm(selectedUser)} disabled={!form.empID} />
      </div>
    </div>
  );
}
