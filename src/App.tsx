/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Toaster } from 'react-hot-toast';
import LockScreen from './components/LockScreen';
import MainLayout from './components/MainLayout';

export default function App() {
  const [isUnlocked, setIsUnlocked] = useState(false);

  if (!isUnlocked) {
    return (
      <>
        <LockScreen onUnlocked={() => setIsUnlocked(true)} />
        <Toaster position="top-center" toastOptions={{ style: { background: '#1e293b', color: '#f8fafc', border: '1px solid #334155' } }} />
      </>
    );
  }

  return (
    <>
      <MainLayout onLock={() => setIsUnlocked(false)} />
      <Toaster position="top-center" toastOptions={{ style: { background: '#1e293b', color: '#f8fafc', border: '1px solid #334155' } }} />
    </>
  );
}

