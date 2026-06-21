import { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { ScanLine, CheckCircle2, UserCircle, Calculator, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { syncManager } from '../sync';

export default function ScannerTab() {
  const exams = useLiveQuery(() => db.exams.toArray()) || [];
  const students = useLiveQuery(() => db.students.toArray()) || [];
  
  const [selectedExamId, setSelectedExamId] = useState<number>(0);
  const [scanState, setScanState] = useState<'IDLE'|'SCANNING_SN'|'SCANNING_OMR'|'RESULT'>('IDLE');
  
  const [scannedSerial, setScannedSerial] = useState('');
  const [currentStudent, setCurrentStudent] = useState<any>(null);
  const [simulatedAnswers, setSimulatedAnswers] = useState<Record<number, string>>({});
  const [finalScore, setFinalScore] = useState<{score: number, percentage: number, category: string, isCheatSuspected: boolean} | null>(null);

  useEffect(() => {
    if (scanState === 'SCANNING_SN') {
      const isMobile = window.innerWidth < 600;
      const scanner = new Html5QrcodeScanner("reader", { 
        fps: 10, 
        qrbox: isMobile ? { width: 250, height: 250 } : { width: 300, height: 300 },
        aspectRatio: 1.0,
      }, false);
      
      scanner.render((decodedText) => {
        setScannedSerial(decodedText);
        const student = students.find(s => s.serialNumber === decodedText);
        if (student) {
          toast.success(`تم العثور على الطالب: ${student.name}`);
          setCurrentStudent(student);
          scanner.clear();
          if (selectedExamId !== 0) {
            setScanState('SCANNING_OMR');
          } else {
            setScanState('RESULT');
          }
        } else {
          toast.error('لم يتم العثور على الرقم التسلسلي أو QR للطالب في قاعدة البيانات!');
        }
      }, (error) => { /* ignore generic errors */ });

      return () => { scanner.clear().catch(e=>console.error(e)); };
    }
  }, [scanState, students, selectedExamId]);

  // Simulate OMR reading
  useEffect(() => {
    if (scanState === 'SCANNING_OMR' && selectedExamId !== 0) {
      const exam = exams.find(e => e.id === selectedExamId);
      if (!exam) return;
      
      // Simulate reading bubbles (in real app, this uses WASM/OpenCV)
      setTimeout(() => {
        const answers: Record<number, string> = {};
        const options = ['A', 'B', 'C', 'D'];
        exam.questions.forEach((q: any) => {
           // 80% chance to be correct for mock data
           answers[q.id] = Math.random() > 0.2 ? q.correctAnswer : options[Math.floor(Math.random() * options.length)];
        });
        setSimulatedAnswers(answers);
        calculateAndSaveResult(exam, currentStudent, answers);
        setScanState('RESULT');
      }, 2000);
    }
  }, [scanState, selectedExamId]);

  const calculateAndSaveResult = async (exam: any, student: any, answers: Record<number, string>) => {
    let score = 0;
    const total = exam.questions.length;
    
    exam.questions.forEach((q: any) => {
      if (answers[q.id] === q.correctAnswer) score++;
    });

    const percentage = Math.round((score / total) * 100);
    let category = 'Fail';
    if (percentage === 100) category = 'Perfect';
    else if (score >= exam.passMark) category = 'Pass';

    // Cheat Detection Engine
    const previousResults = await db.results.where('examId').equals(exam.id).toArray();
    let isCheatSuspected = false;
    
    if (percentage < 100) {
      for (const pr of previousResults) {
        if (pr.studentId === student.id) continue;
        let exactMatch = true;
        for (const [qId, ans] of Object.entries(answers)) {
          if (pr.scannedAnswers[Number(qId)] !== ans) {
            exactMatch = false;
            break;
          }
        }
        if (exactMatch) {
          isCheatSuspected = true;
          // Flag the other student too
          if (pr.id) await db.results.update(pr.id, { isCheatSuspected: true });
          break;
        }
      }
    }

    const newResult = {
      examId: exam.id,
      studentId: student.id,
      scannedAnswers: answers,
      score,
      percentage,
      category: category as any,
      isCheatSuspected
    };

    setFinalScore(newResult);
    
    // Save or update Result
    const existing = await db.results.where({ examId: exam.id, studentId: student.id }).first();
    if (existing && existing.id) {
       await db.results.update(existing.id, newResult);
    } else {
       await db.results.add(newResult);
    }
    
    // Broadcast sync to dashboard
    syncManager.sendResults([newResult]);
  };

  const resetScanner = () => {
    setScannedSerial('');
    setCurrentStudent(null);
    setSimulatedAnswers({});
    setFinalScore(null);
    setScanState('SCANNING_SN');
  };

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'Perfect': return 'علامة كاملة';
      case 'Pass': return 'ناجح';
      case 'Fail': return 'راسب';
      default: return cat;
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex border-b border-slate-700 pb-4 justify-between items-center">
        <h2 className="text-2xl font-semibold">المسح الضوئي</h2>
        <select value={selectedExamId} onChange={e=>setSelectedExamId(Number(e.target.value))} className="bg-slate-800 border border-slate-600 rounded-lg p-2 text-white outline-none">
          <option value={0}>اختر امتحان (اختياري)</option>
          {exams.map(e => <option key={e.id} value={e.id} dir="auto">{e.title}</option>)}
        </select>
      </div>

      {scanState === 'IDLE' && (
        <div className="flex flex-col items-center justify-center py-20">
          <ScanLine size={64} className="text-slate-600 mb-6" />
          <p className="text-slate-400 mb-6 text-center max-w-sm">جاهز لمسح باركود الطالب للتعرف عليه، سيتم تصحيح إجاباته إذا تم تحديد امتحان.</p>
          <button 
            onClick={() => setScanState('SCANNING_SN')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-8 rounded-xl transition-colors text-lg"
          >
            بدء المسح
          </button>
        </div>
      )}

      {scanState === 'SCANNING_SN' && (
        <div className="space-y-4 flex flex-col items-center">
          <h3 className="text-lg font-medium">امسح باركود الطالب</h3>
          <div id="reader" className="w-full bg-slate-900 rounded-xl overflow-hidden border border-slate-700 text-white p-2"></div>
          <button onClick={() => setScanState('IDLE')} className="text-slate-400 hover:text-white pb-safe">إلغاء</button>
        </div>
      )}

      {scanState === 'SCANNING_OMR' && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
           <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
           <h3 className="text-xl font-bold text-blue-500">جاري مسح الإجابات...</h3>
           <p className="text-slate-400">تحليل ورقة الإجابة للطالب {currentStudent?.name}</p>
        </div>
      )}

      {scanState === 'RESULT' && currentStudent && (
        <div className="space-y-6">
           <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 text-center">
             <UserCircle size={48} className="mx-auto text-slate-500 mb-2" />
             <h2 className="text-2xl font-bold text-white">{currentStudent.name}</h2>
             <p className="text-slate-400 font-mono mb-4">{currentStudent.serialNumber}</p>
             
             {finalScore ? (
                <>
                  <div className="flex justify-center items-center space-x-8 space-x-reverse my-6">
                    <div className="text-center">
                      <p className="text-4xl font-black text-white">{finalScore.score}</p>
                      <p className="text-sm text-slate-500 uppercase tracking-widest">الدرجة</p>
                    </div>
                    <div className="h-12 w-px bg-slate-700"></div>
                    <div className="text-center">
                      <p className={`text-4xl font-black ${finalScore.category === 'Pass' || finalScore.category === 'Perfect' ? 'text-emerald-500' : 'text-red-500'}`} dir="ltr">{finalScore.percentage}%</p>
                      <p className="text-sm text-slate-500 uppercase tracking-widest">{getCategoryLabel(finalScore.category)}</p>
                    </div>
                  </div>
                  
                  {finalScore.isCheatSuspected && (
                    <div className="p-3 bg-red-900/30 border border-red-800 rounded-xl flex items-center justify-center space-x-2 space-x-reverse text-red-400 mt-4 mb-4">
                      <AlertTriangle size={20} />
                      <span className="font-medium">اشتباه في الغش (تطابق الإجابات)</span>
                    </div>
                  )}
                </>
             ) : (
                <div className="p-4 bg-slate-900 border border-slate-700 rounded-xl mt-4 mb-6">
                  <p className="text-slate-300">تم التعرف على الطالب بنجاح، لكن لم يتم اختيار امتحان للتصحيح.</p>
                </div>
             )}

             <button onClick={resetScanner} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition-colors text-lg">
                مسح ورقة أخرى
             </button>
           </div>
        </div>
      )}
    </div>
  );
}
