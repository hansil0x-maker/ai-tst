/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import LockScreen from './components/LockScreen';
import MainLayout from './components/MainLayout';

export default function App() {
  const [isUnlocked, setIsUnlocked] = useState(false);

  if (!isUnlocked) {
    return <LockScreen onUnlocked={() => setIsUnlocked(true)} />;
  }

  return <MainLayout onLock={() => setIsUnlocked(false)} />;
}

