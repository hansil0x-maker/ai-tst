import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Users, FileText, CheckCircle, AlertTriangle, Filter } from 'lucide-react';

export default function Dashboard() {
  const students = useLiveQuery(() => db.students.toArray()) || [];
  const exams = useLiveQuery(() => db.exams.toArray()) || [];
  const classes = useLiveQuery(() => db.classes.toArray()) || [];
  const results = useLiveQuery(() => db.results.toArray()) || [];

  const [selectedClassId, setSelectedClassId] = useState<number>(0);
  const [selectedExamId, setSelectedExamId] = useState<number>(0);
  const [activeList, setActiveList] = useState<'All'|'Fail'|'Pass'|'Perfect'>('All');

  const filteredResults = useMemo(() => {
    let f = results;
    if (selectedExamId !== 0) f = f.filter(r => r.examId === selectedExamId);
    if (selectedClassId !== 0) {
      const classExams = exams.filter(e => e.classId === selectedClassId).map(e => e.id);
      f = f.filter(r => classExams.includes(r.examId));
    }
    if (activeList !== 'All') f = f.filter(r => r.category === activeList);
    return f;
  }, [results, exams, selectedExamId, selectedClassId, activeList]);

  const passed = results.filter(r => r.category === 'Pass' || r.category === 'Perfect').length;
  const cheated = results.filter(r => r.isCheatSuspected).length;

  const getLabelList = (list: string) => {
    switch (list) {
      case 'All': return 'الكل';
      case 'Perfect': return 'العلامة الكاملة';
      case 'Pass': return 'الناجحين';
      case 'Fail': return 'الراسبين';
      default: return list;
    }
  };

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'Perfect': return 'علامة كاملة';
      case 'Pass': return 'ناجح';
      case 'Fail': return 'راسب';
      default: return cat;
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <h2 className="text-2xl font-semibold border-b border-slate-700 pb-4">الإحصائيات العامة</h2>
      
      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 flex flex-col items-center justify-center text-center">
          <div className="text-blue-500 mb-2"><Users size={28} /></div>
          <span className="text-3xl font-bold">{students.length}</span>
          <span className="text-xs text-slate-400">إجمالي الطلاب</span>
        </div>
        <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 flex flex-col items-center justify-center text-center">
          <div className="text-emerald-500 mb-2"><FileText size={28} /></div>
          <span className="text-3xl font-bold">{exams.length}</span>
          <span className="text-xs text-slate-400">إجمالي الامتحانات</span>
        </div>
        <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 flex flex-col items-center justify-center text-center">
          <div className="text-purple-500 mb-2"><CheckCircle size={28} /></div>
          <span className="text-3xl font-bold">{results.length ? Math.round((passed / results.length) * 100) : 0}%</span>
          <span className="text-xs text-slate-400">نسبة النجاح</span>
        </div>
        <div className="bg-slate-800 p-4 rounded-2xl border border-red-900/50 flex flex-col items-center justify-center text-center">
          <div className="text-red-500 mb-2"><AlertTriangle size={28} /></div>
          <span className="text-3xl font-bold text-red-500">{cheated}</span>
          <span className="text-xs text-red-400">تنبيهات الغش</span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700 space-y-4">
        <div className="flex items-center space-x-2 space-x-reverse text-slate-300 font-medium pb-2 border-b border-slate-700">
           <Filter size={18} /> <span>فلاتر متقدمة</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <select value={selectedClassId} onChange={e=>setSelectedClassId(Number(e.target.value))} className="bg-slate-900 border border-slate-600 rounded-lg p-3 text-white outline-none">
            <option value={0}>كل الصفوف</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={selectedExamId} onChange={e=>setSelectedExamId(Number(e.target.value))} className="bg-slate-900 border border-slate-600 rounded-lg p-3 text-white outline-none">
            <option value={0}>كل الامتحانات</option>
            {exams.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
        </div>
      </div>

      {/* Lists */}
      <div className="space-y-4">
        <div className="flex space-x-2 space-x-reverse overflow-x-auto pb-2">
          {['All', 'Perfect', 'Pass', 'Fail'].map((list) => (
             <button key={list} onClick={() => setActiveList(list as any)} className={`shrink-0 px-4 py-2 rounded-full font-medium transition-colors ${activeList === list ? 'bg-blue-600 text-white' : 'bg-slate-800 border border-slate-700 text-slate-400 hover:text-white'}`}>
                {getLabelList(list)}
             </button>
          ))}
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
           {filteredResults.length === 0 ? (
             <div className="p-8 text-center text-slate-500">لم يتم العثور على نتائج لهذه الفلاتر.</div>
           ) : (
             <div className="divide-y divide-slate-700">
               {filteredResults.map(r => {
                 const st = students.find(s => s.id === r.studentId);
                 const ex = exams.find(e => e.id === r.examId);
                 return (
                   <div key={r.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center hover:bg-slate-700/30 transition-colors">
                      <div className="mb-2 sm:mb-0">
                        <p className="font-semibold text-white">{st?.name || 'طالب غير معروف'}</p>
                        <p className="text-sm text-slate-400">{ex?.title || 'امتحان غير معروف'} • {ex?.subject}</p>
                        {r.isCheatSuspected && <span className="inline-flex items-center space-x-1 space-x-reverse text-xs text-red-500 bg-red-900/40 px-2 py-0.5 rounded mt-1"><AlertTriangle size={12}/> <span>حالة غش محتملة</span></span>}
                      </div>
                      <div className="flex items-center space-x-4 space-x-reverse">
                         <div className="text-left">
                           <p className="font-bold text-lg" dir="ltr">{r.percentage}%</p>
                           <p className={`text-xs uppercase tracking-wider font-bold ${r.category === 'Perfect' ? 'text-purple-400' : r.category === 'Pass' ? 'text-emerald-400' : 'text-red-400'}`}>{getCategoryLabel(r.category)}</p>
                         </div>
                      </div>
                   </div>
                 );
               })}
             </div>
           )}
        </div>
      </div>
    </div>
  );
}
