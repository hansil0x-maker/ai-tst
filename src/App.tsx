/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import LockScreen from './components/LockScreen';
import MainLayout from './components/MainLayout';
import StudentRoom from './components/StudentRoom';
// @ts-ignore
import { registerSW } from 'virtual:pwa-register';
import { exportDB } from 'dexie-export-import';
import { db } from './db/db';

export default function App() {
  const [role, setRole] = useState<'dashboard' | 'grader' | 'school' | 'student' | null>(null);
  const [studentData, setStudentData] = useState<{token: string, name: string} | null>(null);
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

    // Auto-backup logic (every 7 days)
    const lastBackup = localStorage.getItem('nexus_last_backup');
    const now = new Date().getTime();
    const daysSince = lastBackup ? (now - parseInt(lastBackup)) / (1000 * 60 * 60 * 24) : 999;
    
    if (daysSince >= 7) {
      const performBackup = async () => {
        try {
          const blob = await exportDB(db, { prettyJson: true });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `NexusEdu_AutoBackup_${new Date().toISOString().split('T')[0]}.json`;
          a.click();
          localStorage.setItem('nexus_last_backup', now.toString());
          toast.success('تم تنزيل نسخة احتياطية تلقائية لبياناتك');
        } catch (e) {
          console.error("Auto backup failed", e);
        }
      };
      setTimeout(performBackup, 5000);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!role) {
    return (
      <>
        <LockScreen onUnlocked={(r, payload) => { setRole(r); if (payload) setStudentData(payload); }} />
        <Toaster position="top-center" toastOptions={{ style: { background: '#1e293b', color: '#f8fafc', border: '1px solid #334155' } }} />
      </>
    );
  }

  return (
    <>
      {role === 'student' ? (
        <StudentRoom studentData={studentData} onExit={() => setRole(null)} />
      ) : (
        <MainLayout role={role as 'dashboard' | 'grader' | 'school'} onLock={() => setRole(null)} />
      )}
      <Toaster position="top-center" toastOptions={{ style: { background: '#1e293b', color: '#f8fafc', border: '1px solid #334155' } }} />
    </>
  );
}


