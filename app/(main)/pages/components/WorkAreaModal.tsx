'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import api from '@/app/api/api';

export type WorkAreaOptionT = {
  label: string;
  value: number;
};

type WorkAreaHeaderApiT = {
  DocEntry: number;
  DocNum: number;
  Remark?: string | null;
};

type Props = {
  visible: boolean;
  onHide: () => void;
  DocType : 'SalesOrder' | 'PurchaseDoc'; 

  docNums: number[];
  onSubmit: (args: { workAreaDocEntry: number; docNums: number[] }) => Promise<void> | void;
};

export default function AssignWorkAreaModal({ visible, onHide, docNums, onSubmit }: Props) {
  const [saving, setSaving] = useState(false);
  const [loadingWA, setLoadingWA] = useState(false);

  const [workAreas, setWorkAreas] = useState<WorkAreaHeaderApiT[]>([]);
  const [selectedWA, setSelectedWA] = useState<number | null>(null);

  useEffect(() => {
    if (!visible) return;

    const loadWA = async () => {
      try {
        setLoadingWA(true);
        const res = await api.get('/getWorksAreaHeaderApi');
        setWorkAreas((res?.data ?? res) as WorkAreaHeaderApiT[]);
      } catch (e) {
        setWorkAreas([]);
      } finally {
        setLoadingWA(false);
      }
    };

    loadWA();
  }, [visible]);

  useEffect(() => {
    if (visible) return;
    setSelectedWA(null);
    setSaving(false);
    setLoadingWA(false);
    setWorkAreas([]);
  }, [visible]);

  const workAreaOptionsForModal: WorkAreaOptionT[] = useMemo(() => {
    return (workAreas || []).map((w) => ({
      value: Number(w.DocEntry),
      label: `${w.DocNum} - ${w.Remark || 'Без комментария'}`,
    }));
  }, [workAreas]);

  const footer = (
    <div className="flex justify-content-end gap-2">
      <Button label="Отмена" icon="pi pi-times" severity="secondary" onClick={onHide} disabled={saving} />
      <Button
        label="Назначить"
        icon="pi pi-check"
        loading={saving}
        disabled={!selectedWA || saving || loadingWA || docNums.length === 0}
        onClick={async () => {
          if (!selectedWA) return;
          try {
            setSaving(true);
            await onSubmit({ workAreaDocEntry: selectedWA, docNums });
            onHide();
          } finally {
            setSaving(false);
          }
        }}
      />
    </div>
  );

  return (
    <Dialog
      header="Назначить рабочую зону"
      visible={visible}
      onHide={onHide}
      style={{ width: '40rem', maxWidth: '95vw' }}
      footer={footer}
      modal
      draggable={false}
      resizable={false}
    >
      <div className="flex flex-column gap-3">
        <Message severity="info" text={`Документов: ${docNums.length}. DocNum: ${docNums.join(', ')}`} />

        <div>
          <label className="block mb-2">Рабочая зона</label>
          <Dropdown
            value={selectedWA}
            options={workAreaOptionsForModal}
            onChange={(e) => setSelectedWA(e.value)}
            placeholder={loadingWA ? 'Загрузка...' : 'Выберите рабочую зону'}
            filter
            showClear
            className="w-full"
            disabled={loadingWA}
          />
          <small className="text-600">Список зон загружается прямо в модальном окне.</small>
        </div>
      </div>
    </Dialog>
  );
}
