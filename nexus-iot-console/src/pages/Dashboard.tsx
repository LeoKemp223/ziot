import React from 'react';
import { 
  Users, 
  Cpu, 
  Activity, 
  AlertTriangle, 
  ArrowUpRight, 
  History,
  HardDrive
} from 'lucide-react';
import { StatCard } from '@/src/components/dashboard/StatCard';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

const data = [
  { time: '00:00', reports: 400, alarms: 24, control: 140 },
  { time: '04:00', reports: 300, alarms: 18, control: 120 },
  { time: '08:00', reports: 600, alarms: 45, control: 280 },
  { time: '12:00', reports: 1200, alarms: 32, control: 450 },
  { time: '16:00', reports: 1800, alarms: 54, control: 620 },
  { time: '20:00', reports: 1100, alarms: 28, control: 310 },
  { time: '23:59', reports: 800, alarms: 15, control: 200 },
];

const recentLogs = [
  { id: 1, type: 'status', device: 'HVAC-UNIT-01', message: '温度超过阈值报警', time: '2分钟前', severity: 'warning' },
  { id: 2, type: 'ota', device: 'SMART-METER-X', message: '固件 v2.4.0 更新成功', time: '15分钟前', severity: 'success' },
  { id: 3, type: 'control', device: 'GATE-04', message: '管理员执行远程开门指令', time: '45分钟前', severity: 'info' },
  { id: 4, type: 'auth', device: '系统', message: '新用户 "经理_张三" 已加入', time: '1小时前', severity: 'info' },
];

export function Dashboard() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">控制台概览</h1>
        <p className="text-gray-500 text-sm">实时监控平台运行状态、核心指标及设备活动摘要。</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard label="设备总数" value="2,840" change={12} trend="up" icon={Cpu} />
        <StatCard label="在线率" value="94.2%" change={0.8} trend="up" icon={Activity} />
        <StatCard label="今日上报" value="842.1k" change={4.2} trend="up" icon={ArrowUpRight} />
        <StatCard label="今日告警" value="14" change={3} trend="down" icon={AlertTriangle} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900 font-sans italic">流量数据分析</h2>
            <div className="flex gap-2">
              <select className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 outline-none">
                <option>最近 24 小时</option>
                <option>最近 7 天</option>
              </select>
            </div>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorReports" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis 
                  dataKey="time" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '8px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    fontSize: '12px'
                  }} 
                />
                <Area 
                  type="monotone" 
                  dataKey="reports" 
                  stroke="#2563eb" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorReports)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900 font-sans italic">最近日志</h2>
            <button className="text-xs font-semibold text-blue-600 hover:text-blue-700">查看全部</button>
          </div>
          
          <div className="space-y-4 flex-1">
            {recentLogs.map((log) => (
              <div key={log.id} className="flex gap-4 p-3 rounded-lg hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100 group">
                <div className="mt-1">
                  <div className={`w-2 h-2 rounded-full ${
                    log.severity === 'warning' ? 'bg-orange-500' : 
                    log.severity === 'success' ? 'bg-emerald-500' : 'bg-blue-500'
                  }`} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-900">{log.device}</span>
                    <span className="text-[10px] text-gray-400 font-medium uppercase tracking-tighter">{log.time}</span>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">{log.message}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-6 border-t border-gray-100 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                  <AlertTriangle size={16} />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-900">核心告警</p>
                  <p className="text-[10px] text-gray-500">3 台设备需要立即处理</p>
                </div>
              </div>
              <ChevronRight size={14} className="text-gray-300" />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                  <HardDrive size={16} />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-900">存储容量</p>
                  <p className="text-[10px] text-gray-500">已用 72.4 GB / 100 GB</p>
                </div>
              </div>
              <ChevronRight size={14} className="text-gray-300" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChevronRight({ size = 16, className = "" }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="m9 18 6-6-6-6"/>
    </svg>
  );
}
