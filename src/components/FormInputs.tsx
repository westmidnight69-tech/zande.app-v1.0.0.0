import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <div className="space-y-1.5 w-full">
      <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold px-1">
        {label}
      </label>
      <input
        className={`w-full bg-white border border-border-subtle rounded-xl px-4 py-3 text-sm text-black placeholder:text-slate-400 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all ${error ? 'border-status-overdue/50 ring-1 ring-status-overdue/20' : ''} ${className}`}
        {...props}
      />
      {error && <p className="text-[10px] font-mono text-status-overdue uppercase tracking-wider px-1">{error}</p>}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: { value: string; label: string }[];
  error?: string;
}

export function Select({ label, options, error, className = '', ...props }: SelectProps) {
  return (
    <div className="space-y-1.5 w-full">
      <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold px-1">
        {label}
      </label>
      <div className="relative">
        <select
          className={`w-full bg-white border border-border-subtle rounded-xl px-4 py-3 text-sm text-black appearance-none focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all ${error ? 'border-status-overdue/50 ring-1 ring-status-overdue/20' : ''} ${className}`}
          {...props}
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value} className="bg-surface text-slate-100">
              {opt.label}
            </option>
          ))}
        </select>
        <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none text-[20px]">
          expand_more
        </span>
      </div>
      {error && <p className="text-[10px] font-mono text-status-overdue uppercase tracking-wider px-1">{error}</p>}
    </div>
  );
}

export function PrimaryButton({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`w-full py-4 bg-white text-black font-display font-bold text-xs uppercase tracking-[0.2em] rounded-2xl hover:bg-slate-200 active:scale-[0.98] transition-all shadow-lg shadow-white/5 disabled:opacity-50 disabled:pointer-events-none ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`w-full py-4 bg-surface border border-border-subtle text-white font-display font-bold text-xs uppercase tracking-[0.2em] rounded-2xl hover:bg-surface-muted active:scale-[0.98] transition-all ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
