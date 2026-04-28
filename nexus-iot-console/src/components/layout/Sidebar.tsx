import React from 'react';
import { 
  LayoutDashboard, 
  Box, 
  Cpu, 
  Settings2, 
  UploadCloud, 
  FileText, 
  Users, 
  Settings,
  Menu,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { PageId } from '@/src/App';
import { motion } from 'motion/react';

interface SidebarProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
}

const navItems: { id: PageId; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: '首页概览', icon: LayoutDashboard },
  { id: 'products', label: '产品管理', icon: Box },
  { id: 'devices', label: '设备管理', icon: Cpu },
  { id: 'control', label: '设备控制', icon: Settings2 },
  { id: 'ota', label: 'OTA 升级', icon: UploadCloud },
  { id: 'logs', label: '日志中心', icon: FileText },
  { id: 'users', label: '用户与权限', icon: Users },
  { id: 'settings', label: '系统设置', icon: Settings },
];

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  return (
    <aside className="w-64 bg-[#141414] text-white flex flex-col h-screen border-r border-[#262626]">
      <div className="p-6">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-white italic">
            N
          </div>
          <span className="font-sans font-semibold text-lg tracking-tight">Nexus IoT</span>
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = activePage === item.id;
            const Icon = item.icon;
            
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all text-sm font-medium",
                  isActive 
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" 
                    : "text-gray-400 hover:bg-[#262626] hover:text-gray-200"
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon size={18} />
                  <span>{item.label}</span>
                </div>
                {isActive && (
                  <motion.div layoutId="activeInd" className="text-white/80">
                    <ChevronRight size={14} />
                  </motion.div>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto p-4 border-t border-[#262626]">
        <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#262626] transition-colors cursor-pointer">
          <div className="w-8 h-8 rounded-full bg-gray-700 overflow-hidden">
            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Admin" alt="avatar" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-gray-200">超级管理员</span>
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Root Account</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
