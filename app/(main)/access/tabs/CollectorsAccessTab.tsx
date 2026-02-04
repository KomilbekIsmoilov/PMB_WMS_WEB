'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Toast } from 'primereact/toast';
import { DataTable, DataTableFilterMeta } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { Checkbox } from 'primereact/checkbox';
import { Tag } from 'primereact/tag';
import { FilterMatchMode } from 'primereact/api';
import api from '@/app/api/api';
import { isActiveFlag, safeStr, toActiveFlag, unwrap } from '../utils';

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

type CollectorFormT = {
  empID: number | null;
  lastName: string;
  firstName: string;
  login: string;
  password: string;
  active: boolean;
};

const DEPT = 2;

const emptyForm: CollectorFormT = {
  empID: null,
  lastName: '',
  firstName: '',
  login: '',
  password: '',
  active: true,
};

const fullName = (u: UserWebApiT) => {
  const name = `${safeStr(u.lastName)} ${safeStr(u.firstName)}`.trim();
  return name || 'Без имени';
};

export default function CollectorsAccessTab() {
  const toast = useRef<Toast>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<UserWebApiT[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [isNew, setIsNew] = useState(true);
  const [form, setForm] = useState<CollectorFormT>(emptyForm);

  const [globalFilterValue, setGlobalFilterValue] = useState('');
  const [filters, setFilters] = useState<DataTableFilterMeta>({
    global: { value: null, matchMode: FilterMatchMode.CONTAINS },
  });

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get('/getUsersWebApi', { params: { dept: DEPT } });
      setRows(unwrap<UserWebApiT[]>(res) || []);
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: e?.response?.data?.message || 'Не удалось загрузить пользователей',
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

  const openCreate = () => {
    setIsNew(true);
    setForm({ ...emptyForm, active: true });
    setDialogOpen(true);
  };

  const openEdit = (row: UserWebApiT) => {
    setIsNew(false);
    setForm({
      empID: row.empID ?? null,
      lastName: safeStr(row.lastName),
      firstName: safeStr(row.firstName),
      login: safeStr(row.U_LOGIN),
      password: safeStr(row.U_Password),
      active: isActiveFlag(row.Active),
    });
    setDialogOpen(true);
  };

  const validateForm = () => {
    if (!form.lastName.trim()) {
      toast.current?.show({ severity: 'warn', summary: 'Проверка', detail: 'Фамилия обязательна', life: 2500 });
      return false;
    }
    if (!form.firstName.trim()) {
      toast.current?.show({ severity: 'warn', summary: 'Проверка', detail: 'Имя обязательно', life: 2500 });
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

    const payloadBase = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      U_LOGIN: form.login.trim(),
      U_Password: form.password,
      Active: toActiveFlag(form.active),
      dept: DEPT,
    };

    try {
      setSaving(true);
      if (isNew) {
        await api.post('/postEmployeeAccessApi', payloadBase);
        toast.current?.show({ severity: 'success', summary: 'Готово', detail: 'Сборщик создан', life: 2500 });
      } else {
        await api.post('/patchEmployeeAccessApi', { empID: form.empID, ...payloadBase });
        toast.current?.show({ severity: 'success', summary: 'Готово', detail: 'Сборщик обновлён', life: 2500 });
      }
      setDialogOpen(false);
      await load();
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

  const activeBody = (row: UserWebApiT) => {
    const active = isActiveFlag(row.Active);
    return <Tag value={active ? 'Активен' : 'Неактивен'} severity={active ? 'success' : 'danger'} />;
  };

  const actionBody = (row: UserWebApiT) => (
    <Button icon="pi pi-pencil" text onClick={() => openEdit(row)} tooltip="Изменить" />
  );

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

      <div className="flex gap-2">
        <Button label="Добавить" icon="pi pi-plus" onClick={openCreate} />
        <Button label={loading ? 'Загрузка...' : 'Обновить'} icon="pi pi-refresh" severity="secondary" onClick={load} disabled={loading} />
      </div>
    </div>
  );

  const dialogFooter = (
    <div className="flex justify-content-end gap-2">
      <Button label="Отмена" icon="pi pi-times" severity="secondary" onClick={() => setDialogOpen(false)} />
      <Button label={saving ? 'Сохранение...' : 'Сохранить'} icon="pi pi-check" onClick={saveUser} disabled={saving} />
    </div>
  );

  return (
    <div className="flex flex-column gap-3">
      <Toast ref={toast} />

      <DataTable
        value={rows}
        loading={loading}
        dataKey="empID"
        paginator
        rows={20}
        rowsPerPageOptions={[20, 50, 100]}
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
        <Column field="U_SapPassword" header="Пароль" style={{ minWidth: 160 }} />
        <Column header="Активность" body={activeBody} style={{ width: 140 }} />
        <Column header="" body={actionBody} style={{ width: 70 }} />
      </DataTable>

      <Dialog
        visible={dialogOpen}
        onHide={() => setDialogOpen(false)}
        header={isNew ? 'Новый сборщик' : 'Редактирование сборщика'}
        style={{ width: '500px' }}
        footer={dialogFooter}
        modal
        className="p-fluid"
      >
        <div className="formgrid grid">
          <div className="field col-12 md:col-6">
            <label htmlFor="lastName">Фамилия</label>
            <InputText id="lastName" value={form.lastName} onChange={(e) => setForm((s) => ({ ...s, lastName: e.target.value }))} />
          </div>
          <div className="field col-12 md:col-6">
            <label htmlFor="firstName">Имя</label>
            <InputText id="firstName" value={form.firstName} onChange={(e) => setForm((s) => ({ ...s, firstName: e.target.value }))} />
          </div>
          <div className="field col-12 md:col-6">
            <label htmlFor="login">Логин</label>
            <InputText id="login" value={form.login} onChange={(e) => setForm((s) => ({ ...s, login: e.target.value }))} />
          </div>
          <div className="field col-12 md:col-6">
            <label htmlFor="password">Пароль</label>
            <InputText
              id="password"
              type="password"
              value={form.password}
              onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))}
            />
          </div>
        </div>

        <div className="field-checkbox mt-2">
          <Checkbox inputId="active" checked={form.active} onChange={(e) => setForm((s) => ({ ...s, active: e.checked ?? false }))} />
          <label htmlFor="active">Активен</label>
        </div>
      </Dialog>
    </div>
  );
}
