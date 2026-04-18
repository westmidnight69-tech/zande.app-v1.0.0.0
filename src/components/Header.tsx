import { useAuth } from './AuthProvider';

export default function Header() {
  const { business } = useAuth();
  
  const initials = business?.name 
    ? business.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
    : '??';

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  return (
    <header className="flex items-center justify-between py-6 px-4 sm:px-0">
      <div className="flex items-center gap-4">
        <div className="size-12 rounded-full bg-gradient-to-tr from-surface to-surface-muted border border-border-subtle flex items-center justify-center text-primary font-display font-bold text-lg shadow-inner">
          {initials}
        </div>
        <div>
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-[0.2em] mb-0.5">{getGreeting()}</p>
          <h1 className="font-display text-xl font-bold text-slate-100 tracking-tight">
            {business?.name || 'Your Business'}
          </h1>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <button className="size-10 rounded-full flex items-center justify-center text-slate-400 hover:bg-surface hover:text-slate-100 transition-all">
          <span className="material-symbols-outlined text-[20px]">search</span>
        </button>
        <button className="size-10 rounded-full flex items-center justify-center text-slate-400 hover:bg-surface hover:text-slate-100 transition-all relative">
          <span className="material-symbols-outlined text-[20px]">notifications</span>
          <span className="absolute top-2.5 right-2.5 size-1.5 bg-status-overdue rounded-full border border-background"></span>
        </button>
        <button className="size-10 rounded-full flex items-center justify-center text-slate-400 hover:bg-surface hover:text-slate-100 transition-all lg:hidden">
          <span className="material-symbols-outlined text-[20px]">menu</span>
        </button>
      </div>
    </header>
  );
}
