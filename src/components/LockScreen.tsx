import { useState, useEffect } from 'react';
import { db } from '../db/db';
import { Lock, Unlock, PhoneCall, Key, AlertTriangle } from 'lucide-react';

const DEV_PWD = 'opininit';
const RESET_PWD = 'init0909';
const DEV_PHONE = '0116856217';

const CODES = {
  MONTHLY: 'month123',
  HALF_YEAR: 'half123',
  YEARLY: 'year123'
};

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

export default function LockScreen({ onUnlocked }: { onUnlocked: (role: 'dashboard' | 'grader' | 'school') => void }) {
  const [state, setState] = useState<'LOADING' | 'DEV_SETUP' | 'USER_SETUP' | 'USER_LOGIN' | 'HARD_LOCKED' | 'SUB_EXPIRED'>('LOADING');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [fails, setFails] = useState(0);

  useEffect(() => {
    const init = async () => {
      // Time validation
      let currentTime = Date.now();
      try {
        const res = await fetch('http://worldtimeapi.org/api/timezone/Etc/UTC', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          currentTime = new Date(data.datetime).getTime();
        }
      } catch (e) {
        // Fallback to local time
      }

      const lastKnown = parseInt(localStorage.getItem('nexus_last_time') || '0');
      if (currentTime < lastKnown) {
        // Clock tampering detected, use last known time
        currentTime = lastKnown;
      } else {
        localStorage.setItem('nexus_last_time', currentTime.toString());
      }

      // Check Subscription
      let expiry = localStorage.getItem('nexus_sub_expiry');
      const setupDone = localStorage.getItem('nexus_setup_done') === 'true';

      if (!expiry && setupDone) {
         // Legacy upgrade: grant 30 days if not set
         expiry = (currentTime + THIRTY_DAYS).toString();
         localStorage.setItem('nexus_sub_expiry', expiry);
      }

      if (expiry && currentTime > parseInt(expiry)) {
         setState('SUB_EXPIRED');
         return;
      }

      const lockFails = parseInt(localStorage.getItem('nexus_fails') || '0');
      setFails(lockFails);

      if (lockFails >= 5) {
        setState('HARD_LOCKED');
        return;
      }

      if (!setupDone) {
        setState('DEV_SETUP');
      } else {
        setState('USER_LOGIN');
      }
    };
    init();
  }, []);

  const handleDevSetup = () => {
    if (password === DEV_PWD) {
      setError('');
      setPassword('');
      setState('USER_SETUP');
    } else {
      registerFail();
    }
  };

  const handleUserSetup = () => {
    if (!password) {
       setError('كلمة السر لا يمكن أن تكون فارغة');
       return;
    }
    if (password !== confirmPassword) {
       setError('كلمتا السر غير متطابقتين');
       return;
    }
    localStorage.setItem('nexus_user_pwd', password);
    localStorage.setItem('nexus_setup_done', 'true');
    localStorage.setItem('nexus_sub_expiry', (Date.now() + THIRTY_DAYS).toString());
    onUnlocked('school');
  };

  const handleLogin = () => {
    const saved = localStorage.getItem('nexus_user_pwd');
    if (password === saved || password === DEV_PWD) {
      localStorage.setItem('nexus_fails', '0');
      onUnlocked('school');
    } else {
      registerFail();
    }
  };

  const handleResetUnlock = () => {
    if (password === RESET_PWD) {
      localStorage.setItem('nexus_fails', '0');
      setFails(0);
      setState('USER_LOGIN');
      setPassword('');
      setError('');
    } else {
      setError('كلمة السر التجاوزية خاطئة');
    }
  };

  const handleSubscription = () => {
    let addTime = 0;
    if (password === CODES.MONTHLY) addTime = THIRTY_DAYS;
    else if (password === CODES.HALF_YEAR) addTime = THIRTY_DAYS * 6;
    else if (password === CODES.YEARLY) addTime = THIRTY_DAYS * 12;

    if (addTime > 0) {
      const currentExpiry = parseInt(localStorage.getItem('nexus_sub_expiry') || Date.now().toString());
      const newExpiry = Math.max(Date.now(), currentExpiry) + addTime;
      localStorage.setItem('nexus_sub_expiry', newExpiry.toString());
      alert('تم تمديد اشتراكك بنجاح! شكراً لك.');
      window.location.reload();
    } else {
      setError('رمز التفعيل غير صحيح');
    }
  };

  const registerFail = () => {
    const newFails = fails + 1;
    setFails(newFails);
    localStorage.setItem('nexus_fails', newFails.toString());
    if (newFails >= 5) {
      setState('HARD_LOCKED');
    } else {
      setError(`كلمة السر خاطئة. متبقي ${5 - newFails} محاولات`);
    }
    setPassword('');
  };

  if (state === 'LOADING') return <div className="h-screen bg-slate-900 flex justify-center items-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div></div>;

  return (
    <div className="h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700">
        
        {state === 'HARD_LOCKED' && (
          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-red-600/20 text-red-500 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle size={32} />
            </div>
            <h1 className="text-2xl font-bold text-white">التطبيق مقفل</h1>
            <p className="text-slate-400">لقد تجاوزت الحد الأقصى للمحاولات الخاطئة.</p>
            <div className="bg-slate-900 p-4 rounded-xl border border-slate-700">
              <p className="text-sm text-slate-300 mb-2">لفتح التطبيق، يرجى التواصل مع المطور:</p>
              <a href={`https://wa.me/${DEV_PHONE}`} target="_blank" className="flex justify-center items-center gap-2 text-blue-400 hover:text-blue-300 font-bold text-lg"><PhoneCall size={20} /> {DEV_PHONE}</a>
            </div>
            <div className="pt-4 border-t border-slate-700 mt-4">
               <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="رمز فك القفل..." className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-center text-white outline-none mb-3" />
               <button onClick={handleResetUnlock} className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl transition-colors">تأكيد رمز الفتح</button>
               {error && <p className="text-red-400 mt-2 text-sm">{error}</p>}
            </div>
          </div>
        )}

        {state === 'SUB_EXPIRED' && (
          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-amber-600/20 text-amber-500 rounded-full flex items-center justify-center mb-4">
              <Lock size={32} />
            </div>
            <h1 className="text-2xl font-bold text-white">انتهى الاشتراك</h1>
            <p className="text-slate-400">انتهت فترة اشتراكك الحالية. لا تقلق، <span className="text-emerald-400 font-bold">جميع بياناتك آمنة ومحفوظة</span>.</p>
            <div className="bg-slate-900 p-4 rounded-xl border border-slate-700">
              <p className="text-sm text-slate-300 mb-2">لتجديد الاشتراك، يرجى التواصل مع المطور:</p>
              <a href={`https://wa.me/${DEV_PHONE}`} target="_blank" className="flex justify-center items-center gap-2 text-blue-400 hover:text-blue-300 font-bold text-lg"><PhoneCall size={20} /> {DEV_PHONE}</a>
            </div>
            <div className="pt-4 border-t border-slate-700 mt-4">
               <input type="password" value={password} onChange={e=>setPassword(e.target.value)} onPaste={e=>e.preventDefault()} placeholder="رمز التفعيل (شهري / نصف سنوي / سنوي)..." className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-center text-white outline-none mb-3" />
               <button onClick={handleSubscription} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl transition-colors">تفعيل</button>
               {error && <p className="text-red-400 mt-2 text-sm">{error}</p>}
            </div>
          </div>
        )}

        {state === 'DEV_SETUP' && (
          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-blue-600/20 text-blue-500 rounded-full flex items-center justify-center mb-4"><Key size={32} /></div>
            <h1 className="text-2xl font-bold text-white">إعداد النظام</h1>
            <p className="text-slate-400">هذه الشاشة تظهر لمرة واحدة فقط. الرجاء إدخال كلمة سر المطور لتهيئة التطبيق.</p>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} onPaste={e=>e.preventDefault()} placeholder="كلمة سر المطور..." className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-center text-xl tracking-widest text-white focus:ring-2 focus:ring-blue-500 outline-none" autoFocus />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button onClick={handleDevSetup} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl transition-colors">التحقق والمتابعة</button>
          </div>
        )}

        {state === 'USER_SETUP' && (
          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-emerald-600/20 text-emerald-500 rounded-full flex items-center justify-center mb-4"><Lock size={32} /></div>
            <h1 className="text-2xl font-bold text-white">كلمة السر الخاصة بك</h1>
            <p className="text-slate-400">اختر كلمة سر لفتح التطبيق مستقبلاً. تذكرها جيداً.</p>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} onPaste={e=>e.preventDefault()} placeholder="كلمة السر الجديدة..." className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-center text-xl tracking-widest text-white focus:ring-2 focus:ring-blue-500 outline-none" autoFocus />
            <input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} onPaste={e=>e.preventDefault()} placeholder="تأكيد كلمة السر..." className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-center text-xl tracking-widest text-white focus:ring-2 focus:ring-blue-500 outline-none" />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button onClick={handleUserSetup} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-xl transition-colors">حفظ الدخول للتطبيق</button>
          </div>
        )}

        {state === 'USER_LOGIN' && (
          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-blue-600/20 text-blue-500 rounded-full flex items-center justify-center mb-4"><Unlock size={32} /></div>
            <h1 className="text-2xl font-bold text-white">تسجيل الدخول</h1>
            <p className="text-slate-400">أدخل كلمة السر لفتح التطبيق</p>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} onPaste={e=>e.preventDefault()} placeholder="كلمة السر..." className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-center text-xl tracking-widest text-white focus:ring-2 focus:ring-blue-500 outline-none" autoFocus />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button onClick={handleLogin} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl transition-colors">دخول</button>
          </div>
        )}

      </div>
    </div>
  );
}
