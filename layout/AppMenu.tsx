/* eslint-disable @next/next/no-img-element */

import React, { useContext } from 'react';
import AppMenuitem from './AppMenuitem';
import { LayoutContext } from './context/layoutcontext';
import { MenuProvider } from './context/menucontext';
import Link from 'next/link';
import { AppMenuItem } from '@/types';

const AppMenu = () => {
    const { layoutConfig } = useContext(LayoutContext);

const model: AppMenuItem[] = [
  {
    label: 'Главное',
    items: [{ label: 'Дашборд', icon: 'pi pi-fw pi-home', to: '/pages/dashboard' }]
  },
  {
    label: 'Приход',
    items: [
      {
        label: 'Приход',
        icon: 'pi pi-fw pi-download',
        items: [
          {
            label: 'Поступление из Закупки (Приход)',
            icon: 'pi pi-fw pi-file-import',
            to: '/pages/wms/receipts' 
          },
          {
            label: 'Размещение на складские места',
            icon: 'pi pi-fw pi-box',
            to: '/pages/wms/putaway' 
          }
        ]
      },
      {
        label: 'Сборка (выдать в работу)',
        icon: 'pi pi-fw pi-send',
        items: [
          {
            label: 'Запросы на перемещение',
            icon: 'pi pi-fw pi-arrows-h',
            to: '/pages/wms/picking/transfer-requests'
          },
          {
            label: 'Заказы на продажу',
            icon: 'pi pi-fw pi-shopping-cart',
            to: '/pages/wms/picking/sales-orders'
          },
          {
            label: 'Заявки на возврат (продажа)',
            icon: 'pi pi-fw pi-replay',
            to: '/pages/wms/picking/returns'
          }
        ]
      }
    ]
  },
  {
    label: 'Отчёты',
    items: [
      { label: 'Отчёты', icon: 'pi pi-fw pi-chart-bar', to: '/pages/reports' }
      // xohlasangiz keyin ichiga: Остатки, Движение, Производительность, и т.д. qo‘shamiz
    ]
  }
];


    return (
        <MenuProvider>
            <ul className="layout-menu">
                {model.map((item, i) => {
                    return !item?.seperator ? <AppMenuitem item={item} root={true} index={i} key={item.label} /> : <li className="menu-separator"></li>;
                })}
            </ul>
        </MenuProvider>
    );
};

export default AppMenu;
