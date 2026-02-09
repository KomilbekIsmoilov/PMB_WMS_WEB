'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { MultiSelect } from 'primereact/multiselect';
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

type CollectorOptionT = {
  empID: number;
  fullName: string;
};

type Props = {
  visible: boolean;
  onHide: () => void;
  DocType: 'SalesOrder' | 'PurchaseDoc' | 'TransferRequest' | 'SalesReturn';
  docNums: number[];
  onSubmit: (args: { workAreaDocEntry: number; docNums: number[]; collectorEmpIDs: number[] }) => Promise<void> | void;
};

export default function AssignWorkAreaModal({ visible, onHide, docNums, onSubmit }: Props) {
  const [saving, setSaving] = useState(false);
  const [loadingWA, setLoadingWA] = useState(false);
  const [loadingCollectors, setLoadingCollectors] = useState(false);

  const [workAreas, setWorkAreas] = useState<WorkAreaHeaderApiT[]>([]);
  const [selectedWA, setSelectedWA] = useState<number | null>(null);

  const [collectors, setCollectors] = useState<CollectorOptionT[]>([]);
  const [selectedCollectorEmpIDs, setSelectedCollectorEmpIDs] = useState<number[]>([]);

  useEffect(() => {
    if (!visible) return;

    const loadWA = async () => {
      try {
        setLoadingWA(true);
        const res = await api.get('/getWorksAreaHeaderApi');
        setWorkAreas((res?.data ?? res) as WorkAreaHeaderApiT[]);
      } catch {
        setWorkAreas([]);
      } finally {
        setLoadingWA(false);
      }
    };

    loadWA();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;

    if (!selectedWA) {
      setCollectors([]);
      setSelectedCollectorEmpIDs([]);
      return;
    }

    const loadCollectors = async () => {
      try {
        setLoadingCollectors(true);
        const res = await api.get('/getCollectorsWorkAreaApi', { params: { DocEntry: selectedWA } });
        const data = (res?.data ?? res) as any[];

        const list: CollectorOptionT[] = (Array.isArray(data) ? data : [])
          .map((x) => ({
            empID: Number(x.U_UserCode ?? x.EmpID ?? x.empID ?? 0),
            fullName: String(x.U_NAME ?? x.fullName ?? x.FullName ?? x.name ?? '').trim(),
          }))
          .filter((x) => Number.isFinite(x.empID) && x.empID > 0);

        setCollectors(list);

        // Default behavior: when zone changes, preselect all collectors from that zone.
        setSelectedCollectorEmpIDs(list.map((x) => x.empID));
      } catch {
        setCollectors([]);
        setSelectedCollectorEmpIDs([]);
      } finally {
        setLoadingCollectors(false);
      }
    };

    loadCollectors();
  }, [selectedWA, visible]);

  useEffect(() => {
    if (visible) return;
    setSelectedWA(null);
    setSelectedCollectorEmpIDs([]);
    setCollectors([]);
    setSaving(false);
    setLoadingWA(false);
    setLoadingCollectors(false);
    setWorkAreas([]);
  }, [visible]);

  const workAreaOptionsForModal: WorkAreaOptionT[] = useMemo(() => {
    return (workAreas || []).map((w) => ({
      value: Number(w.DocEntry),
      label: `${w.DocNum} - ${w.Remark || 'No comment'}`,
    }));
  }, [workAreas]);

  const footer = (
    <div className="flex justify-content-end gap-2">
      <Button label="Cancel" icon="pi pi-times" severity="secondary" onClick={onHide} disabled={saving} />
      <Button
        label="Assign"
        icon="pi pi-check"
        loading={saving}
        disabled={!selectedWA || saving || loadingWA || loadingCollectors || docNums.length === 0}
        onClick={async () => {
          if (!selectedWA) return;
          try {
            setSaving(true);
            await onSubmit({
              workAreaDocEntry: selectedWA,
              docNums,
              collectorEmpIDs: selectedCollectorEmpIDs,
            });
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
      header="Assign Work Area"
      visible={visible}
      onHide={onHide}
      style={{ width: '48rem', maxWidth: '95vw' }}
      footer={footer}
      modal
      draggable={false}
      resizable={false}
    >
      <div className="flex flex-column gap-3">
        <Message severity="info" text={`Documents: ${docNums.length}. DocNum: ${docNums.join(', ')}`} />

        <div className="grid">
          <div className="col-12 md:col-6">
            <label className="block mb-2">Work Area</label>
            <Dropdown
              value={selectedWA}
              options={workAreaOptionsForModal}
              onChange={(e) => setSelectedWA((e.value as number) ?? null)}
              placeholder={loadingWA ? 'Loading...' : 'Select work area'}
              filter
              showClear
              className="w-full"
              disabled={loadingWA}
            />
            <small className="text-600">Work areas are loaded directly in this modal.</small>
          </div>

          <div className="col-12 md:col-6">
            <label className="block mb-2">Collectors</label>
            <MultiSelect
              value={selectedCollectorEmpIDs}
              options={collectors}
              optionLabel="fullName"
              optionValue="empID"
              onChange={(e) => setSelectedCollectorEmpIDs((e.value || []) as number[])}
              placeholder={!selectedWA ? 'Select work area first' : loadingCollectors ? 'Loading...' : 'Select collectors'}
              filter
              display="chip"
              maxSelectedLabels={2}
              className="w-full"
              disabled={!selectedWA || loadingCollectors}
            />
            <small className="text-600">You can select one, several, or all collectors. Backend will receive empID values.</small>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
