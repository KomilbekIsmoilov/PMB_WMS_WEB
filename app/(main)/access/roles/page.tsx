'use client';

import React from 'react';
import { Card } from 'primereact/card';
import SapUsersAccessTab from '../tabs/SapUsersAccessTab';
import InspectorAccessTab from '../tabs/InspectorAccessTab';

export default function RolesAccessPage() {
  return (
    <div className="flex flex-column gap-3">
      <Card title="SAP пользователи (доступы)">
        <SapUsersAccessTab />
      </Card>

      <Card title="Проверяющие / Контролёры (доступы)">
        <InspectorAccessTab />
      </Card>
    </div>
  );
}
