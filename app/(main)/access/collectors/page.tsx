'use client';

import React from 'react';
import { Card } from 'primereact/card';
import CollectorsAccessTab from '../tabs/CollectorsAccessTab';

export default function CollectorsAccessPage() {
  return (
    <Card title="Сборщики (настройка доступа)">
      <CollectorsAccessTab />
    </Card>
  );
}
