/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';
import { ProductList } from './pages/ProductList';
import { DeviceList } from './pages/DeviceList';

export type PageId = 'dashboard' | 'products' | 'devices' | 'control' | 'ota' | 'logs' | 'users' | 'settings';

export default function App() {
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const renderPage = () => {
    if (selectedDeviceId) {
      return (
        <div className="p-8">
           <button 
             onClick={() => setSelectedDeviceId(null)}
             className="mb-6 flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-blue-600 transition-colors"
           >
              <span>&larr; 返回设备列表</span>
           </button>
           <DeviceDetail deviceId={selectedDeviceId} />
        </div>
      );
    }

    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'products':
        return <ProductList />;
      case 'devices':
        return <DeviceList onSelectDevice={setSelectedDeviceId} />;
      default:
        return <div className="p-8 flex items-center justify-center text-gray-500">Feature Coming Soon</div>;
    }
  };

  return (
    <Layout activePage={currentPage} onNavigate={(p) => { setCurrentPage(p); setSelectedDeviceId(null); }}>
      {renderPage()}
    </Layout>
  );
}

// Importing the new component (to be created)
import { DeviceDetail } from './pages/DeviceDetail';
