import React from 'react';
import { Cpu, Plus, Search, Filter, MoreVertical, RefreshCw, Smartphone } from 'lucide-react';
import { Device } from '@/src/types';
import { cn } from '@/src/lib/utils';

const mockDevices: Device[] = [
  { id: '1', name: 'Gateway_North_Main', productKey: 'hvac_ctrl_001', status: 'online', lastSeen: '10秒前', firmwareVersion: 'v1.2.0', ip: '192.168.1.45', tags: ['华东', '主控'] },
  { id: '2', name: 'Light_Floor_02', productKey: 'street_lite_wifi', status: 'online', lastSeen: '1分钟前', firmwareVersion: 'v1.4.2', ip: '192.168.1.66', tags: ['2楼'] },
  { id: '3', name: 'Meter_Transformer_A', productKey: 'pwr_meter_v2', status: 'warning', lastSeen: '5分钟前', firmwareVersion: 'v2.1.0', ip: '10.0.4.12', tags: ['高压'] },
  { id: '4', name: 'Sensor_Vault_X', productKey: 'env_sensor_3', status: 'offline', lastSeen: '2小时前', firmwareVersion: 'v0.9.8', ip: '192.168.5.11', tags: ['安防'] },
];

interface DeviceListProps {
  onSelectDevice?: (id: string) => void;
}

export function DeviceList({ onSelectDevice }: DeviceListProps) {
  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">设备列表</h1>
          <p className="text-gray-500 text-sm">监控和管理分布在各地的物联网终端设备。</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 text-gray-600 px-4 py-2 rounded-lg font-semibold text-sm transition-all border border-gray-200">
            <RefreshCw size={18} />
            批量导入
          </button>
          <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-all shadow-sm">
            <Plus size={18} />
            注册设备
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
             <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input 
                  type="text" 
                  placeholder="按名称或 ID 搜索..."
                  className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                />
              </div>
              <select className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-500 outline-none">
                <option>全部状态</option>
                <option>在线</option>
                <option>离线</option>
                <option>警告</option>
              </select>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 text-gray-400 hover:bg-gray-50 border border-gray-200 rounded-lg transition-colors">
              <Filter size={18} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-6 py-3 font-sans italic text-[11px] font-semibold text-gray-400 uppercase tracking-wider">设备标识</th>
                <th className="px-6 py-3 font-sans italic text-[11px] font-semibold text-gray-400 uppercase tracking-wider">状态</th>
                <th className="px-6 py-3 font-sans italic text-[11px] font-semibold text-gray-400 uppercase tracking-wider">最后交互</th>
                <th className="px-6 py-3 font-sans italic text-[11px] font-semibold text-gray-400 uppercase tracking-wider">固件版本</th>
                <th className="px-6 py-3 font-sans italic text-[11px] font-semibold text-gray-400 uppercase tracking-wider">网络信息</th>
                <th className="px-6 py-3 font-sans italic text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">管理</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-sm">
              {mockDevices.map((device) => (
                <tr 
                  key={device.id} 
                  onClick={() => onSelectDevice?.(device.id)}
                  className="hover:bg-gray-50/50 transition-colors group cursor-pointer"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded flex items-center justify-center transition-colors",
                        device.status === 'online' ? 'bg-emerald-50 text-emerald-600' : 
                        device.status === 'warning' ? 'bg-blue-50 text-blue-600' : 'bg-rose-50 text-rose-600'
                      )}>
                        <Cpu size={16} />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-gray-900 leading-tight">{device.name}</span>
                        <span className="text-[10px] text-gray-400 font-mono">{device.productKey}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5">
                      <div className={cn(
                         "w-1.5 h-1.5 rounded-full animate-pulse",
                         device.status === 'online' ? 'bg-emerald-500' : 
                         device.status === 'warning' ? 'bg-blue-500' : 'bg-rose-500'
                      )} />
                      <span className={cn(
                        "text-xs font-bold uppercase",
                        device.status === 'online' ? 'text-emerald-600' : 
                        device.status === 'warning' ? 'text-blue-600' : 'text-rose-600'
                      )}>{device.status === 'online' ? '在线' : device.status === 'warning' ? '异常' : '离线'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-gray-500 font-medium">{device.lastSeen}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-mono text-xs text-gray-400">{device.firmwareVersion}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-mono text-gray-600">{device.ip}</span>
                      <div className="flex gap-1">
                        {device.tags.map(tag => (
                          <span key={tag} className="px-1 py-0.5 bg-gray-100 text-[9px] font-bold text-gray-400 rounded uppercase tracking-tighter">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                       <button 
                         onClick={(e) => { e.stopPropagation(); onSelectDevice?.(device.id); }}
                         className="p-1 px-2 text-[10px] font-bold uppercase text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                       >
                        控制面板
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

        <div className="p-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
          <span>会话 ID: 94ed-..-f28a</span>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
              2,410 在线
            </span>
             <span className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-rose-500 rounded-full" />
              142 离线
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
