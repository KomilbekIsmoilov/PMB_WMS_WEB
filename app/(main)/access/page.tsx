// src/app/(main)/access/WorkAccessScreen.tsx
'use client';

import React from 'react';
import { TabView, TabPanel } from 'primereact/tabview';
import { Card } from 'primereact/card';

import SapUsersAccessTab from './tabs/SapUsersAccessTab';
import InspectorAccessTab from './tabs/InspectorAccessTab';
import CollectorsAccessTab from './tabs/CollectorsAccessTab';
import WorkAreasTab from './tabs/WorkAreasTab';

export default function WorkAccessScreen() {
  return (
    <Card title="Доступы и рабочие зоны">
      <TabView>
        <TabPanel header="SAP пользователи (доступы)">
          <SapUsersAccessTab />
        </TabPanel>

        <TabPanel header="Проверяющие / Контролёры (доступы)">
          <InspectorAccessTab />
        </TabPanel>

        <TabPanel header="Сборщики (доступы)">
          <CollectorsAccessTab />
        </TabPanel>

        <TabPanel header="Рабочие зоны">
          <WorkAreasTab />
        </TabPanel>
      </TabView>
    </Card>
  );
}