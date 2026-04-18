import { NavLink } from 'react-router-dom';

export default function BottomNav() {
  const tabs = [
    { name: 'Dashboard', path: '/', icon: 'dashboard' },
    { name: 'Invoices', path: '/invoices', icon: 'description' },
    { name: 'Expenses', path: '/expenses', icon: 'receipt_long' },
    { name: 'Bank', path: '/bank', icon: 'account_balance' },
    { name: 'More', path: '/more', icon: 'more_horiz' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-xl border-t border-border-subtle px-4 pb-8 pt-3">
      <div className="max-w-xl mx-auto flex items-center justify-between gap-1">
        {tabs.map((tab) => (
          <NavLink
            key={tab.name}
            to={tab.path}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 transition-all ${
                isActive ? 'text-primary' : 'text-slate-500 hover:text-slate-300'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div className="h-8 flex items-center justify-center">
                  <span className={`material-symbols-outlined text-[24px] ${isActive ? 'fill-1' : ''}`}>
                    {tab.icon}
                  </span>
                </div>
                <p className="text-[10px] font-medium tracking-wide">{tab.name}</p>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
