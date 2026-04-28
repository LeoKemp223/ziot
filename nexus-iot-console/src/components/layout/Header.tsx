import React from 'react';
import { Search, Bell, Globe, ChevronDown } from 'lucide-react';

export function Header() {
  return (
    <header className="h-16 border-bottom border-gray-200 bg-white flex items-center justify-between px-6 sticky top-0 z-10">
      <div className="flex items-center gap-4 flex-1">
        <div className="relative max-w-md w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="搜产品、找设备或查日志..."
            className="w-full pl-10 pr-4 py-2 bg-gray-100 border-none rounded-full text-sm focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-gray-100 transition-colors text-sm font-medium text-gray-600">
          <Globe size={16} />
          <span>华东（上海）</span>
          <ChevronDown size={14} />
        </button>

        <div className="w-px h-6 bg-gray-200" />

        <button className="relative p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors">
          <Bell size={20} />
          <span className="absolute top-2 right-2 w-2 h-2 bg-blue-600 rounded-full border-2 border-white" />
        </button>
      </div>
    </header>
  );
}
