/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import LockScreen from './components/LockScreen';
import MainLayout from './components/MainLayout';
// @ts-ignore
import { registerSW } from 'virtual:pwa-register';

export default function App() {
  const [role, setRole] = useState<'dashboard' | 'grader' | 'developer' | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    // Register PWA service worker
    registerSW({ immediate: true });

    const handleOnline = () => {
      setIsOnline(true);
      toast.success('أنت متصل بالإنترنت الآن');
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      toast.error('أنت غير متصل بالإنترنت. بعض الميزات مثل الذكاء الاصطناعي لن تعمل.', { duration: 5000 });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!role) {
    return (
      <>
        <LockScreen onUnlocked={(r) => setRole(r)} />
        <Toaster position="top-center" toastOptions={{ style: { background: '#1e293b', color: '#f8fafc', border: '1px solid #334155' } }} />
      </>
    );
  }

  return (
    <>
      <MainLayout role={role} onLock={() => setRole(null)} />
      <Toaster position="top-center" toastOptions={{ style: { background: '#1e293b', color: '#f8fafc', border: '1px solid #334155' } }} />
    </>
  );
}


