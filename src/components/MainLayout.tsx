import { useState, useEffect } from 'react';
import { Home, FileText, Users, ScanLine, Settings, LogOut, Bell, Headset, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Dashboard from './Dashboard';
import Exams from './Exams';
import ClassesStudents from './ClassesStudents';
import ScannerTab from './ScannerTab';
import SettingsTab from './SettingsTab';
import { syncManager } from '../sync';

export default function MainLayout({ role, onLock }: { role: 'dashboard' | 'grader' | 'school', onLock: () => void }) {
  const [activeTab, setActiveTab] = useState(role === 'grader' ? 'scan' : 'dashboard');
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<{id: number, text: string, type: 'info'|'warning'}[]>([]);

  useEffect(() => {
    syncManager.connect(role);
    
    // Generate notifications
    const notifs: {id: number, text: string, type: 'info'|'warning'}[] = [];
    notifs.push({ id: 1, text: 'مرحباً بك في النظام. تم تسجيل الدخول بنجاح.', type: 'info' });
    
    const expiryStr = localStorage.getItem('nexus_sub_expiry');
    if (expiryStr) {
      const expiry = parseInt(expiryStr);
      const daysLeft = Math.ceil((expiry - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 7 && daysLeft > 0) {
        notifs.push({ id: 2, text: `تنبيه: اشتراكك ينتهي خلال ${daysLeft} أيام. يرجى التواصل مع المطور للتجديد.`, type: 'warning' });
      }
    }
    
    const lastBackup = localStorage.getItem('nexus_last_backup');
    if (!lastBackup) {
       notifs.push({ id: 3, text: 'تنبيه: لم تقم بعمل نسخة احتياطية يدوية مؤخراً. يرجى زيارة الإعدادات.', type: 'info' });
    }

    setNotifications(notifs);

    return () => {
      syncManager.disconnect();
    };
  }, [role]);

  const renderTab = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'exams': return <Exams />;
      case 'students': return <ClassesStudents />;
      case 'scan': return <ScannerTab />;
      case 'settings': return <SettingsTab />;
      default: return role === 'grader' ? <ScannerTab /> : <Dashboard />;
    }
  };

  const getNavItems = () => {
    if (role === 'dashboard') {
      return [
        { id: 'dashboard', icon: <Home size={24} />, label: 'النتائج والتحليلات' },
        { id: 'exams', icon: <FileText size={24} />, label: 'توليد و إرسال الامتحانات' },
      ];
    } else if (role === 'grader') {
      return [
        { id: 'scan', icon: <ScanLine size={24} />, label: 'المسح والتصحيح' },
        { id: 'students', icon: <Users size={24} />, label: 'بيانات الطلاب والطباعة' },
      ];
    }
    // School gets everything (independent mode)
    if (role === 'school') {
      return [
        { id: 'dashboard', icon: <Home size={24} />, label: 'الرئيسية' },
        { id: 'exams', icon: <FileText size={24} />, label: 'الامتحانات' },
        { id: 'scan', icon: <ScanLine size={24} />, label: 'المسح' },
        { id: 'students', icon: <Users size={24} />, label: 'البيانات' },
      ];
    }
    return [
      { id: 'dashboard', icon: <Home size={24} />, label: 'الرئيسية' },
    ];
  };

  const navItems = getNavItems();

  const handleDevContact = () => {
    toast((t) => (
      <div className="flex flex-col gap-2">
        <p className="font-bold">تواصل مع المطور للصيانة والدعم</p>
        <p>واتساب أو اتصال: <a href="https://wa.me/0116856217" target="_blank" className="text-blue-500 font-bold" dir="ltr">0116856217</a></p>
        <button onClick={() => toast.dismiss(t.id)} className="mt-2 bg-slate-800 text-white px-4 py-1 rounded text-sm w-full">إغلاق</button>
      </div>
    ), { duration: 10000 });
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100">
      {/* Header */}
      <header className="flex justify-between items-center p-4 bg-slate-800 border-b border-slate-700 shrink-0 relative z-50">
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
          AI Tests - {role === 'dashboard' ? 'لوحة تحكم' : role === 'grader' ? 'مصحح موزع' : 'وضع المدرسة'}
        </h1>
        <div className="flex space-x-4 space-x-reverse text-slate-400 items-center">
          <button onClick={handleDevContact} className="hover:text-white transition-colors" title="التواصل مع المطور">
            <Headset size={22} />
          </button>
          
          <div className="relative">
            <button onClick={() => setShowNotifications(!showNotifications)} className="hover:text-white transition-colors relative">
              <Bell size={22} />
              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                  {notifications.length}
                </span>
              )}
            </button>
            
            {showNotifications && (
              <div className="absolute top-10 left-0 w-64 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-50">
                <div className="p-3 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
                  <span className="font-bold text-sm text-white">الإشعارات</span>
                  <button onClick={() => setShowNotifications(false)} className="text-slate-400 hover:text-white"><X size={16}/></button>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="text-center text-slate-500 py-4 text-sm">لا توجد إشعارات</p>
                  ) : (
                    notifications.map(n => (
                      <div key={n.id} className={`p-3 border-b border-slate-700/50 text-sm ${n.type === 'warning' ? 'bg-amber-900/20 text-amber-200' : 'text-slate-300'}`}>
                        {n.text}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {(role === 'school' || role === 'dashboard') && (
            <button onClick={() => setActiveTab('settings')} className="hover:text-white transition-colors"><Settings size={22} /></button>
          )}
          <button onClick={onLock} className="hover:text-white transition-colors"><LogOut size={22} /></button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto w-full max-w-4xl mx-auto p-4 relative z-0">
        {renderTab()}
      </main>

      {/* Bottom Navigation */}
      <nav className="flex justify-around items-center bg-slate-800 border-t border-slate-700 p-3 shrink-0 pb-safe z-10">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center space-y-1 transition-colors ${activeTab === item.id ? 'text-blue-500' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {item.icon}
            <span className="text-xs font-medium">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
