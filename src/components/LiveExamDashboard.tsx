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
  
  const [totalStudents, setTotalStudents] = useState<number>(30);
  const [availableDevices, setAvailableDevices] = useState<number>(4);
  const [selectedClassId, setSelectedClassId] = useState<number>(0);
  const [selectedExamId, setSelectedExamId] = useState<number>(0);
  const [absentStudentIds, setAbsentStudentIds] = useState<number[]>([]);
  
  const [sessionOtps, setSessionOtps] = useState<Record<string, any>>({});
  const [quickMessage, setQuickMessage] = useState('');
  const [aiReport, setAiReport] = useState<any>(null);
  const [gradedResults, setGradedResults] = useState<any[]>([]);
  
  const classes = useLiveQuery(() => db.classes.toArray());
  const allStudents = useLiveQuery(() => db.students.toArray());
  const exams = useLiveQuery(() => db.exams.toArray());

  useEffect(() => {
    const newSocket = io('/', { path: '/socket.io' });
    
    newSocket.on('connect', () => {
      // ready
    });

    newSocket.on('student_joined', (student) => {
      setStudents(prev => [...prev, student]);
      toast.success(`انضم الطالب: ${student.name}`);
    });
    
    newSocket.on('student_left', (data) => {
      setStudents(prev => prev.filter(s => s.id !== data.id));
    });

    
    newSocket.on('student_cheat_alert', (data) => {
      setAlerts(prev => [...prev, data]);
      toast.error(`تنبيه غش: ${data.student.name} - ${data.reason}`);
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

  
  const handleApproveEarly = (req: any) => {
    if (socket) {
      socket.emit('approve_early_submit', { studentSocketId: req.socketId });
      setEarlyRequests(prev => prev.filter(r => r.socketId !== req.socketId));
      toast.success('تمت الموافقة على التسليم المبكر');
    }
  };

  const handleCreateSession = () => {
    if (!socket || selectedClassId === 0 || selectedExamId === 0) {
      toast.error('يرجى اختيار الفصل والامتحان أولاً');
      return;
    }
    
    // 1. Get available students
    const classStudents = allStudents?.filter(s => s.classId === selectedClassId && !absentStudentIds.includes(s.id!)) || [];
    if (classStudents.length === 0) {
      toast.error('لا يوجد طلاب متاحين في هذا الفصل');
      return;
    }
    
    // 2. Select batch
    const batch = classStudents.slice(0, availableDevices);
    
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

    socket.emit('create_session', {}, async (res: any) => {
      if (res.success) {
        setSessionToken(res.token);
        setStudents([]);
        setSubmissions([]);
        setGradedResults([]);
        setAiReport(null);
        
        socket.emit('register_session_otps', { token: res.token, otpsMap });
        
        // Save to DB
        await db.examSessions.add({
          sessionToken: res.token,
          examId: selectedExamId,
          batchNumber: 1,
          createdAt: Date.now()
        });
        
        toast.success('تم إنشاء الجلسة وتوليد أكواد الدخول بنجاح');
      }
    });
  };

  const handleMarkAbsent = (studentId: number) => {
     setAbsentStudentIds(prev => [...prev, studentId]);
     toast('تم تسجيل غياب الطالب، يرجى إنشاء جلسة الدفعة لتحديث القائمة.', { icon: '🔄' });
     // Force recreate session effectively or just prompt teacher to restart session
     setSessionToken(null); 
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

    socket.emit('send_exam', {
      token: sessionToken,
      examPayload: exam
    });
    
    toast.success('تم إرسال الامتحان للطلاب');
  };

  // Lock-step condition
  const canStart = students.length > 0;

  return (
    <div className="space-y-6">
      <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
        <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-4">
          <ShieldAlert className="text-blue-500" />
          نظام الامتحانات الرقمية (بدون إنترنت)
        </h2>
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                 <label className="block text-sm text-slate-300 mb-1">الأجهزة المتاحة في القاعة</label>
                 <input type="number" value={availableDevices} onChange={e => setAvailableDevices(parseInt(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none" />
              </div>
            </div>
            
            <button onClick={handleCreateSession} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl transition-colors">
              إنشاء الجلسة وتوليد أكواد الدخول للطلاب
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-slate-900 p-6 rounded-xl border border-slate-700">
               <h3 className="text-white font-bold mb-4 flex items-center justify-between">
                 <span>أكواد الدخول للطلاب (الدفعة الحالية)</span>
                 <button onClick={() => setSessionToken(null)} className="text-sm bg-red-900/50 text-red-400 px-3 py-1 rounded hover:bg-red-900 transition-colors">إنهاء الجلسة</button>
               </h3>
               
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 {Object.entries(sessionOtps).map(([otp, st]: [string, any]) => {
                   const isConnected = students.some(s => s.id === st.id || s.name === st.name);
                   const isSubmitted = submissions.some(s => s.student.name === st.name);
                   
                   return (
                     <div key={otp} className={`p-4 rounded-xl flex justify-between items-center border ${isSubmitted ? 'border-purple-500 bg-purple-900/20' : isConnected ? 'border-emerald-500 bg-emerald-900/20' : 'border-slate-700 bg-slate-800'}`}>
                       <div>
                         <p className="font-bold text-white mb-1">{st.name}</p>
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
                    onClick={async () => {
                      const toastId = toast.loading('جاري التصحيح الذكي للإجابات...');
                      try {
                        const exam = exams?.find(e => e.id === selectedExamId);
                        const res = await fetch('/api/grade-digital-submissions', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ exam, submissions })
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error);
                        
                        setGradedResults(data.gradedSubmissions);
                        toast.success('تم التصحيح بنجاح!', { id: toastId });
                        
                        // Link with pending access tokens from localStorage
                        const pendingResults = JSON.parse(localStorage.getItem('nexus_pending_results') || '{}');
                        
                        for (const graded of data.gradedSubmissions) {
                           const matchSub = submissions.find(s => s.student.name === graded.studentName);
                           const stId = matchSub ? matchSub.student.id : null;
                           const accessToken = pendingResults[graded.studentName] || Math.floor(1000 + Math.random() * 9000).toString();
                           
                           await db.results.add({
                              examId: selectedExamId,
                              studentId: stId,
                              studentName: graded.studentName,
                              scannedAnswers: matchSub ? matchSub.answers : {},
                              score: graded.score,
                              percentage: graded.percentage,
                              category: graded.category,
                              isCheatSuspected: false
                           });
                        }
                        
                        toast.success('تم حفظ النتائج في قاعدة البيانات');
                      } catch (e: any) {
                        toast.error('فشل التصحيح: ' + e.message, { id: toastId });
                      }
                    }}
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
                         نشر النتائج للأجهزة
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
    </div>
  );
}
