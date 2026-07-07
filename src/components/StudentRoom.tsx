import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import { Loader2, LogOut, CheckCircle2, ChevronRight, ChevronLeft, AlertTriangle, ShieldCheck, Clock, Camera } from 'lucide-react';

export default function StudentRoom({ studentData, onExit }: { studentData: any, onExit: () => void }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<'waiting' | 'active' | 'submitted' | 'disconnected'>('waiting');
  const [exam, setExam] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(0);
  
  // Timer & Toasts
  const [timeLeft, setTimeLeft] = useState(60 * 60); // 60 minutes default
  const [earlySubmitRequested, setEarlySubmitRequested] = useState(false);
  const [earlySubmitApproved, setEarlySubmitApproved] = useState(false);
  
  // Handover state
  const [handoverCountdown, setHandoverCountdown] = useState(60);
  const [handoverInfo, setHandoverInfo] = useState<any>(null);

  // Anti-cheat
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);

  useEffect(() => {
    const newSocket = io('/', { path: '/socket.io' });
    
    newSocket.on('connect', () => {
      newSocket.emit('join_session', { token: studentData.token, student: { name: studentData.name } }, (res: any) => {
        if (!res.success) {
          toast.error(res.error || 'فشل الانضمام');
          onExit();
        } else {
          toast.success('تم الانضمام لغرفة الانتظار بنجاح');
          setStatus('waiting');
        }
      });
    });

    newSocket.on('receive_exam', (examPayload) => {
      setExam(examPayload);
      setStatus('active');
      setTimeLeft(examPayload.duration ? examPayload.duration * 60 : 60 * 60);
      toast.success('بدأ الامتحان!');
      startCameraProctoring(newSocket, studentData);
    });

    newSocket.on('session_closed', () => {
      if (status !== 'submitted') {
        toast.error('أغلق المعلم الجلسة. سيتم تسليم إجاباتك.');
        forceSubmit(newSocket);
      }
    });

    newSocket.on('disconnect', () => {
      setStatus('disconnected');
    });

    newSocket.on('early_submit_approved', () => {
      setEarlySubmitApproved(true);
      toast.success('وافق المعلم على التسليم المبكر. يرجى تأكيد التسليم.');
    });

    setSocket(newSocket);

    return () => {
      stopCamera();
      newSocket.disconnect();
    };
  }, [studentData, onExit]);

  // Timer logic
  useEffect(() => {
    if (status === 'active') {
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          const halfTime = Math.floor((exam?.duration || 60) * 60 / 2);
          if (prev === halfTime) {
            toast('انقضى نصف الوقت', { icon: '⏳' });
          }
          if (prev === Math.floor(halfTime * 0.75)) {
            toast('خذ نفساً عميقاً وحافظ على تركيزك (Take a deep breath and focus)', { icon: '🌿' });
          }
          if (prev === 10 * 60 && (exam?.duration || 60) > 10) {
            toast('10 دقائق متبقية (10 minutes remaining)', { icon: '⏰' });
          }
          if (prev <= 1) {
            clearInterval(timer);
            forceSubmit(socket);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [status, exam, socket]);

  // Handover Countdown
  useEffect(() => {
    if (status === 'submitted') {
      const timer = setInterval(() => {
        setHandoverCountdown(prev => {
          if (prev <= 1) {
             clearInterval(timer);
             onExit();
             return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [status, onExit]);

  const startCameraProctoring = async (activeSocket: Socket | null, student: any) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }

      // Native Face Detector API (Chrome Android)
      // @ts-ignore
      if ('FaceDetector' in window) {
        // @ts-ignore
        const faceDetector = new FaceDetector();
        let lastFaceSeen = Date.now();
        setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState !== 4) return;
          try {
            const faces = await faceDetector.detect(videoRef.current);
            if (faces.length === 0) {
              if (Date.now() - lastFaceSeen > 3000) {
                 activeSocket?.emit('cheat_alert', { token: studentData.token, student: studentData, reason: 'لم يتم اكتشاف وجه (الطالب لا ينظر للشاشة لأكثر من 3 ثوانٍ)' });
                 lastFaceSeen = Date.now(); // reset to avoid spamming
              }
            } else {
              lastFaceSeen = Date.now();
              if (faces.length > 1) {
                activeSocket?.emit('cheat_alert', { token: studentData.token, student: studentData, reason: 'تم اكتشاف أكثر من وجه في الكاميرا' });
              }
            }
          } catch (e) {
            // Ignore error
          }
        }, 1000); // check more frequently, alert if absent for > 3s
      }
    } catch (err) {
      console.warn("Camera access denied or unavailable", err);
      toast.error("تم رفض الوصول للكاميرا. سيتم إرسال تنبيه للمعلم.", { duration: 5000 });
      activeSocket?.emit('cheat_alert', { token: studentData.token, student, reason: 'رفض إعطاء صلاحية الكاميرا أو الكاميرا غير متوفرة' });
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(t => t.stop());
    }
  };

  const forceSubmit = (activeSocket: Socket | null) => {
    if (!activeSocket || !exam) return;
    performSubmission(activeSocket);
  };

  const performSubmission = (activeSocket: Socket) => {
    activeSocket.emit('submit_exam', {
      token: studentData.token,
      payload: {
        student: studentData,
        answers: answers,
        examId: exam.id,
        submittedAt: Date.now()
      }
    });
    
    // Generate dynamic info
    setHandoverInfo({
      accessToken: Math.floor(1000 + Math.random() * 9000).toString(),
      nextStudent: "الطالب التالي",
      nextCode: Math.floor(10000 + Math.random() * 90000).toString()
    });
    
    stopCamera();
    setStatus('submitted');
  };

  const handleRequestSubmit = () => {
    if (!socket || !exam) return;
    
    const totalQ = exam.questions.length;
    const answeredQ = Object.keys(answers).length;

    if (answeredQ < totalQ) {
       toast.error(`لقد أجبت على ${answeredQ} من ${totalQ} فقط. أكمل الباقي.`);
    }

    if (earlySubmitApproved) {
       if (window.confirm(`أنت متأكد؟ لديك ${Math.floor(timeLeft / 60)} دقيقة متبقية و ${totalQ - answeredQ} أسئلة فارغة.`)) {
          performSubmission(socket);
       }
    } else {
       socket.emit('request_early_submit', { token: studentData.token, student: studentData });
       setEarlySubmitRequested(true);
       toast('تم إرسال طلب للمراقب. يرجى الانتظار للموافقة.', { icon: '📡' });
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (status === 'disconnected') {
     return (
       <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
          <div className="bg-red-900/30 p-8 rounded-2xl border border-red-800 text-center max-w-md">
             <h2 className="text-2xl font-bold text-red-400 mb-4">انقطع الاتصال بالخادم</h2>
             <p className="text-slate-300 mb-6">يرجى التأكد من اتصالك بنفس الشبكة المحلية للمعلم.</p>
             <button onClick={onExit} className="bg-slate-800 text-white px-6 py-2 rounded-xl w-full">الرجوع</button>
          </div>
       </div>
     );
  }

  if (status === 'submitted') {
     return (
       <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
          <div className="bg-slate-900 p-8 rounded-3xl border border-slate-700 max-w-lg w-full text-center animate-in zoom-in duration-500 shadow-2xl relative overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-2 bg-emerald-500"></div>
             
             <CheckCircle2 size={80} className="mx-auto text-emerald-500 mb-6 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
             <h2 className="text-3xl font-bold text-white mb-4">تم تسليم إجاباتك بأمان!</h2>
             
             <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 mb-6 text-right">
                <p className="text-slate-300 mb-2 leading-relaxed">
                   سيتم عرض نتيجتك على هذا الجهاز بعد انتهاء جميع الجلسات باستخدام رمز الوصول الخاص بك:
                </p>
                <div className="text-center text-4xl font-mono font-bold text-blue-400 tracking-widest my-4">
                   {handoverInfo?.accessToken}
                </div>
             </div>

             <div className="bg-blue-900/20 p-4 rounded-xl border border-blue-800/50 mb-8 text-right">
                <p className="text-blue-200 leading-relaxed">
                   يرجى التزام الهدوء وإبلاغ الطالب التالي <strong className="text-blue-400">{handoverInfo?.nextStudent}</strong> للجلوس مكانك خلال 5 دقائق. رمز الدخول الخاص به هو:
                </p>
                <div className="text-center text-2xl font-mono font-bold text-emerald-400 tracking-widest mt-3">
                   {handoverInfo?.nextCode}
                </div>
             </div>
             
             <div className="text-slate-500 text-sm flex items-center justify-center gap-2">
               <Loader2 className="animate-spin" size={16} /> العودة للشاشة الرئيسية خلال {handoverCountdown} ثانية...
             </div>
          </div>
       </div>
     );
  }

  if (status === 'waiting') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative">
        <button onClick={onExit} className="absolute top-4 right-4 text-slate-500 hover:text-white p-2">
          <LogOut size={24} />
        </button>
        <div className="text-center space-y-6 max-w-sm">
          <div className="w-24 h-24 rounded-full bg-blue-900/30 border border-blue-500/50 mx-auto flex items-center justify-center relative overflow-hidden">
             <Loader2 size={48} className="text-blue-500 animate-spin absolute" />
          </div>
          <h2 className="text-3xl font-bold text-white">أهلاً بك يا {studentData.name}</h2>
          <p className="text-slate-400 leading-relaxed">أنت الآن في غرفة الانتظار.<br/>سيظهر الامتحان فوراً عندما يبدأ المعلم الجلسة.</p>
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-700">
             <p className="text-slate-500 mb-1 text-sm">رمز الجلسة</p>
             <p className="text-blue-400 font-mono text-3xl tracking-[0.3em] font-bold">{studentData.token}</p>
          </div>
        </div>
      </div>
    );
  }

  // Active Exam
  const questions = exam?.questions || [];
  const currentQ = questions[currentPage];
  const totalQ = questions.length;
  const answeredQ = Object.keys(answers).length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Status Bar */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4 sticky top-0 z-20 shadow-sm flex flex-col gap-3">
        <div className="flex justify-between items-center">
           <div>
             <h1 className="font-bold text-lg text-slate-800 dark:text-white">{exam?.title || 'الامتحان'}</h1>
             <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">الطالب: {studentData.name}</p>
           </div>
           
           {/* Timer */}
           <div className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold font-mono ${timeLeft < 300 ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 animate-pulse' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
              <Clock size={18} />
              {formatTime(timeLeft)}
           </div>
        </div>

        <div className="flex justify-between items-center text-sm">
           <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
             <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-3 py-1 rounded-full font-bold">السؤال {currentPage + 1} من {totalQ}</span>
             <span>|</span>
             <span className="text-amber-600 dark:text-amber-400">متبقي {totalQ - answeredQ} أسئلة</span>
           </div>
           
           <div className="flex items-center gap-2">
             <Camera size={16} className={cameraActive ? "text-emerald-500" : "text-red-500"} />
             <span className="text-xs text-slate-400">المراقبة نشطة</span>
           </div>
        </div>
        
        {/* Progress bar */}
        <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
          <div className="bg-blue-500 h-full transition-all duration-300" style={{ width: `${(answeredQ / totalQ) * 100}%` }}></div>
        </div>
      </header>

      {/* Hidden Proctoring Camera */}
      <video ref={videoRef} autoPlay playsInline muted className="hidden opacity-0 w-1 h-1 pointer-events-none" />

      {/* Body */}
      <main className="flex-1 p-4 md:p-6 max-w-4xl mx-auto w-full pb-32">
        {currentQ && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 animate-in fade-in slide-in-from-right-4 duration-300">
            <h3 className="font-bold text-xl md:text-2xl mb-6 text-slate-800 dark:text-white leading-relaxed">
               {currentPage + 1}. {currentQ.text}
            </h3>
            
            {currentQ.type === 'matching' && currentQ.matchingPairs && (
              <div className="space-y-4">
                <p className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-4">اختر الكلمة المناسبة لكل عنصر:</p>
                <div className="space-y-3">
                  {currentQ.matchingPairs.map((pair: any, idx: number) => {
                     const allRights = [...currentQ.matchingPairs].map(p => p.right).sort();
                     const currentAnswers = answers[currentQ.id] || {};
                     return (
                        <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                           <div className="flex-1 font-semibold text-slate-700 dark:text-slate-200">{pair.left}</div>
                           <select
                              value={currentAnswers[pair.left] || ''}
                              onChange={(e) => setAnswers(prev => ({...prev, [currentQ.id]: {...(prev[currentQ.id] || {}), [pair.left]: e.target.value}}))}
                              className="flex-1 p-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:border-blue-500"
                           >
                              <option value="" disabled>اختر...</option>
                              {allRights.map((r: string, i: number) => <option key={i} value={r}>{r}</option>)}
                           </select>
                        </div>
                     )
                  })}
                </div>
              </div>
            )}
            {currentQ.type === 'image_labeling' && (
               <div className="mb-6 bg-slate-100 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="aspect-video bg-slate-200 dark:bg-slate-800 rounded-lg flex items-center justify-center text-slate-400 mb-4 overflow-hidden relative">
                     {currentQ.imageDescription ? (
                        <div className="text-center p-4">
                          <p>[صورة توضيحية: {currentQ.imageDescription}]</p>
                        </div>
                     ) : (
                        <span>مكان الصورة</span>
                     )}
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300">أدخل البيانات حسب الأرقام الموجودة في الصورة:</p>
                    {[1,2,3,4].map(num => (
                      <div key={num} className="flex items-center gap-3">
                         <span className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold">{num}</span>
                         <input 
                           type="text" 
                           placeholder="اكتب التسمية..." 
                           value={answers[`${currentQ.id}_label_${num}`] || ''}
                           onChange={(e) => setAnswers(prev => ({...prev, [`${currentQ.id}_label_${num}`]: e.target.value}))}
                           className="flex-1 p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-blue-500"
                         />
                      </div>
                    ))}
                  </div>
               </div>
            )}

            {currentQ.type === 'mcq' && currentQ.options && (
              <div className="space-y-3">
                {Object.entries(currentQ.options).map(([key, val]) => (
                  <label key={key} className={`flex items-center p-4 rounded-xl border-2 cursor-pointer transition-all ${answers[currentQ.id] === key ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-950'}`}>
                    <input 
                      type="radio" 
                      name={`q_${currentQ.id}`} 
                      value={key}
                      checked={answers[currentQ.id] === key}
                      onChange={() => setAnswers(prev => ({...prev, [currentQ.id]: key}))}
                      className="w-5 h-5 ml-4 accent-blue-600"
                    />
                    <span className="font-semibold text-lg text-slate-700 dark:text-slate-200">{key}) {val as string}</span>
                  </label>
                ))}
              </div>
            )}

            {(currentQ.type === 'short_answer' || currentQ.type === 'fill_blanks') && (
               <textarea
                 rows={4}
                 value={answers[currentQ.id] || ''}
                 onChange={(e) => setAnswers(prev => ({...prev, [currentQ.id]: e.target.value}))}
                 placeholder="اكتب إجابتك هنا بوضوح..."
                 className="w-full p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-blue-500 resize-none text-lg"
               />
            )}

            {currentQ.type === 'true_false' && (
               <div className="flex gap-4">
                 <button 
                   onClick={() => setAnswers(prev => ({...prev, [currentQ.id]: 'true'}))}
                   className={`flex-1 p-6 rounded-xl border-2 font-bold text-xl transition-all ${answers[currentQ.id] === 'true' ? 'bg-emerald-500 text-white border-emerald-600 shadow-md transform scale-[1.02]' : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-500/50'}`}
                 >صح</button>
                 <button 
                   onClick={() => setAnswers(prev => ({...prev, [currentQ.id]: 'false'}))}
                   className={`flex-1 p-6 rounded-xl border-2 font-bold text-xl transition-all ${answers[currentQ.id] === 'false' ? 'bg-red-500 text-white border-red-600 shadow-md transform scale-[1.02]' : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-red-500/50'}`}
                 >خطأ</button>
               </div>
            )}
          </div>
        )}
      </main>

      {/* Bottom Navigation Bar */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 z-20">
        <div className="max-w-4xl mx-auto w-full flex justify-between items-center gap-4">
           <button 
             onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
             disabled={currentPage === 0}
             className="flex-1 md:flex-none flex justify-center items-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-800 dark:text-white px-6 py-4 rounded-xl font-bold transition-colors"
           >
             <ChevronRight size={20} /> السابق
           </button>

           {currentPage === totalQ - 1 ? (
              <button 
                onClick={handleRequestSubmit}
                className={`flex-[2] md:flex-none flex justify-center items-center gap-2 text-white px-8 py-4 rounded-xl font-bold transition-all shadow-lg ${earlySubmitApproved ? 'bg-emerald-600 hover:bg-emerald-700 animate-pulse' : earlySubmitRequested ? 'bg-amber-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                <CheckCircle2 size={24} /> 
                {earlySubmitApproved ? 'تأكيد التسليم النهائي' : earlySubmitRequested ? 'في انتظار موافقة المراقب...' : 'إنهاء وتسليم'}
              </button>
           ) : (
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalQ - 1, p + 1))}
                className="flex-[2] md:flex-none flex justify-center items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl font-bold transition-colors shadow-lg shadow-blue-500/30"
              >
                التالي <ChevronLeft size={20} />
              </button>
           )}
        </div>
      </footer>
    </div>
  );
}
