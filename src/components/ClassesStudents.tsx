import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ClassesStudents() {
  const classes = useLiveQuery(() => db.classes.toArray()) || [];
  const students = useLiveQuery(() => db.students.toArray()) || [];
  
  const [activeTab, setActiveTab] = useState<'classes'|'students'>('classes');
  const [newClassName, setNewClassName] = useState('');
  const [newClassSubj, setNewClassSubj] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentSerial, setNewStudentSerial] = useState('');
  const [newStudentClassId, setNewStudentClassId] = useState<number>(0);

  const addClass = async () => {
    if (!newClassName || !newClassSubj) {
      toast.error('الرجاء تعبئة جميع الحقول');
      return;
    }
    await db.classes.add({ name: newClassName, subject: newClassSubj });
    setNewClassName(''); setNewClassSubj('');
    toast.success('تمت إضافة الصف بنجاح');
  };

  const addStudent = async () => {
    if (!newStudentName || !newStudentSerial || newStudentClassId === 0) {
      toast.error('الرجاء تعبئة جميع الحقول');
      return;
    }
    await db.students.add({ name: newStudentName, serialNumber: newStudentSerial, classId: newStudentClassId });
    setNewStudentName(''); setNewStudentSerial('');
    toast.success('تمت إضافة الطالب بنجاح');
  };

  const deleteClass = async (id: number) => {
    // Iframe friendly delete
    await db.classes.delete(id);
    const relatedStudents = await db.students.where('classId').equals(id).toArray();
    for (const s of relatedStudents) {
      if (s.id) await db.students.delete(s.id);
    }
    toast.success('تم حذف الصف بنجاح');
  };

  const deleteStudent = async (id: number) => {
    // Iframe friendly delete
    await db.students.delete(id);
    toast.success('تم حذف الطالب بنجاح');
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex border-b border-slate-700">
        <button className={`flex-1 py-3 font-medium transition-colors ${activeTab === 'classes' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-slate-400'}`} onClick={() => setActiveTab('classes')}>الصفوف</button>
        <button className={`flex-1 py-3 font-medium transition-colors ${activeTab === 'students' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-slate-400'}`} onClick={() => setActiveTab('students')}>الطلاب</button>
      </div>

      {activeTab === 'classes' && (
        <div className="space-y-4">
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-3">
            <h3 className="font-semibold text-lg text-white">إضافة صف جديد</h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <input type="text" placeholder="اسم الصف (مثال: العاشر أ)" value={newClassName} onChange={e=>setNewClassName(e.target.value)} className="flex-1 bg-slate-900 border border-slate-600 rounded-lg p-3 text-white outline-none focus:border-blue-500" />
              <input type="text" placeholder="المادة (مثال: رياضيات)" value={newClassSubj} onChange={e=>setNewClassSubj(e.target.value)} className="flex-1 bg-slate-900 border border-slate-600 rounded-lg p-3 text-white outline-none focus:border-blue-500" />
              <button onClick={addClass} className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-lg flex items-center justify-center shrink-0 w-full sm:w-auto"><Plus size={20} /> إضافة</button>
            </div>
          </div>
          <div className="space-y-2">
            {classes.map(c => (
              <div key={c.id} className="flex justify-between items-center bg-slate-800 p-4 rounded-xl border border-slate-700">
                <div>
                  <p className="font-medium text-white">{c.name}</p>
                  <p className="text-sm text-slate-400">{c.subject}</p>
                </div>
                <button onClick={() => c.id && deleteClass(c.id)} className="text-red-400 hover:text-red-300 p-2"><Trash2 size={20} /></button>
              </div>
            ))}
            {classes.length === 0 && <p className="text-slate-500 text-center py-4">لم تتم إضافة أي صفوف بعد.</p>}
          </div>
        </div>
      )}

      {activeTab === 'students' && (
        <div className="space-y-4">
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-3">
             <h3 className="font-semibold text-lg text-white">إضافة طالب جديد</h3>
             <div className="flex flex-col sm:flex-row gap-3">
                <input type="text" placeholder="الاسم الكامل" value={newStudentName} onChange={e=>setNewStudentName(e.target.value)} className="flex-1 bg-slate-900 border border-slate-600 rounded-lg p-3 text-white outline-none focus:border-blue-500" />
                <input type="text" placeholder="الرقم التسلسلي (باركود أو رقم فريد)" value={newStudentSerial} onChange={e=>setNewStudentSerial(e.target.value)} className="flex-1 bg-slate-900 border border-slate-600 rounded-lg p-3 text-white outline-none focus:border-blue-500" />
             </div>
             <div className="flex flex-col sm:flex-row gap-3">
                <select value={newStudentClassId} onChange={e=>setNewStudentClassId(Number(e.target.value))} className="flex-1 bg-slate-900 border border-slate-600 rounded-lg p-3 text-white outline-none focus:border-blue-500">
                  <option value={0}>اختر الصف...</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.subject})</option>)}
                </select>
                <button onClick={addStudent} className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-lg flex items-center justify-center shrink-0 w-full sm:w-auto"><Plus size={20} /> إضافة</button>
             </div>
          </div>
          <div className="space-y-2">
            {students.map(s => (
              <div key={s.id} className="flex justify-between items-center bg-slate-800 p-4 rounded-xl border border-slate-700">
                <div>
                  <p className="font-medium text-white">{s.name}</p>
                  <p className="text-sm text-slate-400">الصف: {classes.find(c=>c.id===s.classId)?.name || 'غير معروف'} | التسلسل: <span className="font-mono">{s.serialNumber}</span></p>
                </div>
                <button onClick={() => s.id && deleteStudent(s.id)} className="text-red-400 hover:text-red-300 p-2"><Trash2 size={20} /></button>
              </div>
            ))}
            {students.length === 0 && <p className="text-slate-500 text-center py-4">لم تتم إضافة أي طلاب بعد.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
