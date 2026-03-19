import React, { useEffect, useState } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export default function Modal({ isOpen, onClose, title, children, footer }: ModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      document.body.style.overflow = 'hidden';
    } else {
      const timer = setTimeout(() => setMounted(false), 300);
      document.body.style.overflow = 'unset';
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!mounted && !isOpen) return null;

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 transition-all duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}>
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className={`relative w-full max-w-lg bg-surface border border-border-subtle rounded-3xl shadow-2xl overflow-hidden transition-all duration-500 ${isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-8'}`}>
        {/* Header */}
        <div className="px-8 py-6 border-b border-border-subtle flex items-center justify-between bg-surface/50">
          <div>
            <h2 className="font-display text-xl font-bold text-white tracking-tight">{title}</h2>
          </div>
          <button 
            onClick={onClose}
            className="size-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-surface-muted hover:text-white transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="px-8 py-8 max-h-[70vh] overflow-y-auto no-scrollbar">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-8 py-6 border-t border-border-subtle bg-surface/30">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
