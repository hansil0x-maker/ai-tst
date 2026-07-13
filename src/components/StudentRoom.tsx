import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import { Loader2, LogOut, CheckCircle2, ChevronRight, ChevronLeft, AlertTriangle, ShieldCheck, Clock, Camera } from 'lucide-react';

export default function StudentRoom({ studentData, onExit }: { studentData: any, onExit: () => void }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<'waiting' | 'active' | 'submitted' | 'disconnected'>('waiting');
  const [exam, setExam] = useState<any>(null);
  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(0);
  
  // Timer & Toasts
  const [timeLeft, setTimeLeft] = useState(60 * 60); // 60 minutes default
  const [earlySubmitRequested, setEarlySubmitRequested] = useState(false);
  const [earlySubmitApproved, setEarlySubmitApproved] = useState(false);
  
  // Anti-cheat
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);

  const [fullStudentData, setFullStudentData] = useState<any>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [wipeoutCountdown, setWipeoutCountdown] = useState<number | null>(null);
  const [resultView, setResultView] = useState<any>(null);

  const statusRef = useRef(status);
  const sessionTokenRef = useRef(sessionToken);
  const fullStudentDataRef = useRef(fullStudentData);
  const onExitRef = useRef(onExit);
  const answersRef = useRef(answers);
  const examRef = useRef(exam);
  
  useEffect(() => {
    statusRef.current = status;
    sessionTokenRef.current = sessionToken;
    fullStudentDataRef.current = fullStudentData;
    onExitRef.current = onExit;
    answersRef.current = answers;
    examRef.current = exam;
  }, [status, sessionToken, fullStudentData, onExit, answers, exam]);

  useEffect(() => {
    if (wipeoutCountdown !== null && wipeoutCountdown > 0) {
      const timer = setInterval(() => {
        setWipeoutCountdown(prev => (prev !== null ? prev - 1 : null));
      }, 1000);
      return () => clearInterval(timer);
    } else if (wipeoutCountdown === 0) {
      setExam(null);
      setAnswers({});
      setFullStudentData(null);
      setSessionToken(null);
      setResultView(null);
      onExitRef.current();
    }
  }, [wipeoutCountdown]);

  useEffect(() => {
    const newSocket = io('/', { path: '/socket.io' });
    
    newSocket.on('connect', () => {
      newSocket.emit('validate_otp', { otp: studentData.otp }, (res: any) => {
        if (!res.success) {
          toast.error(res.error || 'الكود غير صحيح');
          onExitRef.current();
        } else {
          setFullStudentData(res.student);
          setSessionToken(res.token);
          newSocket.emit('join_session', { token: res.token, student: res.student }, (joinRes: any) => {
             if (!joinRes.success) {
                toast.error('فشل الانضمام للغرفة');
                onExitRef.current();
             } else {
                toast.success('تم قبول الكود بنجاح');
                setStatus('waiting');
             }
          });
        }
      });
    });

    newSocket.on('receive_exam', (examPayload) => {
      setExam(examPayload);
      setStatus('active');
      setShowInstructions(true);
      setTimeLeft(examPayload.duration ? examPayload.duration * 60 : 60 * 60);
      toast('تم بدء الامتحان، نتمنى لك التوفيق!', { icon: '🚀', duration: 4000 });
      startCameraProctoring(newSocket, fullStudentDataRef.current);
    });

    newSocket.on('teacher_message', (data) => {
      toast(data.message, { icon: '💬', duration: 6000, style: { background: '#3b82f6', color: '#fff' } });
    });

    newSocket.on('results_published', (data) => {
      const { resultsList } = data;
      const existing = JSON.parse(localStorage.getItem('nexus_published_results') || '{}');
      resultsList.forEach((r: any) => {
         existing[r.accessToken] = r.resultData;
         if (r.resultData.studentName === fullStudentDataRef.current?.name) {
            setResultView(r.resultData);
         }
      });
      localStorage.setItem('nexus_published_results', JSON.stringify(existing));
    });

    newSocket.on('session_closed', () => {
      if (statusRef.current === 'active') {
        toast.error('أغلق المعلم الجلسة. سيتم تسليم إجاباتك.');
        forceSubmit(newSocket);
      }
      setWipeoutCountdown(10);
    });

    newSocket.on('disconnect', () => {
      setStatus('disconnected');
    });

    newSocket.on('early_submit_approved', () => {
      setEarlySubmitApproved(true);
      toast.success('وافق المعلم على التسليم المبكر. يرجى تأكيد التسليم.');
    });

    setSocket(newSocket);

    const handleVisibilityChange = () => {
      if (document.hidden && statusRef.current === 'active') {
         toast.error('تحذير: لا تخرج من شاشة الامتحان!');
         newSocket.emit('cheat_alert', { token: sessionTokenRef.current, student: fullStudentDataRef.current, reason: 'الطالب خرج من شاشة الامتحان (تبديل تطبيقات أو متصفح)' });
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      newSocket.disconnect();
      stopCamera();
    };
  }, [studentData, onExit]);
  // Timer logic
  useEffect(() => {
    if (status === 'active') {
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          const totalTime = (exam?.duration || 60) * 60;
          const halfTime = Math.floor(totalTime / 2);
          
          if (prev === halfTime) {
            toast('انقضى نصف الوقت، راجع إجاباتك', { icon: '⏳', duration: 5000 });
          }
          if (prev === 5 * 60 && totalTime > 10 * 60) {
            toast('5 دقائق متبقية (5 minutes remaining)', { icon: '⏰', duration: 5000 });
          }
          if (prev === 1 * 60) {
            toast('دقيقة واحدة متبقية! يرجى إنهاء الإجابة.', { icon: '⚠️', duration: 5000, style: { background: '#ef4444', color: '#fff' } });
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
                 activeSocket?.emit('cheat_alert', { token: sessionToken, student: fullStudentData, reason: 'لم يتم اكتشاف وجه (الطالب لا ينظر للشاشة لأكثر من 3 ثوانٍ)' });
                 lastFaceSeen = Date.now(); // reset to avoid spamming
              }
            } else {
              lastFaceSeen = Date.now();
              if (faces.length > 1) {
                activeSocket?.emit('cheat_alert', { token: sessionToken, student: fullStudentData, reason: 'تم اكتشاف أكثر من وجه في الكاميرا' });
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
      activeSocket?.emit('cheat_alert', { token: sessionToken, student: fullStudentData, reason: 'رفض إعطاء صلاحية الكاميرا أو الكاميرا غير متوفرة' });
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(t => t.stop());
    }
  };

  const forceSubmit = (activeSocket: Socket | null) => {
    if (!activeSocket || !examRef.current) return;
    performSubmission(activeSocket);
  };

  const performSubmission = (activeSocket: Socket) => {
    activeSocket.emit('submit_exam', {
      token: sessionTokenRef.current,
      payload: {
        student: fullStudentDataRef.current,
        answers: answersRef.current,
        examId: examRef.current.id,
        submittedAt: Date.now()
      }
    });

    
    // Generate dynamic info
    const newAccessCode = Math.floor(1000 + Math.random() * 9000).toString();
    
    // Save to local mapping so we can attach it when teacher grades
    const pendingResults = JSON.parse(localStorage.getItem('nexus_pending_results') || '{}');
    if (fullStudentDataRef.current?.name) {
       pendingResults[fullStudentDataRef.current.name] = newAccessCode;
       localStorage.setItem('nexus_pending_results', JSON.stringify(pendingResults));
    }

    setAccessCode(newAccessCode);
    //




    
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
       socket.emit('request_early_submit', { token: sessionToken, student: fullStudentData });
       setEarlySubmitRequested(true);
       toast('تم إرسال طلب للمراقب. يرجى الانتظار للموافقة.', { icon: '📡' });
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const wipeoutOverlay = wipeoutCountdown !== null ? (
    <div className="fixed inset-0 z-[100] bg-red-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
       <AlertTriangle size={80} className="text-red-500 mb-6 animate-bounce" />
       <h1 className="text-4xl font-black text-white mb-4 text-center leading-relaxed">
          تنبيه لتطهير الجهاز وبدء الجلسة التالية
       </h1>
       <div className="text-9xl font-black text-red-500 my-8 font-mono tabular-nums">
          {wipeoutCountdown}
       </div>
       <p className="text-2xl text-red-200 text-center font-bold">
          سيتم إغلاق الشاشة وإخفاء بياناتك الحالية فور انتهاء العداد...
       </p>
    </div>
  ) : null;

  if (status === 'disconnected') {
     return (
       <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
          {wipeoutOverlay}
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
          {wipeoutOverlay}
          {!resultView ? (
             <div className="bg-slate-900 p-8 rounded-3xl border border-slate-700 max-w-lg w-full text-center animate-in zoom-in duration-500 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-emerald-500"></div>
                
                <CheckCircle2 size={80} className="mx-auto text-emerald-500 mb-6 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
                <h2 className="text-3xl font-bold text-white mb-4">تم تسليم إجاباتك بأمان!</h2>
                
                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 mb-6 text-center">
                   <p className="text-slate-300 mb-2 leading-relaxed">
                      يرجى التزام الهدوء والانتظار في مكانك حتى ينشر المعلم النتيجة أو يغلق الجلسة.
                   </p>
                   {accessCode && (
                     <div className="mt-4 p-4 bg-slate-900 rounded-lg border border-emerald-900/50">
                        <p className="text-sm text-slate-400 mb-1">رمز وصولك للنتيجة لاحقاً:</p>
                        <p className="text-2xl font-mono font-bold text-emerald-400 tracking-widest">{accessCode}</p>
                     </div>
                   )}
                   <Loader2 className="mx-auto mt-4 text-blue-500 animate-spin" size={32} />
                </div>
             </div>
          ) : (
             <div className="bg-slate-900 p-8 rounded-3xl border border-slate-700 max-w-2xl w-full text-right animate-in zoom-in duration-500 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-blue-500"></div>
                
                <h2 className="text-3xl font-bold text-white mb-6 text-center">نتيجة التقييم</h2>
                
                <div className="flex items-center justify-between bg-slate-800 p-6 rounded-2xl border border-slate-700 mb-6">
                   <div className="text-center">
                      <span className="block text-sm text-slate-400 mb-1">الدرجة الكلية</span>
                      <strong className="text-3xl text-white font-mono">{resultView.score} / {exam?.totalMarks}</strong>
                   </div>
                   <div className="text-center">
                      <span className="block text-sm text-slate-400 mb-1">النسبة المئوية</span>
                      <strong className={`text-4xl font-mono font-black ${resultView.percentage >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{resultView.percentage}%</strong>
                   </div>
                   <div className="text-center">
                      <span className="block text-sm text-slate-400 mb-1">التقدير</span>
                      <strong className={`text-2xl ${resultView.category === 'Perfect' ? 'text-purple-400' : resultView.category === 'Pass' ? 'text-emerald-400' : 'text-red-400'}`}>
                         {resultView.category === 'Perfect' ? 'متفوق' : resultView.category === 'Pass' ? 'ناجح' : 'راسب'} ({resultView.letterGrade})
                      </strong>
                   </div>
                </div>

                {resultView.aiFeedback && (
                   <div className="bg-blue-900/20 p-5 rounded-2xl border border-blue-800/50 mb-6">
                      <h3 className="text-blue-400 font-bold mb-2 flex items-center gap-2"><CheckCircle2 size={18} /> تعليق المعلم الذكي</h3>
                      <p className="text-blue-100 leading-relaxed text-xl leading-loose">{resultView.aiFeedback}</p>
                   </div>
                )}

                {resultView.mistakes && resultView.mistakes.length > 0 && (
                   <div className="mt-8">
                      <h3 className="text-xl font-bold text-slate-200 mb-4 border-b border-slate-700 pb-2">سجل الأخطاء للتعلم ({resultView.mistakes.length})</h3>
                      <div className="space-y-4">
                         {resultView.mistakes.map((m: any, idx: number) => (
                            <div key={idx} className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                               <p className="text-slate-300 font-bold mb-3"><span className="text-red-400">سؤال:</span> {m.questionText}</p>
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3 text-sm">
                                  <div className="bg-red-900/20 p-3 rounded-lg border border-red-900/50">
                                     <p className="text-red-400 mb-1">إجابتك (خاطئة):</p>
                                     <p className="text-white font-bold">{m.studentAnswer || '(فارغ)'}</p>
                                  </div>
                                  <div className="bg-emerald-900/20 p-3 rounded-lg border border-emerald-900/50">
                                     <p className="text-emerald-400 mb-1">الإجابة الصحيحة:</p>
                                     <p className="text-white font-bold">{m.correctAnswer}</p>
                                  </div>
                               </div>
                               <div className="bg-amber-900/10 p-3 rounded-lg border border-amber-900/30">
                                  <p className="text-amber-500 text-xs mb-1">تبرير التصحيح التلقائي:</p>
                                  <p className="text-amber-200/80 text-sm">{m.explanation}</p>
                               </div>
                            </div>
                         ))}
                      </div>
                   </div>
                )}
             </div>
          )}
       </div>
     );
  }

  if (status === 'waiting') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative">
        {wipeoutOverlay}
        <button onClick={onExit} className="absolute top-4 right-4 text-slate-500 hover:text-white p-2">
          <LogOut size={24} />
        </button>
        <div className="text-center space-y-6 max-w-sm">
          <div className="w-24 h-24 rounded-full bg-blue-900/30 border border-blue-500/50 mx-auto flex items-center justify-center relative overflow-hidden">
             <Loader2 size={48} className="text-blue-500 animate-spin absolute" />
          </div>
          <h2 className="text-3xl font-bold text-white">أهلاً بك يا {fullStudentData?.name}</h2>
          <p className="text-slate-400 leading-relaxed">أنت الآن في غرفة الانتظار.<br/>سيظهر الامتحان فوراً عندما يبدأ المعلم الجلسة.</p>
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-700">
             <p className="text-slate-500 mb-1 text-sm">كود الدخول الخاص بك</p>
             <p className="text-blue-400 font-mono text-3xl tracking-[0.3em] font-bold">{studentData.otp}</p>
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

  if (showInstructions) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="bg-slate-900 p-8 rounded-3xl border border-slate-700 max-w-lg w-full shadow-2xl relative overflow-hidden animate-in fade-in zoom-in duration-300">
           <div className="absolute top-0 left-0 w-full h-2 bg-blue-500"></div>
           <ShieldCheck size={64} className="mx-auto text-blue-500 mb-6" />
           <h2 className="text-3xl font-bold text-white text-center mb-6">تعليمات الامتحان</h2>
           
           <ul className="text-slate-300 space-y-4 mb-8 text-right list-disc list-inside">
             <li>ممنوع الخروج من متصفح الامتحان أو فتح علامات تبويب أخرى.</li>
             <li>الكاميرا تلتقط صورتك للتأكد من عدم وجود أشخاص آخرين.</li>
             <li>استمر في التركيز وحل الأسئلة في الوقت المحدد.</li>
             <li>يمكنك طلب إنهاء الامتحان مبكراً وسينظر المعلم في طلبك.</li>
           </ul>

           <button 
             onClick={() => setShowInstructions(false)}
             className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xl py-4 rounded-xl transition-colors shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2"
           >
             <CheckCircle2 size={24} />
             فهمت التعليمات، ابدأ
           </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {wipeoutOverlay}
      {/* Top Status Bar */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4 sticky top-0 z-20 shadow-sm flex flex-col gap-3">
         <div className="flex justify-between items-center">
           <div>
             <h1 className="font-bold text-lg text-slate-800 dark:text-white">{exam?.title || 'الامتحان'}</h1>
             <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">الطالب: {fullStudentData?.name}</p>
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
            <h3 className="font-bold text-xl md:text-2xl mb-8 text-slate-800 dark:text-white leading-[1.8] border-b border-slate-200 dark:border-slate-800 pb-6">
               {currentPage + 1}. {currentQ.text}
            </h3>
            
            {(currentQ.type === 'matching' || currentQ.type === 'match') && currentQ.matchingPairs && (
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
            {(currentQ.type === 'image_labeling' || currentQ.type === 'diagram') && (
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

            {(currentQ.type === 'short_answer' || currentQ.type === 'fill_blanks' || currentQ.type === 'short' || currentQ.type === 'fill') && (
               <textarea
                 rows={6}
                 value={answers[currentQ.id] || ''}
                 onChange={(e) => setAnswers(prev => ({...prev, [currentQ.id]: e.target.value}))}
                 placeholder="اكتب إجابتك هنا بوضوح..."
                 className="w-full p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-blue-500 resize-none text-lg"
               />
            )}

            {(currentQ.type === 'true_false' || currentQ.type === 'tf') && (
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
