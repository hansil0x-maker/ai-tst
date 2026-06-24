import { useState, useEffect } from 'react';
import { Home, FileText, Users, ScanLine, Settings, LogOut } from 'lucide-react';
import Dashboard from './Dashboard';
import Exams from './Exams';
import ClassesStudents from './ClassesStudents';
import ScannerTab from './ScannerTab';
import SettingsTab from './SettingsTab';
import { syncManager } from '../sync';

export default function MainLayout({ role, onLock }: { role: 'dashboard' | 'grader' | 'school', onLock: () => void }) {
  const [activeTab, setActiveTab] = useState(role === 'grader' ? 'scan' : 'dashboard');

  useEffect(() => {
    syncManager.connect(role);
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

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100">
      {/* Header */}
      <header className="flex justify-between items-center p-4 bg-slate-800 border-b border-slate-700 shrink-0">
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
          AI Tests - {role === 'dashboard' ? 'لوحة تحكم' : role === 'grader' ? 'مصحح موزع' : 'وضع المدرسة'}
        </h1>
        <div className="flex space-x-4 space-x-reverse text-slate-400">
          {(role === 'school' || role === 'dashboard') && (
            <button onClick={() => setActiveTab('settings')} className="hover:text-white"><Settings size={22} /></button>
          )}
          <button onClick={onLock} className="hover:text-white"><LogOut size={22} /></button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto w-full max-w-4xl mx-auto p-4 relative">
        {renderTab()}
      </main>

      {/* Bottom Navigation */}
      <nav className="flex justify-around items-center bg-slate-800 border-t border-slate-700 p-3 shrink-0 pb-safe">
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
