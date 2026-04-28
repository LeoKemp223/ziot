import React, { useState } from 'react';
import { 
  Activity, 
  Settings2, 
  History, 
  Shield, 
  Zap, 
  Thermometer, 
  Wind,
  Power,
  RefreshCcw,
  Copy,
  ExternalLink
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { motion } from 'motion/react';

interface DeviceDetailProps {
  deviceId: string;
}

type TabId = 'status' | 'shadow' | 'control' | 'logs' | 'ota';

export function DeviceDetail({ deviceId }: DeviceDetailProps) {
  const [activeTab, setActiveTab] = useState<TabId>('status');
  const [isPowerOn, setIsPowerOn] = useState(true);

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'status', label: '实时状态', icon: Activity },
    { id: 'shadow', label: '设备影子', icon: Shield },
    { id: 'control', label: '控制面板', icon: Settings2 },
    { id: 'logs', label: '事件日志', icon: History },
    { id: 'ota', label: 'OTA 记录', icon: Zap },
  ];

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
            <Activity size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900">Gateway_North_Main</h2>
              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase rounded">在线</span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
              <span className="font-mono text-xs">ID: {deviceId}-f28a</span>
              <span className="w-1 h-1 bg-gray-300 rounded-full" />
              <span>产品类型: HVAC Controller Blue</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all">
            <RefreshCcw size={16} />
            刷新
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-all shadow-sm">
            编辑信息
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                isActive ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {activeTab === 'status' && (
             <>
               <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="bg-white p-4 rounded-xl border border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                       <span className="text-xs font-bold text-gray-400 uppercase italic">温度</span>
                       <Thermometer size={14} className="text-blue-500" />
                    </div>
                    <div className="text-2xl font-bold">24.5 °C</div>
                    <div className="text-[10px] text-emerald-500 font-bold mt-1">正常</div>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                       <span className="text-xs font-bold text-gray-400 uppercase italic">湿度</span>
                       <Wind size={14} className="text-blue-500" />
                    </div>
                    <div className="text-2xl font-bold">42%</div>
                    <div className="text-[10px] text-emerald-500 font-bold mt-1">优秀</div>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                       <span className="text-xs font-bold text-gray-400 uppercase italic">功率</span>
                       <Zap size={14} className="text-yellow-500" />
                    </div>
                    <div className="text-2xl font-bold">124W</div>
                    <div className="text-[10px] text-gray-400 font-medium mt-1">瞬时功率</div>
                  </div>
               </div>

                <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                  <h3 className="text-sm font-bold text-gray-900 mb-6 font-sans italic">远程控制面板</h3>
                  <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "p-2 rounded-lg transition-colors",
                          isPowerOn ? "bg-emerald-500 text-white" : "bg-gray-200 text-gray-400"
                        )}>
                          <Power size={20} />
                        </div>
                        <div>
                          <p className="font-bold text-gray-900">主电源开关</p>
                          <p className="text-xs text-gray-500">开启或关闭设备的主要运行功能</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => setIsPowerOn(!isPowerOn)}
                        className={cn(
                          "w-12 h-6 rounded-full transition-all relative p-1",
                          isPowerOn ? "bg-blue-600" : "bg-gray-300"
                        )}
                      >
                        <div className={cn(
                          "w-4 h-4 bg-white rounded-full transition-all",
                          isPowerOn ? "ml-6" : "ml-0"
                        )} />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">风扇速度</label>
                        <select className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-sm outline-none">
                          <option>低速</option>
                          <option>中速</option>
                          <option>高速</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">目标温度</label>
                        <input type="number" defaultValue={22} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-sm outline-none" />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                      <button className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-50">重置</button>
                      <button className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-black shadow-lg shadow-black/10">应用指令</button>
                    </div>
                  </div>
                </div>
             </>
          )}

          {activeTab === 'logs' && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
               <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                  <h3 className="text-xs font-bold text-gray-500 uppercase">设备交互日志流</h3>
                  <button className="text-[10px] bg-white border border-gray-200 px-2 py-1 rounded font-bold hover:bg-gray-50">清除日志</button>
               </div>
               <div className="divide-y divide-gray-50">
                  {[
                    { time: '12:45:01', type: '上报', content: '属性上报: temp=24.5, hum=42', status: 'success' },
                    { time: '12:44:22', type: '控制', content: '收到控制台下发的 "SetFanSpeed" 指令', status: 'info' },
                    { time: '12:44:22', type: '执行', content: '指令 "SetFanSpeed" 执行成功', status: 'success' },
                    { time: '12:42:10', type: '事件', content: '告警: 备用电池电量低 (15%)', status: 'warning' },
                  ].map((log, i) => (
                    <div key={i} className="p-3 flex gap-4 hover:bg-gray-50/50">
                      <span className="font-mono text-[10px] text-gray-400 mt-0.5">{log.time}</span>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded",
                            log.type === '上报' ? 'bg-blue-50 text-blue-600' :
                            log.type === '控制' ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-500'
                          )}>{log.type}</span>
                          <span className="text-xs font-medium text-gray-900">{log.content}</span>
                        </div>
                      </div>
                    </div>
                  ))}
               </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Smartphone size={16} className="text-gray-400" />
              连接详情
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-gray-50">
                <span className="text-xs text-gray-500">IP 地址</span>
                <span className="text-xs font-mono font-bold text-gray-900 underline decoration-blue-200">192.168.1.45</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-gray-50">
                <span className="text-xs text-gray-500">MAC 地址</span>
                <span className="text-xs font-mono text-gray-900">00:1A:2B:3C:4D:5E</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-gray-50">
                <span className="text-xs text-gray-500">设备密钥</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-400">••••••••••••</span>
                  <button className="text-blue-500 p-1 hover:bg-blue-50 rounded"><Copy size={12} /></button>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">最近活跃</span>
                <span className="text-xs font-medium text-emerald-600">已连接 - 2s 间隔</span>
              </div>
            </div>
          </div>

          <div className="bg-[#141414] p-6 rounded-xl shadow-lg text-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold tracking-tight">MQTT 订阅主题模板</h3>
              <ExternalLink size={14} className="text-gray-500" />
            </div>
            <code className="block text-[10px] font-mono text-gray-400 bg-gray-900/50 p-3 rounded-lg border border-gray-800 break-all leading-relaxed">
              devices/hvac_ctrl_001/64ed-f28a/properties/post
            </code>
            <p className="mt-4 text-[10px] text-gray-500 leading-normal italic">
              通过订阅此主题，您可以实时接收来自物理设备的属性报告数据。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
