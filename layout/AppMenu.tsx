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
      items: [{ label: 'Dashboard', icon: 'pi pi-fw pi-home', to: '/pages/dashboard' }],
    },

    {
      label: 'WMS (Операции)',
      items: [
        { label: 'Заказы на закупку', icon: 'pi pi-fw pi-download', to: '/pages/wms/purchaseOrders' },
        { label: 'Заказы на продажу', icon: 'pi pi-fw pi-truck', to: '/pages/wms/SalesOrders' },
        { label: 'Запросы на перемещение', icon: 'pi pi-fw pi-arrows-h', to: '/pages/wms/TransferRequests' },
        { label: 'Место → Место', icon: 'pi pi-fw pi-exchange', to: '/wms/bin-transfer' },
        { label: 'Возвраты', icon: 'pi pi-fw pi-replay', to: '/wms/returns' },
        { label: 'Доставка', icon: 'pi pi-fw pi-truck', to: '/wms/delivery-docs' },
      ],
    },

    {
      label: 'Документы',
      items: [
        { label: 'Архив закупок', icon: 'pi pi-fw pi-briefcase', to: '/wms/purchase-archive' },
      ],
    },

    {
      label: 'Администрирование',
      items: [
        { label: 'Рабочие зоны (WorkAreas)', icon: 'pi pi-fw pi-sitemap', to: '/access/work-areas' },
        { label: 'Сборщики', icon: 'pi pi-fw pi-users', to: '/access/collectors' },
        { label: 'Настройка (склады и филиалы)', icon: 'pi pi-fw pi-cog', to: '/access/settings' },
        { label: 'Роли и доступы', icon: 'pi pi-fw pi-shield', to: '/access/roles' },
      ],
    },

    {
      label: 'Отчетность',
      items: [
        { label: 'Эффективность сборщиков', icon: 'pi pi-fw pi-chart-line', to: '/reports/pickers' },
        { label: 'История сборов (лог)', icon: 'pi pi-fw pi-list', to: '/reports/pick-history' },
        // { label: 'Движение по складу', icon: 'pi pi-fw pi-chart-bar', to: '/reports/warehouse-movements' },
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
