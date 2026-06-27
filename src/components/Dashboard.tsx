import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Users, FileText, CheckCircle, AlertTriangle, Filter, Download, BarChart2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import toast from 'react-hot-toast';

export default function Dashboard() {
  const students = useLiveQuery(() => db.students.toArray()) || [];
  const exams = useLiveQuery(() => db.exams.toArray()) || [];
  const classes = useLiveQuery(() => db.classes.toArray()) || [];
  const results = useLiveQuery(() => db.results.toArray()) || [];

  const [selectedClassId, setSelectedClassId] = useState<number>(0);
  const [selectedExamId, setSelectedExamId] = useState<number>(0);
  const [selectedSubject, setSelectedSubject] = useState<string>('All');
  const [selectedYear, setSelectedYear] = useState<string>('All');
  const [activeList, setActiveList] = useState<'All'|'Fail'|'Pass'|'Perfect'>('All');
  const [visibleResults, setVisibleResults] = useState(10);

  const uniqueSubjects = useMemo(() => Array.from(new Set([...classes.map(c=>c.subject), ...exams.map(e=>e.subject)])), [classes, exams]);
  const uniqueYears = useMemo(() => Array.from(new Set([...classes.map(c=>c.academicYear), ...exams.map(e=>e.academicYear)])).filter(Boolean), [classes, exams]);

  const filteredResults = useMemo(() => {
    let f = results;
    
    // Academic Year Filter
    if (selectedYear !== 'All') {
      const yearExams = exams.filter(e => e.academicYear === selectedYear).map(e => e.id);
      f = f.filter(r => yearExams.includes(r.examId));
    }
    
    // Subject Filter
    if (selectedSubject !== 'All') {
      const subjExams = exams.filter(e => e.subject === selectedSubject).map(e => e.id);
      f = f.filter(r => subjExams.includes(r.examId));
    }

    if (selectedExamId !== 0) f = f.filter(r => r.examId === selectedExamId);
    if (selectedClassId !== 0) {
      const classExams = exams.filter(e => e.classId === selectedClassId).map(e => e.id);
      f = f.filter(r => classExams.includes(r.examId));
    }
    if (activeList !== 'All') f = f.filter(r => r.category === activeList);
    return f;
  }, [results, exams, selectedExamId, selectedClassId, activeList, selectedYear, selectedSubject]);

  const filteredStudentsCount = useMemo(() => {
    let f = students;
    if (selectedYear !== 'All') {
      const yearClasses = classes.filter(c => c.academicYear === selectedYear).map(c => c.id);
      f = f.filter(s => yearClasses.includes(s.classId));
    }
    if (selectedClassId !== 0) {
      f = f.filter(s => s.classId === selectedClassId);
    }
    return f.length;
  }, [students, classes, selectedYear, selectedClassId]);

  const filteredExamsCount = useMemo(() => {
    let f = exams;
    if (selectedYear !== 'All') f = f.filter(e => e.academicYear === selectedYear);
    if (selectedSubject !== 'All') f = f.filter(e => e.subject === selectedSubject);
    if (selectedClassId !== 0) f = f.filter(e => e.classId === selectedClassId);
    return f.length;
  }, [exams, selectedYear, selectedSubject, selectedClassId]);

  const passed = filteredResults.filter(r => r.category === 'Pass' || r.category === 'Perfect').length;
  const cheated = filteredResults.filter(r => r.isCheatSuspected).length;

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

  const classPerformances = useMemo(() => {
    const classMap = new Map();
    filteredResults.forEach(r => {
      const ex = exams.find(e => e.id === r.examId);
      if (!ex) return;
      const cId = ex.classId;
      if (!classMap.has(cId)) {
        classMap.set(cId, { classId: cId, studentScores: new Map() });
      }
      const sMap = classMap.get(cId).studentScores;
      if (!sMap.has(r.studentId)) {
        sMap.set(r.studentId, { totalPercentage: 0, count: 0 });
      }
      const sData = sMap.get(r.studentId);
      sData.totalPercentage += r.percentage;
      sData.count += 1;
    });

    const result: any[] = [];
    classMap.forEach(v => {
      const classObj = classes.find(c => c.id === v.classId);
      if (!classObj) return;
      
      const studentAverages = Array.from(v.studentScores.entries()).map(([sId, data]: any) => {
        const studentObj = students.find(s => s.id === sId);
        return {
          studentId: sId,
          name: studentObj?.name || 'غير معروف',
          average: data.totalPercentage / data.count
        };
      });

      studentAverages.sort((a, b) => b.average - a.average);
      
      const top5 = studentAverages.slice(0, 5);
      // bottom5 shouldn't include students already in top5
      const bottom5 = studentAverages.slice(-5).reverse().filter(s => !top5.find(t => t.studentId === s.studentId));

      result.push({
        classId: v.classId,
        className: classObj.name,
        subject: classObj.subject,
        top5,
        bottom5
      });
    });

    return result;
  }, [filteredResults, exams, classes, students]);

  const exportToExcel = () => {
    if (filteredResults.length === 0) {
      toast.error('لا توجد بيانات لتصديرها');
      return;
    }
    
    const data = filteredResults.map(r => {
      const st = students.find(s => s.id === r.studentId);
      const ex = exams.find(e => e.id === r.examId);
      const cl = classes.find(c => c.id === st?.classId);
      return {
        'الطالب': st?.name || 'غير معروف',
        'الرقم التسلسلي': st?.serialNumber || '-',
        'الصف': cl?.name || '-',
        'الامتحان': ex?.title || '-',
        'المادة': ex?.subject || '-',
        'الدرجة': r.score,
        'النسبة المئوية (%)': r.percentage,
        'الحالة': getCategoryLabel(r.category),
        'اشتباه غش': r.isCheatSuspected ? 'نعم' : 'لا'
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Results");
    XLSX.writeFile(workbook, `إحصائيات_الامتحانات_${new Date().toLocaleDateString()}.xlsx`);
    toast.success('تم تصدير التقرير بنجاح');
  };

  // Chart Data Preparation
  const pieData = useMemo(() => {
    const counts = { Perfect: 0, Pass: 0, Fail: 0 };
    filteredResults.forEach(r => {
      if (counts[r.category as keyof typeof counts] !== undefined) {
        counts[r.category as keyof typeof counts]++;
      }
    });
    return [
      { name: 'علامة كاملة', value: counts.Perfect, color: '#a855f7' },
      { name: 'ناجح', value: counts.Pass, color: '#10b981' },
      { name: 'راسب', value: counts.Fail, color: '#ef4444' }
    ].filter(d => d.value > 0);
  }, [filteredResults]);

  const barData = useMemo(() => {
    if (selectedExamId !== 0) {
      // Show distribution of scores for the exam
      const bins = {'0-20%':0, '21-40%':0, '41-60%':0, '61-80%':0, '81-100%':0};
      filteredResults.forEach(r => {
        if(r.percentage <= 20) bins['0-20%']++;
        else if (r.percentage <= 40) bins['21-40%']++;
        else if (r.percentage <= 60) bins['41-60%']++;
        else if (r.percentage <= 80) bins['61-80%']++;
        else bins['81-100%']++;
      });
      return Object.entries(bins).map(([name, count]) => ({ name, count }));
    }
    // Show top exams average
    const examAverages: Record<number, { sum: number, count: number }> = {};
    filteredResults.forEach(r => {
      if(!examAverages[r.examId]) examAverages[r.examId] = { sum:0, count:0 };
      examAverages[r.examId].sum += r.percentage;
      examAverages[r.examId].count++;
    });
    return Object.entries(examAverages).slice(0, 5).map(([eId, d]) => {
      const ex = exams.find(e => e.id === Number(eId));
      return { name: ex?.title?.substring(0, 10) + '..' || 'Unknown', count: Math.round(d.sum / d.count) };
    });
  }, [filteredResults, exams, selectedExamId]);

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-center border-b border-slate-700 pb-4">
        <h2 className="text-2xl font-semibold">الإحصائيات والتقارير</h2>
        <button onClick={exportToExcel} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 space-x-reverse transition-colors">
          <Download size={18} /> <span className="hidden sm:inline">تصدير (Excel)</span>
        </button>
      </div>
      
      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 flex flex-col items-center justify-center text-center">
          <div className="text-blue-500 mb-2"><Users size={28} /></div>
          <span className="text-3xl font-bold">{filteredStudentsCount}</span>
          <span className="text-xs text-slate-400">إجمالي الطلاب</span>
        </div>
        <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 flex flex-col items-center justify-center text-center">
          <div className="text-emerald-500 mb-2"><FileText size={28} /></div>
          <span className="text-3xl font-bold">{filteredExamsCount}</span>
          <span className="text-xs text-slate-400">إجمالي الامتحانات</span>
        </div>
        <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 flex flex-col items-center justify-center text-center">
          <div className="text-purple-500 mb-2"><CheckCircle size={28} /></div>
          <span className="text-3xl font-bold">{filteredResults.length ? Math.round((passed / filteredResults.length) * 100) : 0}%</span>
          <span className="text-xs text-slate-400">نسبة النجاح</span>
        </div>
        <div className="bg-slate-800 p-4 rounded-2xl border border-red-900/50 flex flex-col items-center justify-center text-center">
          <div className="text-red-500 mb-2"><AlertTriangle size={28} /></div>
          <span className="text-3xl font-bold text-red-500">{cheated}</span>
          <span className="text-xs text-red-400">تنبيهات الغش</span>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700">
           <h3 className="text-slate-300 font-medium mb-4 flex items-center gap-2"><BarChart2 size={18}/> توزيع النتائج</h3>
           {barData.length > 0 ? (
             <div className="h-64 w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData}>
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                    <YAxis stroke="#94a3b8" fontSize={12} />
                    <Tooltip cursor={{fill: '#334155'}} contentStyle={{backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff'}} />
                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
             </div>
           ) : (
             <div className="h-64 flex items-center justify-center text-slate-500">لا توجد بيانات كافية</div>
           )}
        </div>
        <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700">
           <h3 className="text-slate-300 font-medium mb-4">نسب النجاح والفشل</h3>
           {pieData.length > 0 ? (
              <div className="h-64 w-full" dir="ltr">
                 <ResponsiveContainer width="100%" height="100%">
                   <PieChart>
                     <Tooltip contentStyle={{backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff'}} />
                     <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5}>
                       {pieData.map((entry, index) => (
                         <Cell key={`cell-${index}`} fill={entry.color} />
                       ))}
                     </Pie>
                   </PieChart>
                 </ResponsiveContainer>
              </div>
           ) : (
             <div className="h-64 flex items-center justify-center text-slate-500">لا توجد بيانات كافية</div>
           )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700 space-y-4">
        <div className="flex items-center space-x-2 space-x-reverse text-slate-300 font-medium pb-2 border-b border-slate-700">
           <Filter size={18} /> <span>فلاتر متقدمة للسجلات</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <select value={selectedYear} onChange={e=>setSelectedYear(e.target.value)} className="bg-slate-900 border border-slate-600 rounded-lg p-3 text-white outline-none">
            <option value="All">كل الأعوام</option>
            {uniqueYears.map((y, i) => <option key={i} value={y as string}>{y as string}</option>)}
          </select>
          <select value={selectedSubject} onChange={e=>setSelectedSubject(e.target.value)} className="bg-slate-900 border border-slate-600 rounded-lg p-3 text-white outline-none">
            <option value="All">كل المواد</option>
            {uniqueSubjects.map((s, i) => <option key={i} value={s as string}>{s as string}</option>)}
          </select>
          <select value={selectedClassId} onChange={e=>setSelectedClassId(Number(e.target.value))} className="bg-slate-900 border border-slate-600 rounded-lg p-3 text-white outline-none">
            <option value="0">كل الصفوف</option>
            {classes.filter(c => selectedYear === 'All' || c.academicYear === selectedYear).filter(c => selectedSubject === 'All' || c.subject === selectedSubject).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={selectedExamId} onChange={e=>setSelectedExamId(Number(e.target.value))} className="bg-slate-900 border border-slate-600 rounded-lg p-3 text-white outline-none">
            <option value="0">كل الامتحانات</option>
            {exams.filter(e => selectedYear === 'All' || e.academicYear === selectedYear).filter(e => selectedSubject === 'All' || e.subject === selectedSubject).filter(e => selectedClassId === 0 || e.classId === selectedClassId).map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
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
               {filteredResults.slice(0, visibleResults).map(r => {
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
               
               {filteredResults.length > visibleResults && (
                 <div className="p-4 text-center">
                   <button 
                     onClick={() => setVisibleResults(v => v + 10)} 
                     className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-full transition-colors border border-slate-700 text-sm"
                   >
                     عرض المزيد
                   </button>
                 </div>
               )}
             </div>
           )}
        </div>
      </div>

      {classPerformances.length > 0 && (
        <div className="space-y-6 pt-4">
          <h2 className="text-xl font-bold text-white border-b border-slate-700 pb-2 flex items-center gap-2">
            <Users size={20} /> أفضل 5 طلاب وأكثر 5 يحتاجون مساعدة
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {classPerformances.map((perf, idx) => (
              <div key={idx} className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
                <div className="bg-slate-900/50 p-4 border-b border-slate-700">
                  <h3 className="font-bold text-white">{perf.className}</h3>
                  <p className="text-sm text-slate-400">{perf.subject}</p>
                </div>
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-emerald-400 font-semibold mb-3 text-sm flex items-center gap-1"><CheckCircle size={14}/> الأفضل أداءً</h4>
                    <div className="space-y-2">
                      {perf.top5.map((s: any, i: number) => (
                        <div key={i} className="flex justify-between items-center bg-slate-900/30 p-2 rounded-lg text-sm border border-slate-700/50">
                           <span className="text-white truncate" title={s.name}>{s.name}</span>
                           <span className="font-bold text-emerald-400 shrink-0" dir="ltr">{Math.round(s.average)}%</span>
                        </div>
                      ))}
                      {perf.top5.length === 0 && <span className="text-slate-500 text-xs">لا يوجد بيانات</span>}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-amber-400 font-semibold mb-3 text-sm flex items-center gap-1"><AlertTriangle size={14}/> بحاجة لمساعدة</h4>
                    <div className="space-y-2">
                      {perf.bottom5.map((s: any, i: number) => (
                        <div key={i} className="flex justify-between items-center bg-slate-900/30 p-2 rounded-lg text-sm border border-slate-700/50">
                           <span className="text-white truncate" title={s.name}>{s.name}</span>
                           <span className="font-bold text-amber-400 shrink-0" dir="ltr">{Math.round(s.average)}%</span>
                        </div>
                      ))}
                      {perf.bottom5.length === 0 && <span className="text-slate-500 text-xs">لا يوجد بيانات</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
