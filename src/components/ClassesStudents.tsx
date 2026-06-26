import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Plus, Trash2, Search, BrainCircuit } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ClassesStudents() {
  const classes = useLiveQuery(() => db.classes.toArray()) || [];
  const students = useLiveQuery(() => db.students.toArray()) || [];
  const results = useLiveQuery(() => db.results.toArray()) || [];
  const exams = useLiveQuery(() => db.exams.toArray()) || [];
  
  const [newClassName, setNewClassName] = useState('');
  const [newClassSubj, setNewClassSubj] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentClassId, setNewStudentClassId] = useState<number>(0);

  const [classFilter, setClassFilter] = useState('');
  const [studentFilter, setStudentFilter] = useState('');
  
  const [visibleClasses, setVisibleClasses] = useState(5);
  const [visibleStudents, setVisibleStudents] = useState(10);

  const [aiAnalysis, setAiAnalysis] = useState<{classId: number, text: string, loading: boolean} | null>(null);

  const addClass = async () => {
    if (!newClassName || !newClassSubj) {
      toast.error('الرجاء تعبئة جميع الحقول');
      return;
    }
    const currentSettings = await db.settings.get(1);
    await db.classes.add({ name: newClassName, subject: newClassSubj, academicYear: currentSettings?.academicYear || '2026-2027' });
    setNewClassName(''); setNewClassSubj('');
    toast.success('تمت إضافة الصف بنجاح');
  };

  const addStudent = async () => {
    if (!newStudentName || newStudentClassId === 0) {
      toast.error('الرجاء تعبئة جميع الحقول');
      return;
    }
    const generatedSerial = `STU-${Math.floor(100000 + Math.random() * 900000)}`;
    await db.students.add({ name: newStudentName, serialNumber: generatedSerial, classId: newStudentClassId });
    setNewStudentName('');
    toast.success('تمت إضافة الطالب بنجاح');
  };

  const deleteClass = async (id: number) => {
    await db.classes.delete(id);
    const relatedStudents = await db.students.where('classId').equals(id).toArray();
    for (const s of relatedStudents) {
      if (s.id) await db.students.delete(s.id);
    }
    toast.success('تم حذف الصف بنجاح');
  };

  const deleteStudent = async (id: number) => {
    await db.students.delete(id);
    toast.success('تم حذف الطالب بنجاح');
  };

  const runAiAnalysis = async (classObj: any) => {
    setAiAnalysis({ classId: classObj.id, text: '', loading: true });
    try {
      const classStudents = students.filter(s => s.classId === classObj.id);
      const classExams = exams.filter(e => e.classId === classObj.id);
      const classResults = results.filter(r => classExams.some(e => e.id === r.examId));
      
      const stats = {
        className: classObj.name,
        subject: classObj.subject,
        studentCount: classStudents.length,
        examsCount: classExams.length,
        averageScore: classResults.length > 0 ? classResults.reduce((sum, r) => sum + r.score, 0) / classResults.length : 0
      };

      const prompt = `أنت مساعد ذكاء اصطناعي لتقييم أداء الطلاب. قم بتحليل أداء هذا الصف واقترح موضوعاً للامتحان القادم لتحسين درجاتهم.
      بيانات الصف:
      - الاسم: ${stats.className}
      - المادة: ${stats.subject}
      - عدد الطلاب: ${stats.studentCount}
      - عدد الامتحانات: ${stats.examsCount}
      - متوسط الدرجات: ${stats.averageScore.toFixed(1)} من 100
      
      اكتب تعليقاً مختصراً ومفيداً باللغة العربية (3 أسطر كحد أقصى) يقترح موضوعاً معيناً للتركيز عليه في الامتحان القادم.`;

      const response = await fetch('/api/generate-recommendation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      if (!response.ok) throw new Error('Failed to generate recommendation');
      const data = await response.json();
      setAiAnalysis({ classId: classObj.id, text: data.text, loading: false });
    } catch (error) {
      toast.error('فشل توليد التحليل');
      setAiAnalysis(null);
    }
  };

  const filteredClasses = classes.filter(c => c.name.includes(classFilter) || c.subject.includes(classFilter));
  const filteredStudents = students.filter(s => s.name.includes(studentFilter) || s.serialNumber.includes(studentFilter));

  return (
    <div className="space-y-8 pb-20">
      
      {/* Classes Section */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-white border-b border-slate-700 pb-2">إدارة الصفوف</h2>
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-3">
          <h3 className="font-semibold text-lg text-white">إضافة صف جديد</h3>
          <div className="flex flex-col sm:flex-row gap-3">
            <input type="text" placeholder="اسم الصف (مثال: العاشر أ)" value={newClassName} onChange={e=>setNewClassName(e.target.value)} className="flex-1 bg-slate-900 border border-slate-600 rounded-lg p-3 text-white outline-none focus:border-blue-500" />
            <input type="text" placeholder="المادة (مثال: رياضيات)" value={newClassSubj} onChange={e=>setNewClassSubj(e.target.value)} className="flex-1 bg-slate-900 border border-slate-600 rounded-lg p-3 text-white outline-none focus:border-blue-500" />
            <button onClick={addClass} className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-lg flex items-center justify-center shrink-0 w-full sm:w-auto"><Plus size={20} /> إضافة</button>
          </div>
        </div>
        
        <div className="relative">
          <Search className="absolute right-3 top-3 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="بحث في الصفوف..." 
            value={classFilter} 
            onChange={e=>setClassFilter(e.target.value)} 
            className="w-full bg-slate-900 border border-slate-700 rounded-lg py-3 pr-10 pl-4 text-white outline-none focus:border-blue-500" 
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredClasses.slice(0, visibleClasses).map(c => (
            <div key={c.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col gap-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold text-lg text-white">{c.name}</p>
                  <p className="text-sm text-blue-400">{c.subject}</p>
                </div>
                <button onClick={() => c.id && deleteClass(c.id)} className="text-red-400 hover:text-red-300 p-2"><Trash2 size={20} /></button>
              </div>
              
              <div className="pt-2 border-t border-slate-700">
                <button 
                  onClick={() => runAiAnalysis(c)}
                  disabled={aiAnalysis?.loading && aiAnalysis?.classId === c.id}
                  className="w-full flex justify-center items-center gap-2 bg-indigo-900/40 hover:bg-indigo-900/60 text-indigo-300 py-2 rounded-lg transition-colors text-sm border border-indigo-500/30"
                >
                  <BrainCircuit size={16} /> 
                  {aiAnalysis?.loading && aiAnalysis?.classId === c.id ? 'جاري التحليل...' : 'تحليل أداء الصف عبر الذكاء الاصطناعي'}
                </button>
                
                {aiAnalysis && aiAnalysis.classId === c.id && !aiAnalysis.loading && (
                  <div className="mt-3 p-3 bg-slate-900 rounded-lg text-sm text-slate-300 leading-relaxed border border-slate-700">
                    <span className="text-indigo-400 font-bold block mb-1">توصية الذكاء الاصطناعي:</span>
                    {aiAnalysis.text}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        {filteredClasses.length === 0 && <p className="text-slate-500 text-center py-4">لم يتم العثور على صفوف.</p>}
        {filteredClasses.length > visibleClasses && (
          <div className="text-center pt-2">
            <button onClick={() => setVisibleClasses(v => v + 5)} className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-full transition-colors border border-slate-700 text-sm">
              عرض المزيد
            </button>
          </div>
        )}
      </div>

      {/* Students Section */}
      <div className="space-y-4 pt-4">
        <h2 className="text-2xl font-bold text-white border-b border-slate-700 pb-2">إدارة الطلاب</h2>
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-3">
           <h3 className="font-semibold text-lg text-white">إضافة طالب جديد</h3>
           <div className="flex flex-col sm:flex-row gap-3">
              <input type="text" placeholder="الاسم الكامل" value={newStudentName} onChange={e=>setNewStudentName(e.target.value)} className="flex-1 bg-slate-900 border border-slate-600 rounded-lg p-3 text-white outline-none focus:border-blue-500" />
              <select value={newStudentClassId} onChange={e=>setNewStudentClassId(Number(e.target.value))} className="flex-1 bg-slate-900 border border-slate-600 rounded-lg p-3 text-white outline-none focus:border-blue-500">
                <option value={0}>اختر الصف...</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.subject})</option>)}
              </select>
              <button onClick={addStudent} className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-lg flex items-center justify-center shrink-0 w-full sm:w-auto"><Plus size={20} /> إضافة</button>
           </div>
        </div>

        <div className="relative">
          <Search className="absolute right-3 top-3 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="بحث في الطلاب (بالاسم أو التسلسل)..." 
            value={studentFilter} 
            onChange={e=>setStudentFilter(e.target.value)} 
            className="w-full bg-slate-900 border border-slate-700 rounded-lg py-3 pr-10 pl-4 text-white outline-none focus:border-blue-500" 
          />
        </div>

        <div className="space-y-2">
          {filteredStudents.slice(0, visibleStudents).map(s => (
            <div key={s.id} className="flex justify-between items-center bg-slate-800 p-4 rounded-xl border border-slate-700">
              <div>
                <p className="font-medium text-white">{s.name}</p>
                <p className="text-sm text-slate-400">الصف: {classes.find(c=>c.id===s.classId)?.name || 'غير معروف'} | التسلسل: <span className="font-mono text-blue-400">{s.serialNumber}</span></p>
              </div>
              <button onClick={() => s.id && deleteStudent(s.id)} className="text-red-400 hover:text-red-300 p-2"><Trash2 size={20} /></button>
            </div>
          ))}
          {filteredStudents.length === 0 && <p className="text-slate-500 text-center py-4">لم يتم العثور على طلاب.</p>}
          {filteredStudents.length > visibleStudents && (
            <div className="text-center pt-2">
              <button onClick={() => setVisibleStudents(v => v + 10)} className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-full transition-colors border border-slate-700 text-sm">
                عرض المزيد
              </button>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
