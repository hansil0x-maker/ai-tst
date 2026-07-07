import { useState } from "react";
import { Users, BookOpen } from "lucide-react";

export default function LockScreen({
  onUnlocked,
}: {
  onUnlocked: (role: "dashboard" | "grader" | "school" | "student", payload?: any) => void;
}) {
  const [activeTab, setActiveTab] = useState<"teacher" | "student">("teacher");
  const [studentToken, setStudentToken] = useState("");
  const [studentName, setStudentName] = useState("");
  const [error, setError] = useState("");

  const handleStudentJoin = () => {
    if (studentToken.length === 6 && studentName.trim() !== "") {
      onUnlocked("student", { token: studentToken, name: studentName });
    } else {
      setError("الرجاء إدخال اسمك ورمز الجلسة المكون من 6 أرقام");
    }
  };

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
          onClick={() => { setActiveTab("student"); setError(""); setStudentToken(""); setStudentName(""); }}
          className={`flex-1 py-3 text-lg font-bold rounded-lg transition-colors ${activeTab === 'student' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
        >
          الطالب
        </button>
      </div>

      <div className="max-w-md w-full bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 relative overflow-hidden">
        {activeTab === "student" ? (
          <div className="text-center space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mx-auto w-16 h-16 bg-blue-600/20 text-blue-500 rounded-full flex items-center justify-center mb-4">
              <Users size={32} />
            </div>
            <h1 className="text-2xl font-bold text-white">دخول الامتحان</h1>
            <p className="text-slate-400">أدخل اسمك ورمز الجلسة الذي أعطاه لك المعلم</p>
            
            <input
              type="text"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="الاسم الثلاثي"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-right text-white focus:ring-2 focus:ring-blue-500 outline-none mb-3"
            />
            
            <input
              type="text"
              value={studentToken}
              onChange={(e) => setStudentToken(e.target.value)}
              placeholder="رمز الجلسة (6 أرقام)"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-center text-xl tracking-widest text-white focus:ring-2 focus:ring-blue-500 outline-none mb-3"
              maxLength={6}
            />

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              onClick={handleStudentJoin}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl transition-colors font-bold text-lg"
            >
              دخول غرفة الانتظار
            </button>
          </div>
        ) : (
          <div className="text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="mx-auto w-16 h-16 bg-blue-600/20 text-blue-500 rounded-full flex items-center justify-center mb-4">
              <BookOpen size={32} />
            </div>
            <h1 className="text-2xl font-bold text-white">لوحة تحكم المعلم</h1>
            <p className="text-slate-400">مرحباً بك في نظام إدارة الامتحانات الرقمية</p>
            <button
              onClick={() => onUnlocked("school")}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-xl transition-colors font-bold text-lg"
            >
              الدخول للنظام
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
