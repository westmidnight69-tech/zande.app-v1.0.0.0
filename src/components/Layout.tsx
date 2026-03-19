import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';

export default function Layout() {
  return (
    <div className="bg-black text-slate-100 min-h-screen">
      <Sidebar />
      <div className="lg:pl-64 flex flex-col min-h-screen">
        <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-24 lg:pb-8">
          <Outlet />
        </main>
        <div className="lg:hidden">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
