import React from 'react';
import { Box, Plus, Search, Filter, MoreVertical, ExternalLink } from 'lucide-react';
import { Product } from '@/src/types';

const mockProducts: Product[] = [
  { id: '1', name: '智能 HVAC 控制器', key: 'hvac_ctrl_001', protocol: 'MQTT', deviceCount: 842, onlineRate: 98.5, createdAt: '2025-10-12' },
  { id: '2', name: '工业功率计', key: 'pwr_meter_v2', protocol: 'MQTT', deviceCount: 1240, onlineRate: 92.1, createdAt: '2025-11-05' },
  { id: '3', name: '环境传感器 Pro', key: 'env_sensor_3', protocol: 'HTTP', deviceCount: 320, onlineRate: 88.7, createdAt: '2026-01-20' },
  { id: '4', name: '智能路灯控制器', key: 'street_lite_wifi', protocol: 'MQTT', deviceCount: 4500, onlineRate: 99.2, createdAt: '2024-05-15' },
];

export function ProductList() {
  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">产品模型</h1>
          <p className="text-gray-500 text-sm">定义和管理产品蓝图、物模型及接入协议。</p>
        </div>
        <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-all shadow-sm">
          <Plus size={18} />
          创建新产品
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text" 
              placeholder="按名称或 Key 过滤..."
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
            />
          </div>
          <button className="p-2 text-gray-500 hover:bg-gray-50 border border-gray-200 rounded-lg transition-colors">
            <Filter size={18} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-6 py-3 font-sans italic text-[11px] font-semibold text-gray-400 uppercase tracking-wider">产品名称</th>
                <th className="px-6 py-3 font-sans italic text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Product Key</th>
                <th className="px-6 py-3 font-sans italic text-[11px] font-semibold text-gray-400 uppercase tracking-wider">协议</th>
                <th className="px-6 py-3 font-sans italic text-[11px] font-semibold text-gray-400 uppercase tracking-wider">设备数</th>
                <th className="px-6 py-3 font-sans italic text-[11px] font-semibold text-gray-400 uppercase tracking-wider">在线率</th>
                <th className="px-6 py-3 font-sans italic text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-sm">
              {mockProducts.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50/50 transition-colors group cursor-pointer">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-blue-50 flex items-center justify-center text-blue-600">
                        <Box size={16} />
                      </div>
                      <span className="font-bold text-gray-900">{product.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <code className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{product.key}</code>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 uppercase">{product.protocol}</span>
                  </td>
                  <td className="px-6 py-4 text-gray-500 font-medium">{product.deviceCount.toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1.5 min-w-[120px]">
                      <div className="flex items-center justify-between text-[10px] font-bold">
                        <span className="text-gray-400 uppercase leading-none">在线占比</span>
                        <span className="text-emerald-600">{product.onlineRate}%</span>
                      </div>
                      <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500 transition-all duration-500" 
                          style={{ width: `${product.onlineRate}%` }} 
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all">
                        <ExternalLink size={16} />
                      </button>
                      <button className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-all">
                        <MoreVertical size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
          <span>显示 1 到 4 共 24 个产品</span>
          <div className="flex items-center gap-1">
            <button className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50">上一页</button>
            <button className="px-2 py-1 rounded bg-blue-50 text-blue-600 border border-blue-200 font-bold">1</button>
            <button className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 font-bold">2</button>
            <button className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50">下一页</button>
          </div>
        </div>
      </div>
    </div>
  );
}
