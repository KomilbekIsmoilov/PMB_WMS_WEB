/* eslint-disable @next/next/no-img-element */

import React, { useContext } from 'react';
import AppMenuitem from './AppMenuitem';
import { LayoutContext } from './context/layoutcontext';
import { MenuProvider } from './context/menucontext';
import { AppMenuItem } from '@/types';

const AppMenu = () => {
  const { layoutConfig } = useContext(LayoutContext);

  const model: AppMenuItem[] = [

    {
      label: 'Главная',
      items: [
        { label: 'Dashboard', icon: 'pi pi-fw pi-home', to: '/' },
      ],
    },

    {
      label: 'WMS (Операции)',
      items: [
        { label: 'Заказы на закупку', icon: 'pi pi-fw pi-download', to: '/pages/wms/purchaseOrders' },
        { label: 'Заказы на продажу', icon: 'pi pi-fw pi-truck', to: '/pages/wms/SalesOrders' },
        { label: 'Заявки на возврат', icon: 'pi pi-fw pi-replay', to: '/wms/returns' },
        { label: 'Запросы на перемещение', icon: 'pi pi-fw pi-arrows-h', to: '/pages/wms/TransferRequests' },

        { label: 'Место → Место', icon: 'pi pi-fw pi-exchange', to: '/wms/bin-transfer' },

        { label: 'Журнал операций', icon: 'pi pi-fw pi-history', to: '/wms/operations-log' },
      ],
    },


    {
      label: 'Документы',
      items: [
        { label: 'Черновики / В работе', icon: 'pi pi-fw pi-book', to: '/wms/drafts' },
        { label: 'Завершенные', icon: 'pi pi-fw pi-check-circle', to: '/wms/completed' },
      ],
    },

    {
      label: 'Администрирование',
      items: [
        { label: 'Рабочие зоны (WorkAreas)', icon: 'pi pi-fw pi-sitemap', to: '/access' },
        { label: 'Пользователи', icon: 'pi pi-fw pi-users', to: '/admin/users' },
        { label: 'Роли и доступы', icon: 'pi pi-fw pi-shield', to: '/admin/roles' },
        { label: 'Настройки', icon: 'pi pi-fw pi-cog', to: '/admin/settings' },
      ],
    },

    {
      label: 'Справочники',
      items: [
        { label: 'Филиалы', icon: 'pi pi-fw pi-building', to: '/admin/branches' },
        { label: 'Склады', icon: 'pi pi-fw pi-warehouse', to: '/admin/warehouses' },
        { label: 'Складские места (Bins)', icon: 'pi pi-fw pi-inbox', to: '/admin/bins' },
        { label: 'Номенклатура', icon: 'pi pi-fw pi-box', to: '/admin/items' },
        { label: 'Партии (Batches)', icon: 'pi pi-fw pi-tags', to: '/admin/batches' },
      ],
    },


    {
      label: 'Отчетность',
      items: [
        { label: 'Эффективность сборщиков', icon: 'pi pi-fw pi-chart-line', to: '/reports/pickers' },
        { label: 'Движение по складу', icon: 'pi pi-fw pi-chart-bar', to: '/reports/warehouse-movements' },
      ],
    },
  ];

  return (
    <MenuProvider>
      <ul className="layout-menu">
        {model.map((item, i) =>
          !item?.seperator ? (
            <AppMenuitem item={item} root={true} index={i} key={item.label} />
          ) : (
            <li className="menu-separator" key={`sep-${i}`} />
          )
        )}
      </ul>
    </MenuProvider>
  );
};

export default AppMenu;
