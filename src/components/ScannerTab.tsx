import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { ScanLine, UserCircle, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { syncManager } from '../sync';

export default function ScannerTab() {
  const exams = useLiveQuery(() => db.exams.toArray()) || [];
  const students = useLiveQuery(() => db.students.toArray()) || [];
  
  const [selectedExamId, setSelectedExamId] = useState<number>(0);
  const [scanState, setScanState] = useState<'IDLE'|'SCANNING_OMR'|'RESULT'>('IDLE');
  
  const [scannedSerial, setScannedSerial] = useState('');
  const [currentStudent, setCurrentStudent] = useState<any>(null);
  const [simulatedAnswers, setSimulatedAnswers] = useState<Record<number, string>>({});
  const [finalScore, setFinalScore] = useState<{score: number, percentage: number, category: string, isCheatSuspected: boolean} | null>(null);

  // State for tracking grading
  const [isGrading, setIsGrading] = useState(false);

  const handleCapturePaper = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    if (selectedExamId === 0) {
      toast.error('يجب اختيار الامتحان أولاً.');
      return;
    }

    const exam = exams.find(ex => ex.id === selectedExamId);
    if (!exam) return;

    setIsGrading(true);

    for (const file of files) {
      try {
        await new Promise<void>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = async (ev) => {
            const base64Url = ev.target?.result as string;
            if (!base64Url) { resolve(); return; }
            const base64Data = base64Url.split(',')[1];
            
            const questionsKey = exam.questions.map((q: any) => ({
              id: q.id,
              correctAnswer: q.correctAnswer
            }));

            try {
              const res = await fetch('/api/grade-exam', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64Data, questions: questionsKey })
              });
              
              const data = await res.json();
              
              if (data.error) {
                toast.error(data.error);
                resolve();
                return;
              }

              if (data.serialNumber && data.answers) {
                const student = students.find(s => s.serialNumber === data.serialNumber);
                if (student) {
                  toast.success(`تم العثور على الطالب: ${student.name} وتم التصحيح.`);
                  setCurrentStudent(student);
                  setScannedSerial(data.serialNumber);
                  setSimulatedAnswers(data.answers);
                  await calculateAndSaveResult(exam, student, data.answers);
                  // Only change state to RESULT if it's a single file or last file
                  if (files.length === 1) {
                    setScanState('RESULT');
                  }
                } else {
                  toast.error(`لم يتم العثور على طالب بالرقم التسلسلي: ${data.serialNumber}`);
                }
              } else {
                toast.error('حدث خطأ في التعرف على الإجابات أو الطالب');
              }
              resolve();
            } catch (err) {
              console.error(err);
              toast.error('حدث خطأ أثناء الاتصال بالخادم');
              resolve();
            }
          };
          reader.readAsDataURL(file);
        });
      } catch (err) {
        console.error("Error processing file", err);
      }
    }
    
    setIsGrading(false);
    // If multiple files were uploaded, show a summary toast or just stay in scanning state
    if (files.length > 1) {
      toast.success(`تم الانتهاء من تصحيح ${files.length} أوراق! يمكنك التحقق من النتائج في لوحة التحكم.`);
      setScanState('IDLE');
    }
  };

  const calculateAndSaveResult = async (exam: any, student: any, answers: Record<string, string>) => {
    let score = 0;
    const total = exam.questions.length;
    
    exam.questions.forEach((q: any) => {
      // The API returns strings like "A", "INVALID", "EMPTY"
      if (answers[q.id.toString()] === q.correctAnswer) {
        score++;
      }
    });

    const percentage = Math.round((score / total) * 100);
    let category = 'راسب';
    if (percentage === 100) category = 'مكمل'; // User requested this logic
    else if (score >= exam.passMark) category = 'مكمل';
    
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
    
    syncManager.sendResults([newResult]);
  };

  const resetScanner = () => {
    setScannedSerial('');
    setCurrentStudent(null);
    setSimulatedAnswers({});
    setFinalScore(null);
    setScanState('IDLE');
  };

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'مكمل': return 'مكمل / ناجح';
      case 'راسب': return 'راسب';
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
          <p className="text-slate-400 mb-6 text-center max-w-sm">جاهز لالتقاط صورة لورقة الإجابة وتصحيحها وتحديد هوية الطالب فوراً.</p>
          <button 
            onClick={() => {
              if (selectedExamId === 0) {
                toast.error('يجب اختيار الامتحان أولاً.');
                return;
              }
              setScanState('SCANNING_OMR');
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-8 rounded-xl transition-colors text-lg"
          >
            بدء المسح
          </button>
        </div>
      )}

      {scanState === 'SCANNING_OMR' && (
        <div className="flex flex-col items-center justify-center py-20 space-y-6">
          <div className="text-center space-y-2">
            <h3 className="text-2xl font-bold text-white">تصحيح ورقة الإجابة</h3>
            <p className="text-slate-400">التقط صورة لورقة الطالب، وسنتعرف عليه ونصوبها.</p>
          </div>
          
          <label className="w-full max-w-sm">
            <div className={`w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-4 px-8 rounded-xl transition-colors text-lg text-center cursor-pointer flex justify-center items-center ${isGrading ? 'opacity-50 pointer-events-none' : ''}`}>
              {isGrading ? (
                <>
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin ml-2"></div>
                  جاري تحليل الورقة...
                </>
              ) : (
                'التقط صورة للورقة'
              )}
            </div>
            <input 
              type="file" 
              accept="image/*" 
              capture="environment" 
              multiple
              className="hidden" 
              onChange={handleCapturePaper}
              disabled={isGrading}
            />
          </label>
          <button onClick={() => setScanState('IDLE')} className="text-slate-400 hover:text-white pb-safe">إلغاء</button>
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
                      <p className={`text-4xl font-black ${finalScore.category === 'مكمل' ? 'text-emerald-500' : 'text-red-500'}`} dir="ltr">{finalScore.percentage}%</p>
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
