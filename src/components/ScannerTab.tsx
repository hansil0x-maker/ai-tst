import { useState, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { ScanLine, UserCircle, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { syncManager } from '../sync';

export default function ScannerTab() {
  const exams = useLiveQuery(() => db.exams.toArray()) || [];
  const students = useLiveQuery(() => db.students.toArray()) || [];
  
  const results = useLiveQuery(() => db.results.toArray()) || [];
  
  const [selectedExamId, setSelectedExamId] = useState<number>(0);
  const [scanState, setScanState] = useState<'IDLE'|'SCANNING_OMR'|'RESULT'>('IDLE');
  
  const [filterClass, setFilterClass] = useState<number>(0);
  const [filterExam, setFilterExam] = useState<number>(0);
  const [visibleResults, setVisibleResults] = useState(5);
  
  const [scannedSerial, setScannedSerial] = useState('');
  const [currentStudent, setCurrentStudent] = useState<any>(null);
  const [simulatedAnswers, setSimulatedAnswers] = useState<Record<number, string>>({});
  const [finalScore, setFinalScore] = useState<{score: number, percentage: number, category: string, isCheatSuspected: boolean, errors?: any[], correctCount?: number, wrongCount?: number} | null>(null);

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
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast.error('الكاميرا غير مدعومة في هذا المتصفح أو تتطلب اتصال آمن (HTTPS).');
        setUseLiveCamera(false);
        return;
      }
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
      
      const textResponse = await res.text();
      let data;
      try {
        data = JSON.parse(textResponse);
      } catch (err) {
        toast.error("خطأ في الخادم (قد تكون الصورة غير واضحة).");
        return false;
      }
      
      if (!res.ok) {
        toast.error(data.error || "حدث خطأ غير متوقع في الخادم");
        return false;
      }
      
      if (data.error) {
        toast.error(data.error);
        return false;
      }

      if (data.serialNumber && data.answers) {
        const student = students.find(s => s.serialNumber === data.serialNumber);
        if (student) {
          // Check for duplicate
          const existing = await db.results.where({ examId: exam.id, studentId: student.id }).first();
          if (existing) {
            const confirmed = window.confirm(`لقد تم تصحيح هذا الامتحان للطالب ${student.name} مسبقاً (الدرجة السابقة: ${existing.percentage}%). هل تريد إعادة التصحيح واستبدال النتيجة؟`);
            if (!confirmed) {
              toast('تم تخطي الورقة.');
              return false; // Skip
            }
          }

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
        toast.error('لم يتم التعرف على الإجابات بشكل صحيح، تأكد من وضوح الصورة ومطابقتها للنموذج.');
      }
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء الاتصال بالخادم، تحقق من الاتصال بالانترنت.');
    }
    return false;
  };

  const handleCaptureLiveFrame = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    if (selectedExamId === 0) return;
    const exam = exams.find(ex => ex.id === selectedExamId);
    if (!exam) return;

    const video = videoRef.current;
    if (!video.videoWidth || !video.videoHeight) {
      toast.error('الكاميرا غير جاهزة بعد، يرجى الانتظار قليلاً');
      return;
    }

    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64Data = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    
    setIsGrading(true);
    await processImageBase64(base64Data, exam, false); 
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
    const toastId = files.length > 1 ? toast.loading(`جاري تصحيح الورقة 1 من ${files.length}...`) : undefined;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (files.length > 1 && toastId) {
        toast.loading(`جاري تصحيح الورقة ${i + 1} من ${files.length}... (قد يستغرق بضع ثوان)`, { id: toastId });
      }

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
    if (toastId) toast.dismiss(toastId);

    if (files.length > 1) {
      toast.success(`تم تصحيح ${successCount} من ${files.length} بنجاح!`);
      setScanState('IDLE');
    }
    if (e.target) e.target.value = '';
  };

  const calculateAndSaveResult = async (exam: any, student: any, answers: Record<string, string>) => {
    let score = 0;
    const total = exam.questions.length;
    const errors: any[] = [];
    
    exam.questions.forEach((q: any, index: number) => {
      const studentAns = answers[q.id.toString()];
      if (studentAns === q.correctAnswer) {
        score++;
      } else {
        errors.push({
          number: index + 1,
          selected: studentAns || 'لم يجب',
          correct: q.correctAnswer
        });
      }
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

    setFinalScore({ ...newResult, errors, correctCount: score, wrongCount: total - score });
    
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
      case 'Perfect': return 'علامة كاملة';
      case 'Pass': return 'ناجح';
      case 'Fail': return 'راسب';
      default: return cat;
    }
  };

  const filteredResults = results.filter(r => {
    let match = true;
    if (filterExam !== 0 && r.examId !== filterExam) match = false;
    if (filterClass !== 0) {
       const exam = exams.find(e => e.id === r.examId);
       if (!exam || exam.classId !== filterClass) match = false;
    }
    return match;
  });

  return (
    <div className="space-y-6 pb-20">
      <div className="flex border-b border-slate-700 pb-4 justify-between items-center">
        <h2 className="text-2xl font-semibold">المسح الضوئي</h2>
        <select value={selectedExamId} onChange={e=>setSelectedExamId(Number(e.target.value))} className="bg-slate-800 border border-slate-600 rounded-lg p-2 text-white outline-none">
          <option value={0}>اختر امتحاناً</option>
          {exams.map(e => <option key={e.id} value={e.id} dir="auto">{e.title}</option>)}
        </select>
      </div>

      {scanState === 'IDLE' && (
        <div className="space-y-8">
          <div className="flex flex-col items-center justify-center py-10 bg-slate-800/50 rounded-2xl border border-slate-700/50">
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
          
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b border-slate-700 pb-2">
              <h3 className="text-xl font-bold text-white">النتائج الممسوحة</h3>
              <div className="flex gap-2">
                <select value={filterClass} onChange={e=>setFilterClass(Number(e.target.value))} className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-white outline-none text-sm">
                  <option value={0}>كل الصفوف</option>
                  {Array.from(new Set(exams.map(e => e.classId))).map(cId => {
                    // Quick hack to get class name, ideal would be to use `classes` from db but we don't have it imported here.
                    return <option key={cId} value={cId}>صف {cId}</option>
                  })}
                </select>
                <select value={filterExam} onChange={e=>setFilterExam(Number(e.target.value))} className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-white outline-none text-sm">
                  <option value={0}>كل الامتحانات</option>
                  {exams.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
                </select>
              </div>
            </div>
            
            <div className="space-y-3">
               {filteredResults.slice(0, visibleResults).map(r => {
                 const student = students.find(s => s.id === r.studentId);
                 const exam = exams.find(e => e.id === r.examId);
                 
                 // Calculate errors
                 let errors = 0;
                 let correct = 0;
                 const errorDetails: string[] = [];
                 if (exam && exam.questions) {
                    exam.questions.forEach((q: any) => {
                       const studentAns = r.scannedAnswers[q.id.toString()];
                       if (studentAns === q.correctAnswer) {
                          correct++;
                       } else {
                          errors++;
                          errorDetails.push(`س${q.id} (أجاب: ${studentAns || 'فارغ'} - الصحيح: ${q.correctAnswer})`);
                       }
                    });
                 }
                 
                 return (
                   <div key={r.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col gap-2">
                     <div className="flex justify-between items-start">
                       <div>
                         <p className="font-bold text-white">{student?.name || 'غير معروف'}</p>
                         <p className="text-xs text-slate-400 mt-1">{exam?.title || 'امتحان محذوف'}</p>
                       </div>
                       <div className="text-left">
                         <p className={`font-black text-xl ${(r.category === 'Pass' || r.category === 'Perfect') ? 'text-emerald-500' : 'text-red-500'}`}>{r.score} / {exam?.questions?.length || 0}</p>
                       </div>
                     </div>
                     <div className="flex flex-wrap gap-2 text-sm mt-1">
                        <span className="bg-emerald-900/30 text-emerald-400 border border-emerald-800 px-2 py-1 rounded">إجابات صحيحة: {correct}</span>
                        <span className="bg-red-900/30 text-red-400 border border-red-800 px-2 py-1 rounded">أخطاء: {errors}</span>
                     </div>
                     {errorDetails.length > 0 && (
                        <div className="text-xs text-slate-400 mt-1">
                          <span className="font-bold">تفاصيل الأخطاء: </span>
                          {errorDetails.join('، ')}
                        </div>
                     )}
                   </div>
                 );
               })}
               {filteredResults.length === 0 && (
                  <p className="text-center text-slate-500 py-6">لم يتم العثور على أي نتائج ممسوحة.</p>
               )}
               {filteredResults.length > visibleResults && (
                  <div className="text-center pt-2">
                    <button onClick={() => setVisibleResults(v => v + 5)} className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-full transition-colors border border-slate-700 text-sm">
                      عرض المزيد
                    </button>
                  </div>
               )}
            </div>
          </div>
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
              <button 
                onClick={() => setScanState('IDLE')}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 rounded-xl transition-colors text-base"
              >
                إنهاء المسح والرجوع للرئيسية
              </button>
            </div>
          )}
          {!useLiveCamera && <button onClick={() => setScanState('IDLE')} className="text-slate-400 hover:text-white pb-safe pt-4">إلغاء الرجوع للرئيسية</button>}
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
                      <p className={`text-4xl font-black ${(finalScore.category === 'Pass' || finalScore.category === 'Perfect') ? 'text-emerald-500' : 'text-red-500'}`} dir="ltr">{finalScore.percentage}%</p>
                      <p className="text-sm text-slate-500 uppercase tracking-widest">{getCategoryLabel(finalScore.category)}</p>
                    </div>
                  </div>
                  
                  {finalScore.isCheatSuspected && (
                    <div className="p-3 bg-red-900/30 border border-red-800 rounded-xl flex items-center justify-center space-x-2 space-x-reverse text-red-400 mt-4 mb-4">
                      <AlertTriangle size={20} />
                      <span className="font-medium">اشتباه في الغش (تطابق الإجابات)</span>
                    </div>
                  )}

                  <div className="bg-slate-900 rounded-xl p-4 mb-6 text-right">
                    <div className="flex justify-around items-center mb-4 pb-4 border-b border-slate-700/50">
                       <div className="text-center">
                         <p className="text-2xl font-bold text-emerald-400">{finalScore.correctCount}</p>
                         <p className="text-xs text-slate-400">الإجابات الصحيحة</p>
                       </div>
                       <div className="text-center">
                         <p className="text-2xl font-bold text-red-400">{finalScore.wrongCount}</p>
                         <p className="text-xs text-slate-400">الأخطاء</p>
                       </div>
                    </div>
                    {finalScore.errors && finalScore.errors.length > 0 ? (
                      <div>
                        <p className="text-sm text-slate-300 font-bold mb-3">تفاصيل الأخطاء:</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {finalScore.errors.map((err, i) => (
                            <div key={i} className="flex justify-between items-center bg-slate-800 p-2 rounded-lg text-sm border border-slate-700">
                               <span className="text-slate-400">سؤال {err.number}</span>
                               <div className="flex items-center gap-2">
                                 <span className="text-red-400 line-through" dir="ltr">{err.selected}</span>
                                 <span className="text-slate-500">{"->"}</span>
                                 <span className="text-emerald-400 font-bold" dir="ltr">{err.correct}</span>
                               </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-emerald-400 text-sm font-bold text-center">أحسنت! لا يوجد أخطاء.</p>
                    )}
                  </div>
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
