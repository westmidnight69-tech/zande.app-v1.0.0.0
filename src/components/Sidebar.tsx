import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';

const navItems = [
  { name: 'Dashboard', path: '/', icon: 'dashboard' },
  { name: 'Clients', path: '/clients', icon: 'group' },
  { name: 'Invoices', path: '/invoices', icon: 'description' },
  { name: 'Catalogue', path: '/catalogue', icon: 'inventory_2' },
  { name: 'Payments', path: '/payments', icon: 'payments' },
  { name: 'Expenses', path: '/expenses', icon: 'receipt_long' },
  { name: 'Documents', path: '/documents', icon: 'folder' },
  { name: 'Reconciliation', path: '/reconciliation', icon: 'sync_alt' },
  { name: 'Bank Accounts', path: '/bank', icon: 'account_balance' },
  { name: 'Funding', path: '/goals', icon: 'trending_up' },
  { name: 'Reports', path: '/reports', icon: 'bar_chart' },
  { name: 'Settings', path: '/settings', icon: 'settings' },
];

export default function Sidebar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <aside className="hidden lg:flex flex-col w-64 h-screen fixed left-0 top-0 bg-black border-r border-border-subtle z-50">
      <div className="p-6">
        <h1 className="font-display text-xl font-bold text-primary tracking-tight">ZANDE</h1>
        <p className="text-[10px] text-slate-500 font-mono uppercase tracking-[0.2em] mt-1">Financial Intel</p>
      </div>

      <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
                isActive 
                  ? 'bg-surface text-primary shadow-sm' 
                  : 'text-slate-400 hover:text-slate-100 hover:bg-surface/50'
              }`
            }
          >
            <span className={`material-symbols-outlined text-[22px] transition-transform duration-200 group-hover:scale-110`}>
              {item.icon}
            </span>
            <span className="text-sm font-medium tracking-wide">{item.name}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-border-subtle mt-auto">
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface/30 group">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="size-8 flex-shrink-0 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs uppercase">
              {user?.email?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-100 truncate">
                {user?.user_metadata?.first_name || 'User'}
              </p>
              <p className="text-[10px] text-slate-500 truncate lowercase">
                {user?.email || 'user@example.com'}
              </p>
            </div>
          </div>
          <button 
            onClick={handleSignOut}
            className="text-slate-400 hover:text-red-400 transition-colors p-1 flex-shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
            title="Sign Out"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
