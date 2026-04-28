import React from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { PageId } from '@/src/App';
import { motion, AnimatePresence } from 'motion/react';

interface LayoutProps {
  children: React.ReactNode;
  activePage: PageId;
  onNavigate: (page: PageId) => void;
}

export function Layout({ children, activePage, onNavigate }: LayoutProps) {
  return (
    <div className="flex h-screen bg-[#F9FAFB] text-[#111827]">
      <Sidebar activePage={activePage} onNavigate={onNavigate} />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        
        <main className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activePage}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
