import { useNavigate } from 'react-router-dom';

export default function More() {
  const navigate = useNavigate();

  const menuGroups = [
    {
      title: 'Growth & Analytics',
      items: [
        { name: 'Reports (Analytics)', path: '/reports', icon: 'bar_chart' },
      ],
    },
    {
      title: 'Management',
      items: [
        { name: 'Catalogue', path: '/catalogue', icon: 'inventory_2' },
        { name: 'Documents', path: '/documents', icon: 'folder' },
        { name: 'Reconciliation', path: '/reconciliation', icon: 'sync_alt' },
      ],
    },
    {
      title: 'System',
      items: [
        { name: 'Settings', path: '/settings', icon: 'settings' },
      ],
    },
  ];

  return (
    <div className="pb-24 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="mb-6">
        <h1 className="font-display text-4xl font-bold text-slate-100 tracking-tight">More</h1>
        <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-1">Tools & Configuration</p>
      </header>

      <div className="space-y-6">
        {menuGroups.map((group) => (
          <div key={group.title}>
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold mb-3 px-2">
              {group.title}
            </p>
            <div className="bg-surface/30 border border-border-subtle rounded-2xl overflow-hidden">
              {group.items.map((item, index) => (
                <button
                  key={item.name}
                  onClick={() => navigate(item.path)}
                  className={`w-full flex items-center gap-4 px-6 py-4 bg-surface/50 hover:bg-surface/80 transition-colors ${
                    index !== group.items.length - 1 ? 'border-b border-border-subtle' : ''
                  }`}
                >
                  <div className="size-10 rounded-xl bg-surface-muted border border-border-subtle flex flex-shrink-0 items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                  </div>
                  <h3 className="font-display text-left text-sm font-bold tracking-wide text-slate-300">
                    {item.name}
                  </h3>
                  <span className="material-symbols-outlined ml-auto text-slate-600">
                    chevron_right
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
