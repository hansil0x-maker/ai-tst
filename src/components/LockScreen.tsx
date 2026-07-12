import { useState, useEffect } from "react";
import { Users, BookOpen, Lock, ShieldAlert, KeyRound } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import { io } from "socket.io-client";
import toast from "react-hot-toast";

export default function LockScreen({
  onUnlocked,
}: {
  onUnlocked: (role: "dashboard" | "grader" | "school" | "student", payload?: any) => void;
}) {
  const [activeTab, setActiveTab] = useState<"teacher" | "student" | "results">("teacher");
  const [studentToken, setStudentToken] = useState("");
  const [resultToken, setResultToken] = useState("");
  const [studentName, setStudentName] = useState("");
  const [error, setError] = useState("");
  const [resultData, setResultData] = useState<any>(null);

  const settings = useLiveQuery(() => db.settings.get(1));
  const classes = useLiveQuery(() => db.classes.toArray());
  
  const [authStep, setAuthStep] = useState<"dev" | "setup" | "login">("dev");
  const [passwordInput, setPasswordInput] = useState("");
  
  const [studentMode, setStudentMode] = useState<"login" | "register">("login");
  const [availableSessions, setAvailableSessions] = useState<any[]>([]);
  const [selectedSessionToken, setSelectedSessionToken] = useState<string>("");

  useEffect(() => {
    if (activeTab === "student" && studentMode === "register") {
      fetch('/api/sessions')
        .then(res => res.json())
        .then(data => setAvailableSessions(data))
        .catch(err => console.error(err));
    }
  }, [activeTab, studentMode]);

  const handleStudentJoin = () => {
    if (studentToken.length >= 4) {
      onUnlocked("student", { otp: studentToken });
    } else {
      setError("الرجاء إدخال كود الدخول الخاص بك (4 أرقام أو أكثر)");
    }
  };

  const handleTeacherAuth = async () => {
    let currentSettings = settings;
    if (!currentSettings) {
       await db.settings.put({
          id: 1,
          schoolName: "المدرسة",
          teacherName: "المعلم",
          academicYear: "2026",
          devPasswordEntered: false,
          userPasswordHash: null
       });
       currentSettings = await db.settings.get(1);
    }
    
    if (!currentSettings) return;
    
    if (!currentSettings.devPasswordEntered) {
      if (passwordInput === "00009090") {
        await db.settings.update(1, { devPasswordEntered: true });
        setPasswordInput("");
        setError("");
      } else {
        setError("رمز المطور غير صحيح");
      }
      return;
    }

    if (!currentSettings.userPasswordHash) {
      if (passwordInput.length < 4) {
        setError("كلمة المرور يجب أن تكون 4 رموز على الأقل");
        return;
      }
      // Extremely simple hash/save for offline app 1
      await db.settings.update(1, { userPasswordHash: passwordInput });
      setPasswordInput("");
      setError("");
      onUnlocked("school");
      return;
    }

    if (currentSettings.userPasswordHash === passwordInput) {
      setError("");
      onUnlocked("school");
    } else {
      setError("كلمة المرور غير صحيحة");
    }
  };

  const handleStudentRegister = () => {
    if (studentName.trim() === "" || selectedSessionToken === "") {
      setError("الرجاء إدخال الاسم واختيار الجلسة");
      return;
    }
    
    const toastId = toast.loading("جاري إرسال الطلب للمعلم...");
    const tempSocket = io('/', { path: '/socket.io' });
    
    let isResponded = false;
    
    tempSocket.on('connect', () => {
       tempSocket.emit('student_register_request', { name: studentName, sessionToken: selectedSessionToken });
       
       setTimeout(() => {
          if (!isResponded) {
             toast.error('انتهى وقت الطلب. ربما لم يوافق المعلم أو الشبكة ضعيفة.', { id: toastId });
             tempSocket.disconnect();
          }
       }, 20000); // 20 seconds timeout
    });

    tempSocket.on('student_register_approved', (data) => {
       isResponded = true;
       if (data.otp) {
          toast.success(`تمت الموافقة! الكود الخاص بك هو: ${data.otp}\nيرجى تذكره للدخول`, { id: toastId, duration: 8000 });
          setStudentToken(data.otp);
          tempSocket.disconnect();
          setStudentMode("login");
          setStudentName("");
       } else {
          toast.success("تم تسجيل بياناتك بنجاح في النظام.", { id: toastId });
          setStudentMode("login");
          tempSocket.disconnect();
       }
    });
  };

  const handleCheckResult = async () => {
    if (resultToken.trim() === "") {
      setError("الرجاء إدخال رمز الوصول للنتيجة");
      return;
    }
    setError("");
    const toastId = toast.loading("جاري جلب النتيجة...");
    
    try {
      const res = await fetch('/api/results/' + resultToken);
      const data = await res.json();
      if (data.success && data.resultData) {
        setResultData(data.resultData);
        toast.dismiss(toastId);
        return;
      }
    } catch (e) {
      console.warn("Failed to fetch result from API, trying local storage", e);
    }
    
    // Fallback to local storage
    const published = JSON.parse(localStorage.getItem('nexus_published_results') || '{}');
    if (published[resultToken]) {
      setResultData(published[resultToken]);
      toast.dismiss(toastId);
      setError("");
    } else {
      toast.error("رمز النتيجة غير صحيح أو لم يتم نشر النتائج بعد", { id: toastId });
      setError("رمز النتيجة غير صحيح أو لم يتم نشر النتائج بعد");
    }
  };

  if (resultData) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
         <div className="bg-slate-800 p-8 rounded-2xl max-w-md w-full border border-slate-700 text-center relative overflow-hidden">
            <h2 className="text-2xl font-bold text-white mb-6 border-b border-slate-700 pb-4">نتيجة الامتحان</h2>
            <p className="text-slate-400 mb-2">الطالب: <strong className="text-white">{resultData.studentName}</strong></p>
            
            <div className="my-6 flex flex-col items-center">
               <div className={`w-32 h-32 mx-auto rounded-full flex flex-col items-center justify-center border-4 ${resultData.category === 'متفوق' ? 'border-purple-500 bg-purple-900/30 text-purple-400' : resultData.category === 'ناجح' ? 'border-emerald-500 bg-emerald-900/30 text-emerald-400' : resultData.category === 'مكمل' ? 'border-amber-500 bg-amber-900/30 text-amber-400' : 'border-red-500 bg-red-900/30 text-red-400'}`}>
                 <span className="text-4xl font-bold">{Math.round(resultData.percentage)}%</span>
                 {resultData.letterGrade && <span className="text-xl font-black opacity-80 mt-1">{resultData.letterGrade}</span>}
               </div>
               <p className="text-2xl font-bold mt-4">{resultData.category}</p>
            </div>
            
            <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 text-right mb-6">
               <p className="text-slate-400 text-sm mb-2">الدرجة الكلية:</p>
               <p className="text-white font-bold">{resultData.score}</p>
            </div>

            {resultData.aiFeedback && (
              <div className="bg-blue-900/20 p-4 rounded-xl border border-blue-800/50 text-right mb-6">
                 <p className="text-blue-300 text-sm mb-2">تعليق الذكاء الاصطناعي:</p>
                 <p className="text-blue-100">{resultData.aiFeedback}</p>
              </div>
            )}

            <button onClick={() => setResultData(null)} className="w-full bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl">رجوع</button>
         </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-800 p-1 rounded-xl mb-6 flex">
        <button 
          onClick={() => { setActiveTab("teacher"); setError(""); }}
          className={`flex-1 py-3 text-lg font-bold rounded-lg transition-colors ${activeTab === 'teacher' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
        >
          المعلم
        </button>
        <button 
          onClick={() => { setActiveTab("student"); setError(""); setStudentToken(""); }}
          className={`flex-1 py-3 text-lg font-bold rounded-lg transition-colors ${activeTab === 'student' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
        >
          الطالب
        </button>
        <button 
          onClick={() => { setActiveTab("results"); setError(""); setResultToken(""); }}
          className={`flex-1 py-3 text-lg font-bold rounded-lg transition-colors ${activeTab === 'results' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
        >
          النتائج
        </button>
      </div>

      <div className="max-w-md w-full bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 relative overflow-hidden">
        {activeTab === "student" ? (
          <div className="text-center space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex mb-4 bg-slate-900 rounded-lg p-1 border border-slate-700">
               <button 
                 onClick={() => { setStudentMode("login"); setError(""); }} 
                 className={`flex-1 py-2 rounded-md font-bold transition-colors ${studentMode === "login" ? "bg-blue-600 text-white" : "text-slate-400"}`}
               >
                 لدي كود امتحان
               </button>
               <button 
                 onClick={() => { setStudentMode("register"); setError(""); }} 
                 className={`flex-1 py-2 rounded-md font-bold transition-colors ${studentMode === "register" ? "bg-blue-600 text-white" : "text-slate-400"}`}
               >
                 تسجيل لأول مرة
               </button>
            </div>

            {studentMode === "login" ? (
              <>
                <div className="mx-auto w-16 h-16 bg-blue-600/20 text-blue-500 rounded-full flex items-center justify-center mb-4">
                  <Users size={32} />
                </div>
                <h1 className="text-2xl font-bold text-white">دخول الامتحان</h1>
                <p className="text-slate-400">أدخل الكود الخاص بك الذي أعطاه لك المعلم</p>
                
                <input
                  type="text"
                  value={studentToken}
                  onChange={(e) => setStudentToken(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleStudentJoin()}
                  placeholder="كود الدخول (مثال: 1010)"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-center text-xl tracking-widest text-white focus:ring-2 focus:ring-blue-500 outline-none mb-3"
                  maxLength={8}
                />

                {error && <p className="text-red-400 text-sm">{error}</p>}

                <button
                  onClick={handleStudentJoin}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl transition-colors font-bold text-lg"
                >
                  التحقق من الكود
                </button>
              </>
            ) : (
              <>
                <div className="mx-auto w-16 h-16 bg-purple-600/20 text-purple-500 rounded-full flex items-center justify-center mb-4">
                  <Users size={32} />
                </div>
                <h1 className="text-2xl font-bold text-white">تسجيل بيانات الطالب</h1>
                <p className="text-slate-400">أدخل اسمك واختر صفك ليتم إضافتك في النظام</p>
                
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="الاسم الثلاثي"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-right text-lg text-white focus:ring-2 focus:ring-purple-500 outline-none mb-3"
                />

                <select
                  value={selectedSessionToken}
                  onChange={(e) => setSelectedSessionToken(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-right text-lg text-slate-300 focus:ring-2 focus:ring-purple-500 outline-none mb-3 appearance-none"
                >
                  <option value="">-- اختر الجلسة المتاحة --</option>
                  {availableSessions.map(s => (
                     <option key={s.token} value={s.token}>{s.className} - {s.examTitle}</option>
                  ))}
                </select>

                {error && <p className="text-red-400 text-sm">{error}</p>}

                <button
                  onClick={handleStudentRegister}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white py-4 rounded-xl transition-colors font-bold text-lg"
                >
                  إرسال الطلب للمعلم
                </button>
              </>
            )}
          </div>
        ) : activeTab === "results" ? (
          <div className="text-center space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="mx-auto w-16 h-16 bg-emerald-600/20 text-emerald-500 rounded-full flex items-center justify-center mb-4">
               <BookOpen size={32} />
             </div>
             <h1 className="text-2xl font-bold text-white">الاستعلام عن النتيجة</h1>
             <p className="text-slate-400">أدخل رمز الوصول الخاص بك لرؤية نتيجتك التفصيلية</p>
             
             {(() => {
                const pending = JSON.parse(localStorage.getItem('nexus_pending_results') || '{}');
                const count = Object.keys(pending).length;
                if (count > 0) {
                   return (
                     <div className="bg-emerald-900/20 border border-emerald-800/50 p-3 rounded-xl mb-4">
                        <p className="text-emerald-300 text-sm">أكمل <strong>{count}</strong> طلاب امتحانهم على هذا الجهاز.</p>
                     </div>
                   );
                }
                return null;
             })()}

             <input
               type="text"
               value={resultToken}
               onChange={(e) => setResultToken(e.target.value)}
               onKeyDown={(e) => e.key === "Enter" && handleCheckResult()}
               placeholder="رمز الوصول للنتيجة"
               className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-center text-xl tracking-widest text-white focus:ring-2 focus:ring-emerald-500 outline-none mb-3"
             />
             
             {error && <p className="text-red-400 text-sm">{error}</p>}
             
             <button
               onClick={handleCheckResult}
               className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-xl transition-colors font-bold text-lg"
             >
               عرض النتيجة
             </button>
          </div>
        ) : (
          <div className="text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="mx-auto w-16 h-16 bg-blue-600/20 text-blue-500 rounded-full flex items-center justify-center mb-4">
              {settings && !settings.devPasswordEntered ? <ShieldAlert size={32} /> : <BookOpen size={32} />}
            </div>
            
            {settings && !settings.devPasswordEntered ? (
              <>
                <h1 className="text-2xl font-bold text-white">رمز المطور المطلوب</h1>
                <p className="text-slate-400">الرجاء إدخال رمز المطور لفتح التطبيق لأول مرة.</p>
              </>
            ) : settings && !settings.userPasswordHash ? (
              <>
                <h1 className="text-2xl font-bold text-white">إعداد كلمة المرور</h1>
                <p className="text-slate-400">قم بتعيين كلمة مرور لحماية بياناتك (ستستخدمها دائماً).</p>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-white">دخول المعلم</h1>
                <p className="text-slate-400">أدخل كلمة المرور الخاصة بك للوصول للنظام.</p>
              </>
            )}

            <input
              type={settings && !settings.devPasswordEntered ? "text" : "password"}
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTeacherAuth()}
              placeholder={settings && !settings.devPasswordEntered ? "رمز المطور" : "كلمة المرور"}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-center text-xl tracking-widest text-white focus:ring-2 focus:ring-blue-500 outline-none mb-3"
            />

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              onClick={handleTeacherAuth}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-xl transition-colors font-bold text-lg flex items-center justify-center gap-2"
            >
              <KeyRound size={20} />
              {settings && !settings.devPasswordEntered ? "تأكيد الرمز" : settings && !settings.userPasswordHash ? "حفظ كلمة المرور" : "تسجيل الدخول"}
            </button>
          </div>
        )}
      </div>
      <div className="mt-8 text-slate-500 text-sm font-mono opacity-60">
        التحديث رقم 5.5.5
      </div>
    </div>
  );
}