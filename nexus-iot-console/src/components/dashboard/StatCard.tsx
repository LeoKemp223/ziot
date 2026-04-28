import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  change?: number;
  trend?: 'up' | 'down' | 'neutral';
  icon: React.ElementType;
  className?: string;
}

export function StatCard({ label, value, change, trend, icon: Icon, className }: StatCardProps) {
  return (
    <div className={cn("bg-white p-6 rounded-xl border border-gray-100 shadow-sm transition-all hover:shadow-md", className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 mb-1">{label}</p>
          <h3 className="text-2xl font-bold font-sans tracking-tight text-gray-900">{value}</h3>
        </div>
        <div className="p-2.5 bg-gray-50 rounded-lg">
          <Icon className="text-gray-400" size={20} />
        </div>
      </div>
      
      {change !== undefined && (
        <div className="mt-4 flex items-center gap-2">
          <div className={cn(
            "flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full",
            trend === 'up' && "text-emerald-600 bg-emerald-50",
            trend === 'down' && "text-rose-600 bg-rose-50",
            trend === 'neutral' && "text-gray-600 bg-gray-50"
          )}>
            {trend === 'up' && <TrendingUp size={12} />}
            {trend === 'down' && <TrendingDown size={12} />}
            {trend === 'neutral' && <Minus size={12} />}
            <span>{Math.abs(change)}%</span>
          </div>
          <span className="text-xs text-gray-400 font-medium">较上一周期</span>
        </div>
      )}
    </div>
  );
}
