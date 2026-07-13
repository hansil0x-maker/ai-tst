import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import { Users, Send, CheckCircle2, ShieldAlert } from 'lucide-react';
import { db } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';

export default function LiveExamDashboard() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [earlyRequests, setEarlyRequests] = useState<any[]>([]);
  const [pendingRegistrations, setPendingRegistrations] = useState<any[]>([]);
  const [showSessionOptions, setShowSessionOptions] = useState(false);
  const [saveStudentsPermanently, setSaveStudentsPermanently] = useState(true);
  
  const [totalStudents, setTotalStudents] = useState<number | string>(30);
  const [availableDevices, setAvailableDevices] = useState<number | string>(4);
  const [sessionDuration, setSessionDuration] = useState<number | string>(30);
  const [currentBatchIndex, setCurrentBatchIndex] = useState<number>(0);
  const [selectedClassId, setSelectedClassId] = useState<number>(0);
  const [selectedExamId, setSelectedExamId] = useState<number>(0);
  const [absentStudentIds, setAbsentStudentIds] = useState<number[]>([]);
  const [swapStudentModal, setSwapStudentModal] = useState<{otp: string, student: any} | null>(null);
  
  const [sessionOtps, setSessionOtps] = useState<Record<string, any>>({});
  const [quickMessage, setQuickMessage] = useState('');
  const [aiReport, setAiReport] = useState<any>(null);
  const [gradedResults, setGradedResults] = useState<any[]>([]);
  
  const classes = useLiveQuery(() => db.classes.toArray());
  const settings = useLiveQuery(() => db.settings.get(1));
  const allStudents = useLiveQuery(() => db.students.toArray());
  const exams = useLiveQuery(() => db.exams.toArray());

  const [showSessionsLog, setShowSessionsLog] = useState(false);
  const examSessionsLog = useLiveQuery(() => db.examSessions.toArray()) || [];

  useEffect(() => {
    const newSocket = io('/', { path: '/socket.io' });
    
    newSocket.on('connect', () => {
      // ready
    });

    newSocket.on('student_joined', (student) => {
      setStudents(prev => {
         const existing = prev.find(s => s.id === student.id);
         if (existing) return prev;
         return [...prev, student];
      });
      toast.success(`انضم الطالب: ${student.name}`);
    });
    
    newSocket.on('student_left', (data) => {
      setStudents(prev => prev.filter(s => s.id !== data.id));
    });

    
    newSocket.on('student_cheat_alert', (data) => {
      setAlerts(prev => [...prev, data]);
      toast.error(`تنبيه غش: ${data.student.name} - ${data.reason}`);
    });

    newSocket.on('student_register_request', (data) => {
      setPendingRegistrations(prev => [...prev, data]);
      toast(`طلب تسجيل جديد من: ${data.name}`, { icon: '👤' });
    });

    newSocket.on('student_early_submit_request', (data) => {
      setEarlyRequests(prev => [...prev, data]);
      toast('طلب تسليم مبكر من: ' + data.student.name, { icon: '⏳' });
    });

    newSocket.on('student_submission', (submission) => {
      setSubmissions(prev => [...prev, submission]);
      toast.success(`استلام إجابة: ${submission.student.name}`);
      // Here you would save to db.submissions
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  
  const handleApproveRegistration = async (req: any) => {
    if (socket && sessionToken) {
      try {
        let studentId = 0;
        if (saveStudentsPermanently) {
          studentId = await db.students.add({
             name: req.name,
             classId: selectedClassId,
             serialNumber: Math.floor(1000 + Math.random() * 9000).toString()
          });
        } else {
          studentId = Math.floor(Math.random() * 1000000);
        }
        
        let otp;
        do {
          otp = Math.floor(1000 + Math.random() * 9000).toString();
        } while (sessionOtps[otp]);
        
        const newOtps = { ...sessionOtps, [otp]: { id: studentId, name: req.name, classId: selectedClassId, used: false } };
        setSessionOtps(newOtps);
        
        // Notify server
        socket.emit('register_session_otps', { token: sessionToken, otpsMap: newOtps });
        socket.emit('approve_student_register', { studentSocketId: req.socketId, otp, name: req.name });
        
        setPendingRegistrations(prev => prev.filter(r => r.socketId !== req.socketId));
        toast.success(`تم قبول ${req.name} وإرسال الكود`);
      } catch (err) {
         toast.error('حدث خطأ أثناء حفظ الطالب');
      }
    }
  };

  const handleApproveEarly = (req: any) => {
    if (socket) {
      socket.emit('approve_early_submit', { studentSocketId: req.socketId });
      setEarlyRequests(prev => prev.filter(r => r.socketId !== req.socketId));
      toast.success('تمت الموافقة على التسليم المبكر');
    }
  };

  const handleCreateSessionPrompt = () => {
    if (!socket || selectedClassId === 0 || selectedExamId === 0) {
      toast.error('يرجى اختيار الفصل والامتحان أولاً');
      return;
    }
    setShowSessionOptions(true);
  };

    const handleNumberChange = (setter: any, val: string) => {
    if (val === '') {
      setter('');
    } else {
      const num = parseInt(val);
      if (isNaN(num)) return;
      if (num > 200 || num < 1) {
        toast.error('يرجى إدخال رقم منطقي', { id: 'num_warn' });
      }
      setter(num);
    }
  };

  const handleCreateSessionDirect = () => {
    // 1. Get available students
    const classStudents = allStudents?.filter(s => s.classId === selectedClassId && !absentStudentIds.includes(s.id!)) || [];
    if (classStudents.length === 0) {
      toast.error('لا يوجد طلاب متاحين في هذا الفصل');
      return;
    }
    
    // 2. Select batch based on currentBatchIndex
    const batchStart = currentBatchIndex * availableDevices;
    const batch = classStudents.slice(batchStart, batchStart + availableDevices);

    if (batch.length === 0) {
      toast.error('تم الانتهاء من جميع الطلاب المتاحين في هذا الفصل');
      return;
    }
    
    // 3. Generate OTPs
    const otpsMap: Record<string, any> = {};
    batch.forEach(student => {
      let otp;
      do {
        otp = Math.floor(1000 + Math.random() * 9000).toString();
      } while (otpsMap[otp]); // Ensure no collisions locally
      otpsMap[otp] = { id: student.id, name: student.name, classId: student.classId, used: false };
    });
    
    setSessionOtps(otpsMap);

    const exam = exams?.find(e => e.id === selectedExamId);
    const cls = classes?.find(c => c.id === selectedClassId);

    socket.emit('create_session', { examTitle: exam?.title, className: cls?.name }, async (res: any) => {
      if (res.success) {
        setSessionToken(res.token);
        setStudents([]);
        setSubmissions([]);
        setGradedResults([]);
        setAiReport(null);
        setShowSessionOptions(false);
        
        socket.emit('register_session_otps', { token: res.token, otpsMap });
        
        // Save to DB
        await db.examSessions.add({
          sessionToken: res.token,
          examId: selectedExamId,
          batchNumber: currentBatchIndex + 1,
          createdAt: Date.now()
        });
        
        toast.success(`تم إنشاء الجلسة (الدفعة ${currentBatchIndex + 1}) وتوليد الأكواد بنجاح`);
      }
    });
  };

  const handleEndSession = () => {
    if (sessionToken && socket) {
      socket.emit('end_session', { token: sessionToken });
    }
    setSessionToken(null);
  };

  const handleNextBatch = () => {
    setCurrentBatchIndex(prev => prev + 1);
    handleEndSession();
    setTimeout(() => {
      handleCreateSessionDirect();
    }, 100); // slight delay to allow state reset
  };

  const handleCreateSessionInvite = () => {
    const exam = exams?.find(e => e.id === selectedExamId);
    const cls = classes?.find(c => c.id === selectedClassId);

    setSessionOtps({});
    socket.emit('create_session', { examTitle: exam?.title, className: cls?.name }, async (res: any) => {
      if (res.success) {
        setSessionToken(res.token);
        setStudents([]);
        setSubmissions([]);
        setGradedResults([]);
        setAiReport(null);
        setShowSessionOptions(false);
        
        // Save to DB
        await db.examSessions.add({
          sessionToken: res.token,
          examId: selectedExamId,
          batchNumber: currentBatchIndex + 1,
          createdAt: Date.now()
        });
        
        toast.success(`تم فتح نقطة اتصال: ${res.token}`);
      }
    });
  };

  const handleMarkAbsent = (studentId: number) => {
     setAbsentStudentIds(prev => [...prev, studentId]);
     toast('تم تسجيل غياب الطالب، يرجى إعادة إنشاء الجلسة لتحديث القائمة.', { icon: '🔄' });
  };

  const handleSendQuickMessage = () => {
     if (!socket || !sessionToken || quickMessage.trim() === '') return;
     socket.emit('teacher_message', { token: sessionToken, message: quickMessage });
     toast.success('تم إرسال الرسالة للطلاب');
     setQuickMessage('');
  };

  const handleSendExam = async () => {
    if (!socket || !sessionToken || selectedExamId === 0) {
      toast.error('يرجى اختيار امتحان أولاً');
      return;
    }
    
    const exam = exams?.find(e => e.id === selectedExamId);
    if (!exam) return;
    
    // Inject custom duration for the session so it overrides the default exam duration
    const customExamPayload = {
      ...exam,
      duration: sessionDuration
    };

    socket.emit('send_exam', {
      token: sessionToken,
      examPayload: customExamPayload,
      durationMinutes: sessionDuration
    });
    
    toast.success('تم إرسال الامتحان للطلاب وتم بدء المؤقت');
  };

  const handleSmartGrading = async () => {
    const toastId = toast.loading('جاري التصحيح الذكي للإجابات...');
    try {
      const exam = exams?.find(e => e.id === selectedExamId);
      if (!exam) throw new Error('Exam not found');
      
      const glossary = await db.glossary.where('examId').equals(selectedExamId).toArray();
      const glossaryMap = new Map();
      glossary.forEach(g => glossaryMap.set(`${g.questionId}_${g.normalizedAnswer}`, g.isCorrect));

      const answersToGrade: any[] = [];
      const evaluatedResults: any[] = [];

      submissions.forEach(sub => {
         const evaluatedAnswers: Record<number, any> = {};
         let preScore = 0;
         
         exam.questions.forEach((q: any) => {
            const stAns = sub.answers[q.id] || '';
            const isExactMatchTypes = ['mcq', 'tf', 'true_false'];
            
            if (isExactMatchTypes.includes(q.type)) {
               const isCorrect = stAns === q.correctAnswer;
               evaluatedAnswers[q.id] = { studentAnswer: stAns, isCorrect, confidenceScore: isCorrect ? 100 : 0 };
               if (isCorrect) preScore++;
            } else {
               const normalized = stAns.trim().toLowerCase();
               const glossKey = `${q.id}_${normalized}`;
               if (glossaryMap.has(glossKey)) {
                  const isCorrect = glossaryMap.get(glossKey);
                  evaluatedAnswers[q.id] = { studentAnswer: stAns, isCorrect, confidenceScore: 100, explanation: 'معتمد مسبقاً من قاموس الإجابات' };
                  if (isCorrect) preScore++;
               } else if (!stAns.trim()) {
                  evaluatedAnswers[q.id] = { studentAnswer: stAns, isCorrect: false, confidenceScore: 0, explanation: 'إجابة فارغة' };
               } else {
                  answersToGrade.push({
                     evalId: `${sub.student.name}_${q.id}`,
                     studentName: sub.student.name,
                     questionId: q.id,
                     studentAnswer: stAns,
                     expectedAnswer: q.correctAnswer,
                     explanation: q.explanation || ''
                  });
                  evaluatedAnswers[q.id] = { studentAnswer: stAns, isCorrect: false, needsReview: true };
               }
            }
         });
         
         evaluatedResults.push({
            studentName: sub.student.name,
            studentId: sub.student.id,
            scannedAnswers: sub.answers,
            evaluatedAnswers,
            preScore
         });
      });

      if (answersToGrade.length > 0) {
          const res = await fetch('/api/grade-digital-submissions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ answersToGrade })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);

          const evals = data.evaluations || [];
          const evalMap = new Map();
          evals.forEach((e: any) => evalMap.set(e.evaluationId, e));

          evaluatedResults.forEach(er => {
              exam.questions.forEach((q: any) => {
                  const evId = `${er.studentName}_${q.id}`;
                  if (evalMap.has(evId)) {
                      const aiEv = evalMap.get(evId);
                      const isCorrect = aiEv.grade === 'correct';
                      const needsReview = aiEv.grade === 'review';
                      
                      er.evaluatedAnswers[q.id] = {
                         studentAnswer: er.evaluatedAnswers[q.id].studentAnswer,
                         isCorrect,
                         confidenceScore: aiEv.confidenceScore,
                         explanation: aiEv.explanation,
                         needsReview
                      };
                      if (isCorrect) er.preScore++;
                  }
              });
          });
      }

      const finalGradedSubmissions: any[] = [];
      const pendingResults = JSON.parse(localStorage.getItem('nexus_pending_results') || '{}');

      for (const er of evaluatedResults) {
          const percentage = Math.round((er.preScore / exam.totalMarks) * 100);
          let category = 'Pass';
          let letterGrade = 'C';
          let verbalGrade = 'جيد';
          if (percentage >= 90) { category = 'Perfect'; letterGrade = 'A'; verbalGrade = 'امتياز'; }
          else if (percentage >= 80) { category = 'Pass'; letterGrade = 'B'; verbalGrade = 'جيد جداً'; }
          else if (percentage >= 65) { category = 'Pass'; letterGrade = 'C'; verbalGrade = 'جيد'; }
          else if (percentage >= 50) { category = 'Pass'; letterGrade = 'D'; verbalGrade = 'مقبول'; }
          else { category = 'Fail'; letterGrade = 'F'; verbalGrade = 'ضعيف'; }
          
          let academicStatus = 'ناجح';
          if (percentage >= 90) academicStatus = 'متفوق';
          else if (percentage >= 50 && percentage < 65) academicStatus = 'مكمل';
          else if (percentage < 50) academicStatus = 'راسب';

          const hasReview = Object.values(er.evaluatedAnswers).some((ans: any) => ans.needsReview);

          const mistakes: any[] = [];
          exam.questions.forEach((q: any) => {
             const ans = er.evaluatedAnswers[q.id];
             if (ans && !ans.isCorrect && !ans.needsReview) {
                mistakes.push({
                   questionText: q.text,
                   studentAnswer: ans.studentAnswer,
                   correctAnswer: q.options ? q.options[q.correctAnswer] || q.correctAnswer : q.correctAnswer,
                   explanation: ans.explanation || 'غير متطابق مع نموذج الإجابة'
                });
             }
          });

          const aiFeedbackBase = percentage >= 90 ? 'أداء مبهر! واصل هذا التفوق.' :
                                 percentage >= 75 ? 'مستوى جيد جداً، انتبه لبعض الأخطاء البسيطة.' :
                                 percentage >= 50 ? 'لقد نجحت، ولكن تحتاج إلى مراجعة شاملة للأسئلة التي أخطأت فيها.' :
                                 'لا تستسلم، راجع سجل أخطائك وركز على نقاط ضعفك.';

          const finalSub = {
             studentName: er.studentName,
             score: er.preScore,
             percentage,
             category,
             verbalGrade,
             academicStatus,
             letterGrade,
             mistakes,
             aiFeedback: hasReview ? 'توجد إجابات تحتاج إلى مراجعة يدوية' : aiFeedbackBase,
             evaluatedAnswers: er.evaluatedAnswers,
             needsReview: hasReview
          };
          finalGradedSubmissions.push(finalSub);

          const accessToken = pendingResults[er.studentName] || Math.floor(1000 + Math.random() * 9000).toString();
          
          await db.results.add({
             examId: selectedExamId,
             studentId: er.studentId,
             studentName: er.studentName,
             scannedAnswers: er.scannedAnswers,
             evaluatedAnswers: er.evaluatedAnswers,
             score: er.preScore,
             percentage,
             category: category as any,
             isCheatSuspected: false,
             needsGrading: hasReview
          });
          
          pendingResults[er.studentName] = accessToken;
      }
      
      localStorage.setItem('nexus_pending_results', JSON.stringify(pendingResults));
      setGradedResults(finalGradedSubmissions);
      toast.success('تم التصحيح بنجاح!', { id: toastId });

    } catch (e: any) {
      toast.error(e.message || 'حدث خطأ أثناء التصحيح', { id: toastId });
    }
  };

  // Lock-step condition
  const canStart = students.length > 0;

  return (
    <div className="space-y-6">
      <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldAlert className="text-blue-500" />
            نظام الامتحانات الرقمية (بدون إنترنت)
          </h2>
          <button 
            onClick={() => setShowSessionsLog(!showSessionsLog)} 
            className="text-sm bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1 rounded transition-colors"
          >
            {showSessionsLog ? 'إخفاء سجل الجلسات' : 'سجل الجلسات السابقة'}
          </button>
        </div>
        
        {showSessionsLog && (
           <div className="mb-6 bg-slate-900 border border-slate-700 p-4 rounded-xl max-h-64 overflow-y-auto">
              <h3 className="text-lg font-bold text-slate-300 mb-3 border-b border-slate-700 pb-2">سجل الجلسات</h3>
              {examSessionsLog.length === 0 ? (
                <p className="text-sm text-slate-500">لا توجد جلسات سابقة.</p>
              ) : (
                <div className="space-y-2">
                   {examSessionsLog.sort((a,b) => b.createdAt - a.createdAt).map(log => {
                      const ex = exams?.find(e => e.id === log.examId);
                      return (
                        <div key={log.id} className="flex justify-between items-center p-3 bg-slate-800 rounded-lg border border-slate-700">
                           <div>
                              <p className="text-white font-bold">{ex?.title || 'امتحان غير معروف'}</p>
                              <p className="text-xs text-slate-400">{new Date(log.createdAt).toLocaleString('ar-EG')} - دفعة {log.batchNumber}</p>
                           </div>
                           <span className="text-blue-400 font-mono tracking-widest bg-blue-900/30 px-2 py-1 rounded">{log.sessionToken}</span>
                        </div>
                      );
                   })}
                </div>
              )}
           </div>
        )}

        <p className="text-slate-400 text-sm mb-6">
          يسمح هذا النظام بإرسال الامتحانات مباشرة إلى أجهزة الطلاب المتصلة بنفس شبكة الـ Wi-Fi.
        </p>

        {!sessionToken ? (
          <div className="space-y-4">
            <div>
               <label className="block text-sm text-slate-300 mb-1">اختر الفصل:</label>
               <select 
                 value={selectedClassId}
                 onChange={(e) => setSelectedClassId(parseInt(e.target.value))}
                 className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none mb-4"
               >
                  <option value={0}>-- اختر فصلاً --</option>
                  {classes?.map(c => (
                    <option key={c.id} value={c.id!}>{c.name} - {c.subject}</option>
                  ))}
               </select>
            </div>
            
            <div>
               <label className="block text-sm text-slate-300 mb-1">اختر الامتحان:</label>
               <select 
                 value={selectedExamId}
                 onChange={(e) => setSelectedExamId(parseInt(e.target.value))}
                 className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none mb-4"
               >
                  <option value={0}>-- اختر امتحاناً --</option>
                  {exams?.map(ex => (
                    <option key={ex.id} value={ex.id!}>{ex.title} ({ex.questions.length} أسئلة)</option>
                  ))}
               </select>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                 <label className="block text-sm text-slate-300 mb-1">عدد الأجهزة المتاحة</label>
                 <input type="number" min="1" value={availableDevices} onChange={e => handleNumberChange(setAvailableDevices, e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none" />
              </div>
              <div>
                 <label className="block text-sm text-slate-300 mb-1">عدد الطلاب الإجمالي</label>
                 <input type="number" min="1" value={totalStudents} onChange={e => handleNumberChange(setTotalStudents, e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                 <label className="block text-sm text-slate-300 mb-1">مدة الجلسة الواحدة (دقائق)</label>
                 <input type="number" min="1" value={sessionDuration} onChange={e => handleNumberChange(setSessionDuration, e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none" />
              </div>
              <div>
                 <label className="block text-sm text-slate-300 mb-1">ملخص الجلسات</label>
                 <div className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-slate-300 text-sm flex flex-col justify-center h-[50px]">
                    <span>{Math.ceil(totalStudents / availableDevices)} جلسات × {sessionDuration} دقيقة = <strong className="text-blue-400">{Math.ceil(totalStudents / availableDevices) * sessionDuration} دقيقة</strong></span>
                 </div>
              </div>
            </div>
            
            <button onClick={handleCreateSessionPrompt} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl transition-colors">
              فتح نقطة اتصال / إنشاء جلسة
            </button>
            
            {showSessionOptions && (
               <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                  <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md space-y-4">
                     <h3 className="text-xl font-bold text-white mb-4">خيارات إنشاء الجلسة</h3>
                     
                     <button onClick={handleCreateSessionDirect} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors">
                        بدء مباشرة وتوزيع الأكواد على طلاب الفصل
                     </button>
                     
                     <div className="relative flex items-center py-2">
                       <div className="flex-grow border-t border-slate-600"></div>
                       <span className="flex-shrink-0 mx-4 text-slate-400">أو</span>
                       <div className="flex-grow border-t border-slate-600"></div>
                     </div>
                     
                     <button onClick={handleCreateSessionInvite} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl transition-colors">
                        استدعاء طلاب مخصصين أولاً
                     </button>
                     
                     <div className="flex items-center gap-2 mt-2">
                       <input 
                         type="checkbox" 
                         id="savePerm"
                         checked={saveStudentsPermanently}
                         onChange={(e) => setSaveStudentsPermanently(e.target.checked)}
                         className="w-4 h-4 rounded text-purple-600 bg-slate-900 border-slate-700"
                       />
                       <label htmlFor="savePerm" className="text-sm text-slate-300">
                         حفظ الطلاب المستدعين كطلاب دائمين في هذا الفصل
                       </label>
                     </div>
                     
                     <button onClick={() => setShowSessionOptions(false)} className="w-full mt-4 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-xl">
                        إلغاء
                     </button>
                  </div>
               </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-slate-900 p-6 rounded-xl border border-slate-700">
               <h3 className="text-white font-bold mb-4 flex items-center justify-between">
                 <span>أكواد الدخول للطلاب (الدفعة {currentBatchIndex + 1})</span>
                 <div className="flex gap-2">
                   <button onClick={handleNextBatch} className="text-sm bg-blue-900/50 text-blue-400 px-3 py-1 rounded hover:bg-blue-900 transition-colors">الجلسة التالية</button>
                   <button onClick={handleEndSession} className="text-sm bg-red-900/50 text-red-400 px-3 py-1 rounded hover:bg-red-900 transition-colors">إنهاء كلي</button>
                 </div>
               </h3>
               
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 {Object.entries(sessionOtps).map(([otp, st]: [string, any]) => {
                   const isConnected = students.some(s => s.id === st.id || s.name === st.name);
                   const isSubmitted = submissions.some(s => s.student.name === st.name);
                   
                   return (
                     <div key={otp} className={`p-4 rounded-xl flex justify-between items-center border ${isSubmitted ? 'border-purple-500 bg-purple-900/20' : isConnected ? 'border-emerald-500 bg-emerald-900/20' : 'border-slate-700 bg-slate-800'}`}>
                       <div>
                         <button onClick={() => !isConnected && !isSubmitted && setSwapStudentModal({otp, student: st})} className={`font-bold text-white mb-1 text-right flex items-center gap-1 ${!isConnected && !isSubmitted ? "hover:text-blue-400 cursor-pointer" : "cursor-default"}`}>{st.name} {!isConnected && !isSubmitted && <span className="text-xs font-normal text-slate-500 bg-slate-800 px-1 rounded border border-slate-700">تغيير</span>}</button>
                         <p className="text-xs text-slate-400">{isSubmitted ? 'تم التسليم' : isConnected ? 'نشط الآن' : 'في الانتظار'}</p>
                       </div>
                       <div className="flex flex-col items-end gap-2">
                         <span className="text-2xl font-mono tracking-widest font-bold text-blue-400">{otp}</span>
                         {!isConnected && !isSubmitted && (
                           <button onClick={() => handleMarkAbsent(st.id)} className="text-xs text-red-400 hover:text-red-300">تسجيل غياب/تأجيل</button>
                         )}
                       </div>
                     </div>
                   );
                 })}
               </div>
            </div>

            <div className="flex justify-between items-center bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
               <div className="flex items-center gap-3">
                  <Users className="text-slate-400" />
                  <span className="text-slate-200">الطلاب المتصلين:</span>
               </div>
               <div className="flex items-center gap-2">
                  <span className={`text-2xl font-bold ${students.length === availableDevices ? 'text-emerald-400' : 'text-blue-400'}`}>{students.length}</span>
                  <span className="text-slate-500">/ {availableDevices}</span>
               </div>
            </div>
            
            {students.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {students.map((s, i) => (
                  <span key={i} className="px-3 py-1 bg-slate-800 border border-slate-600 rounded-full text-sm text-slate-300">
                    {s.name}
                  </span>
                ))}
              </div>
            )}

            <div className="pt-4 border-t border-slate-700">
               <button 
                 onClick={handleSendExam} 
                 disabled={!canStart}
                 className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-colors flex justify-center items-center gap-2"
               >
                 <Send size={20} />
                 {canStart ? 'بدء الامتحان للأجهزة المتصلة' : 'في انتظار دخول طالب واحد على الأقل...'}
               </button>
            </div>
            
            <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 flex gap-2">
               <input 
                 type="text" 
                 value={quickMessage}
                 onChange={e => setQuickMessage(e.target.value)}
                 placeholder="رسالة سريعة للطلاب (مثال: باقي 5 دقائق)..."
                 className="flex-1 bg-slate-800 border border-slate-600 rounded-lg p-2 text-white outline-none"
                 onKeyDown={e => e.key === 'Enter' && handleSendQuickMessage()}
               />
               <button onClick={handleSendQuickMessage} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold transition-colors">إرسال</button>
            </div>
            
            {pendingRegistrations.length > 0 && (
              <div className="pt-4 border-t border-purple-700/50">
                <h3 className="font-bold text-purple-500 mb-2">طلبات الانضمام (تسجيل جديد)</h3>
                <div className="space-y-2">
                  {pendingRegistrations.map((req, i) => (
                    <div key={i} className="flex justify-between items-center p-3 bg-purple-900/20 rounded-lg border border-purple-800">
                      <span className="text-purple-200">{req.name}</span>
                      <button onClick={() => handleApproveRegistration(req)} className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded">قبول وإرسال الكود</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {earlyRequests.length > 0 && (
              <div className="pt-4 border-t border-amber-700/50">
                <h3 className="font-bold text-amber-500 mb-2">طلبات التسليم المبكر</h3>
                <div className="space-y-2">
                  {earlyRequests.map((req, i) => (
                    <div key={i} className="flex justify-between items-center p-3 bg-amber-900/20 rounded-lg border border-amber-800">
                      <span className="text-amber-200">{req.student.name}</span>
                      <button onClick={() => handleApproveEarly(req)} className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded">موافقة</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {alerts.length > 0 && (
              <div className="pt-4 border-t border-red-700/50">
                <h3 className="font-bold text-red-500 mb-2">تنبيهات النظام (غش محتمل)</h3>
                <div className="space-y-2">
                  {alerts.map((al, i) => (
                    <div key={i} className="p-3 bg-red-900/20 rounded-lg border border-red-800 text-red-300">
                      <strong>{al.student.name}:</strong> {al.reason}
                    </div>
                  ))}
                </div>
              </div>
            )}


            {submissions.length > 0 && (
              <div className="pt-4 border-t border-slate-700">
                <h3 className="font-bold text-white flex items-center gap-2 mb-3">
                  <CheckCircle2 className="text-emerald-500" size={20} />
                  التسليمات ({submissions.length} / {Object.keys(sessionOtps).length})
                </h3>
                
                {gradedResults.length === 0 ? (
                  <button
                    onClick={handleSmartGrading}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 rounded-xl transition-colors flex justify-center items-center gap-2"
                  >
                    تصحيح الإجابات بالذكاء الاصطناعي ✨
                  </button>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {gradedResults.map((gr, i) => (
                        <div key={i} className="bg-slate-800 p-4 rounded-xl border border-slate-600">
                           <div className="flex justify-between items-center mb-2">
                             <span className="font-bold text-white">{gr.studentName}</span>
                             <span className={`px-2 py-1 rounded text-xs font-bold ${gr.category === 'ناجح' ? 'bg-emerald-900 text-emerald-400' : gr.category === 'مكمل' ? 'bg-amber-900 text-amber-400' : 'bg-red-900 text-red-400'}`}>{gr.category}</span>
                           </div>
                           <div className="text-slate-300 mb-2">الدرجة: {gr.score} ({Math.round(gr.percentage)}%)</div>
                           <p className="text-xs text-slate-400">{gr.aiFeedback}</p>
                        </div>
                      ))}
                    </div>
                    
                    <div className="flex flex-col gap-4">
                       <div className="flex gap-4">
                          <button
                            onClick={() => {
                            const pendingResults = JSON.parse(localStorage.getItem('nexus_pending_results') || '{}');
                            const resultsList = gradedResults.map(gr => ({
                               accessToken: pendingResults[gr.studentName],
                               resultData: gr
                            })).filter(r => r.accessToken);
                            
                            socket?.emit('deliver_results', { token: sessionToken, resultsList });
                            toast.success('تم بث النتائج لجميع الأجهزة!');
                         }}
                         className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition-colors"
                       >
                         نشر النتائج (الخيار أ)
                       </button>
                       
                       <button
                         onClick={async () => {
                            const toastId = toast.loading('جاري توليد التقرير...');
                            try {
                              const exam = exams?.find(e => e.id === selectedExamId);
                              const res = await fetch('/api/generate-exam-report', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ exam, results: gradedResults })
                              });
                              const data = await res.json();
                              if (!res.ok) throw new Error(data.error);
                              setAiReport(data);
                              toast.success('تم توليد التقرير', { id: toastId });
                              
                              await db.aiReports.add({
                                examId: selectedExamId,
                                createdAt: Date.now(),
                                type: 'post_exam',
                                reportData: data
                              });
                            } catch (e: any) {
                              toast.error('خطأ: ' + e.message, { id: toastId });
                            }
                         }}
                         className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors"
                       >
                         تحليل النتائج الذكي
                       </button>
                    </div>
                    <button onClick={handleNextBatch} className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold py-3 rounded-xl transition-colors mt-2 border border-slate-600">بدء الجلسة التالية وإخفاء النتائج (الخيار ب)</button>
                    </div>
                    
                    {aiReport && (
                       <div className="bg-slate-900 p-6 rounded-2xl border border-purple-500 shadow-xl shadow-purple-900/20 mt-6">
                         <h2 className="text-xl font-bold text-white mb-4 text-center">تقرير الذكاء الاصطناعي</h2>
                         <div className="grid grid-cols-2 gap-4 mb-4">
                            <div className="bg-slate-800 p-3 rounded-lg border border-emerald-900/50">
                               <p className="text-emerald-400 font-bold mb-2">أفضل 5 طلاب</p>
                               <ul className="list-disc list-inside text-sm text-slate-300">
                                 {aiReport.top5?.map((s: string, i: number) => <li key={i}>{s}</li>)}
                               </ul>
                            </div>
                            <div className="bg-slate-800 p-3 rounded-lg border border-red-900/50">
                               <p className="text-red-400 font-bold mb-2">يحتاجون دعماً</p>
                               <ul className="list-disc list-inside text-sm text-slate-300">
                                 {aiReport.bottom5?.map((s: string, i: number) => <li key={i}>{s}</li>)}
                               </ul>
                            </div>
                         </div>
                         <div className="bg-slate-800 p-4 rounded-lg mb-4">
                            <p className="text-amber-400 font-bold mb-1">أضعف موضوع:</p>
                            <p className="text-slate-300 text-sm">{aiReport.weakestTopic}</p>
                         </div>
                         <div className="bg-slate-800 p-4 rounded-lg">
                            <p className="text-blue-400 font-bold mb-1">توصيات عامة:</p>
                            <p className="text-slate-300 text-sm leading-relaxed">{aiReport.reportText}</p>
                         </div>
                       </div>
                    )}
                  </div>
                )}
              </div>
            )}


          </div>
        )}
      </div>

      {swapStudentModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl p-6 relative">
            <h3 className="text-xl font-bold text-white mb-4">تبديل الطالب (مكان {swapStudentModal.student.name})</h3>
            <p className="text-sm text-slate-400 mb-4">اختر طالباً آخر من القائمة لإضافته لهذه الجلسة:</p>
            <div className="max-h-64 overflow-y-auto space-y-2 mb-4">
               {allStudents?.filter(s => s.classId === selectedClassId && !Object.values(sessionOtps).some((st: any) => st.id === s.id) && !absentStudentIds.includes(s.id!) && !submissions.some(sub => sub.student.id === s.id)).length === 0 ? (
                  <p className="text-slate-500 text-center py-4">لا يوجد طلاب متاحين للتبديل</p>
               ) : (
                 allStudents?.filter(s => s.classId === selectedClassId && !Object.values(sessionOtps).some((st: any) => st.id === s.id) && !absentStudentIds.includes(s.id!) && !submissions.some(sub => sub.student.id === s.id)).map(s => (
                   <button 
                     key={s.id}
                     onClick={() => {
                        setSessionOtps(prev => {
                           const next = { ...prev };
                           next[swapStudentModal.otp] = s;
                           return next;
                        });
                        setSwapStudentModal(null);
                        toast.success('تم تغيير الطالب بنجاح');
                     }}
                     className="w-full text-right p-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-white"
                   >
                     {s.name}
                   </button>
                 ))
               )}
            </div>
            <button onClick={() => setSwapStudentModal(null)} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl transition-colors">إلغاء</button>
          </div>
        </div>
      )}
    </div>
  );
}
