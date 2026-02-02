'use client';

import React from 'react';
import { Card } from 'primereact/card';
import SettingsAccessTab from '../tabs/SettingsAccessTab';

export default function SettingsAccessPage() {
  return (
    <Card title="Настройка (склады и филиалы)">
      <SettingsAccessTab />
    </Card>
  );
}
