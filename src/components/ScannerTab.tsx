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

  const [isGrading, setIsGrading] = useState(false);
  const [useLiveCamera, setUseLiveCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (scanState === 'SCANNING_OMR' && useLiveCamera) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [scanState, useLiveCamera]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error(err);
      toast.error('لا يمكن الوصول إلى الكاميرا. يرجى منح الصلاحيات أو استخدام رفع الصور.');
      setUseLiveCamera(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const processImageBase64 = async (base64Data: string, exam: any, goResult: boolean) => {
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
        return false;
      }

      if (data.serialNumber && data.answers) {
        const student = students.find(s => s.serialNumber === data.serialNumber);
        if (student) {
          toast.success(`تم التصحيح لـ: ${student.name}`);
          setCurrentStudent(student);
          setScannedSerial(data.serialNumber);
          setSimulatedAnswers(data.answers);
          await calculateAndSaveResult(exam, student, data.answers);
          if (goResult) {
            setScanState('RESULT');
          }
          return true;
        } else {
          toast.error(`لم يتم العثور على طالب بالرقم التسلسلي: ${data.serialNumber}`);
        }
      } else {
        toast.error('حدث خطأ في التعرف على الإجابات أو الطالب');
      }
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء الاتصال بالخادم');
    }
    return false;
  };

  const handleCaptureLiveFrame = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    if (selectedExamId === 0) return;
    const exam = exams.find(ex => ex.id === selectedExamId);
    if (!exam) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64Data = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    
    setIsGrading(true);
    await processImageBase64(base64Data, exam, true);
    setIsGrading(false);
  };

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

    let successCount = 0;
    for (const file of files) {
      await new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const base64Url = ev.target?.result as string;
          if (!base64Url) { resolve(); return; }
          const base64Data = base64Url.split(',')[1];
          const ok = await processImageBase64(base64Data, exam, files.length === 1);
          if (ok) successCount++;
          resolve();
        };
        reader.readAsDataURL(file);
      });
    }
    
    setIsGrading(false);
    if (files.length > 1) {
      toast.success(`تم تصحيح ${successCount} من ${files.length} بنجاح!`);
      setScanState('IDLE');
    }
    if (e.target) e.target.value = '';
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
        <div className="flex flex-col items-center justify-center py-10 space-y-6 w-full max-w-md mx-auto">
          <div className="text-center space-y-2">
            <h3 className="text-2xl font-bold text-white">تصحيح ورقة الإجابة</h3>
            <p className="text-slate-400">اختر طريقة المسح الضوئي</p>
          </div>

          <div className="flex bg-slate-800 p-1 rounded-xl w-full">
            <button onClick={() => setUseLiveCamera(false)} className={`flex-1 py-2 text-sm rounded-lg transition-colors ${!useLiveCamera ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>رفع صور</button>
            <button onClick={() => setUseLiveCamera(true)} className={`flex-1 py-2 text-sm rounded-lg transition-colors ${useLiveCamera ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>الكاميرا المباشرة</button>
          </div>
          
          {!useLiveCamera ? (
            <label className="w-full">
              <div className={`w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-4 px-8 rounded-xl transition-colors text-lg text-center cursor-pointer flex justify-center items-center ${isGrading ? 'opacity-50 pointer-events-none' : ''}`}>
                {isGrading ? (
                  <>
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin ml-2"></div>
                    جاري تحليل الأوراق...
                  </>
                ) : (
                  'اختر صور للأوراق (صورة أو أكثر)'
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
          ) : (
            <div className="w-full space-y-4">
              <div className="relative w-full aspect-[3/4] bg-black rounded-xl overflow-hidden border border-slate-700 flex items-center justify-center">
                <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover"></video>
                <canvas ref={canvasRef} className="hidden"></canvas>
                <div className="absolute inset-4 border-2 border-dashed border-blue-500/50 rounded-lg pointer-events-none"></div>
                
                {isGrading && (
                   <div className="absolute inset-0 bg-black/60 flex items-center justify-center flex-col z-10">
                      <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin mb-4"></div>
                      <p className="text-white font-medium">جاري تحليل الورقة...</p>
                   </div>
                )}
              </div>
              <button 
                onClick={handleCaptureLiveFrame}
                disabled={isGrading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-4 rounded-xl transition-colors text-lg"
              >
                التقاط وتصحيح
              </button>
            </div>
          )}
          <button onClick={() => setScanState('IDLE')} className="text-slate-400 hover:text-white pb-safe pt-4">إلغاء الرجوع للرئيسية</button>
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
