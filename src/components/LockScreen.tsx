import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { KeyRound, Lock, Unlock } from 'lucide-react';

export default function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  
  const settings = useLiveQuery(async () => {
    const s = await db.settings.get(1);
    return s || null;
  });

  const handleUnlock = async () => {
    setError('');
    if (!settings) {
      if (password === '0909opin') {
        await db.settings.put({
          id: 1,
          schoolName: 'مدرستي',
          teacherName: 'اسم الأستاذ',
          academicYear: '2026-2027',
          devPasswordEntered: true,
          userPasswordHash: null
        });
        return;
      } else {
        setError('كلمة مرور المطور غير صحيحة');
        return;
      }
    }

    if (settings.devPasswordEntered) {
      if (!settings.userPasswordHash) {
        if (password.length < 4) {
          setError('يجب أن تتكون كلمة المرور من 4 أحرف على الأقل');
          return;
        }
        await db.settings.update(1, { userPasswordHash: password });
        onUnlocked();
      } else {
        if (password === settings.userPasswordHash) {
          onUnlocked();
        } else {
          setError('كلمة المرور غير صحيحة');
        }
      }
    }
  };

  if (settings === undefined) return <div className="h-screen bg-slate-900 text-white flex items-center justify-center">جاري التحميل...</div>;

  const isDevLogin = !settings;
  const isSetupUser = settings && !settings.userPasswordHash;

  return (
    <div className="h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-blue-600/20 text-blue-500 rounded-full flex items-center justify-center">
            {isDevLogin ? <Lock size={32} /> : isSetupUser ? <KeyRound size={32} /> : <Unlock size={32} />}
          </div>
        </div>
        <h1 className="text-2xl font-bold text-center mb-2">
          {isDevLogin ? 'وصول المطور' : isSetupUser ? 'إعداد كلمة المرور' : 'التطبيق مقفل'}
        </h1>
        <p className="text-center text-slate-400 mb-8">
          {isDevLogin ? 'أدخل بيانات اعتماد المطور للتهيئة.' : isSetupUser ? 'أنشئ كلمة مرور آمنة للاستخدام اليومي.' : 'أدخل كلمة المرور للمتابعة.'}
        </p>

        <div className="space-y-4">
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
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-4 rounded-xl transition-colors"
          >
            {isSetupUser ? 'حفظ كلمة المرور' : 'فتح'}
          </button>
        </div>
      </div>
    </div>
  );
}
