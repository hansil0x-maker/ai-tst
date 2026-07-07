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
  const [availableDevices, setAvailableDevices] = useState<number>(10);
  
  const [selectedExamId, setSelectedExamId] = useState<number>(0);
  
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
    if (!socket) return;
    socket.emit('create_session', {}, (res: any) => {
      if (res.success) {
        setSessionToken(res.token);
        setStudents([]);
        setSubmissions([]);
        toast.success('تم إنشاء الجلسة بنجاح');
      }
    });
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                 <label className="block text-sm text-slate-300 mb-1">إجمالي الطلاب (N)</label>
                 <input type="number" value={totalStudents} onChange={e => setTotalStudents(parseInt(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none" />
              </div>
              <div>
                 <label className="block text-sm text-slate-300 mb-1">الأجهزة المتاحة (M)</label>
                 <input type="number" value={availableDevices} onChange={e => setAvailableDevices(parseInt(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none" />
              </div>
            </div>
            
            <button onClick={handleCreateSession} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl transition-colors">
              فتح جلسة امتحان جديدة (دفعة 1)
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-slate-900 p-6 rounded-xl border border-slate-700 text-center">
               <p className="text-slate-400 text-sm mb-2">رمز الجلسة للطلاب:</p>
               <h1 className="text-5xl font-mono font-bold text-blue-400 tracking-[0.2em]">{sessionToken}</h1>
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
               <label className="block text-sm text-slate-300 mb-2">اختر الامتحان للإرسال:</label>
               <select 
                 value={selectedExamId}
                 onChange={(e) => setSelectedExamId(parseInt(e.target.value))}
                 className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none mb-4"
               >
                  <option value={0}>-- اختر امتحاناً --</option>
                  {exams?.map(ex => (
                    <option key={ex.id} value={ex.id}>{ex.title} ({ex.questions.length} أسئلة)</option>
                  ))}
               </select>

               <button 
                 onClick={handleSendExam} 
                 disabled={!canStart}
                 className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-colors flex justify-center items-center gap-2"
               >
                 <Send size={20} />
                 {canStart ? 'إرسال الامتحان للدفعة الحالية' : 'في انتظار اكتمال العدد المطلوب...'}
               </button>
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
                  التسليمات ({submissions.length} / {students.length})
                </h3>
                <div className="space-y-2">
                  {submissions.map((sub, i) => (
                     <div key={i} className="flex justify-between p-3 bg-slate-900 rounded-lg border border-slate-700">
                       <span className="text-emerald-400">{sub.student.name}</span>
                       <span className="text-slate-500 text-sm">تم التسليم</span>
                     </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
