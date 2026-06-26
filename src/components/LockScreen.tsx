import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { KeyRound, Lock, Unlock } from 'lucide-react';

export default function LockScreen({ onUnlocked }: { onUnlocked: (role: 'dashboard' | 'grader' | 'school') => void }) {
  const [role, setRole] = useState<'dashboard' | 'grader' | 'school'>('dashboard');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const settings = useLiveQuery(async () => {
    const s = await db.settings.get(1);
    return s || null;
  });

  const handleUnlock = async () => {
    setError('');
    
    // School initial setup override locally
    if (role === 'school' && password === '0000') {
      onUnlocked(role);
      if (!settings) {
        await db.settings.put({
          id: 1,
          schoolName: 'مدرستي',
          teacherName: 'اسم الأستاذ',
          academicYear: '2026-2027',
          devPasswordEntered: true,
          userPasswordHash: null
        });
      }
      return;
    }
    if (role === 'dashboard' && password === 'admin') {
      onUnlocked(role);
      return;
    }
    if (role === 'grader' && password === 'grader') {
      onUnlocked(role);
      return;
    }

    if (!password) {
      setError('يرجى إدخال كلمة المرور');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, password })
      });
      
      const data = await res.json();
      if (data.success) {
        onUnlocked(role);
      } else {
        setError(data.error || 'كلمة المرور غير صحيحة');
      }
    } catch (err) {
      console.error(err);
      // Fallback for offline usage
      if (role === 'school' && password === '0000') {
         onUnlocked(role);
      } else if (role === 'dashboard' && password === 'admin') {
         onUnlocked(role);
      } else if (role === 'grader' && password === 'grader') {
         onUnlocked(role);
      } else {
         setError('حدث خطأ أثناء الاتصال بالخادم. تأكد من اتصالك بالإنترنت');
      }
    } finally {
      setLoading(false);
    }
  };

  const isDevLogin = !settings;

  return (
    <div className="h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-blue-600/20 text-blue-500 rounded-full flex items-center justify-center">
             {isDevLogin ? <Lock size={32} /> : <Unlock size={32} />}
          </div>
        </div>
        <h1 className="text-2xl font-bold text-center mb-2">تسجيل الدخول</h1>
        <p className="text-center text-slate-400 mb-8">اختر الدور وأدخل كلمة المرور عبر السحاب.</p>

        <div className="space-y-4">
          <select 
            value={role} 
            onChange={e => setRole(e.target.value as any)}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-white focus:ring-2 focus:ring-blue-500 outline-none"
            dir="rtl"
          >
            <option value="dashboard">لوحة تحكم (Dashboard)</option>
            <option value="grader">مصحح موزع (Grader)</option>
            <option value="school">مدرسة (School)</option>
          </select>

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
            placeholder="أدخل كلمة المرور..."
            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-center text-xl tracking-widest text-white focus:ring-2 focus:ring-blue-500 outline-none"
            autoFocus
          />
          {error && <p className="text-red-400 text-center text-sm">{error}</p>}
          <button
            onClick={handleUnlock}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-4 rounded-xl transition-colors"
          >
            {loading ? 'جاري التحقق...' : 'دخول'}
          </button>
        </div>
        <p className="text-center text-slate-500 mt-8 text-sm">التحديث 1.0.2</p>
      </div>
    </div>
  );
}
