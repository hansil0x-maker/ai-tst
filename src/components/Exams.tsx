import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Plus, Trash2, FileText, Printer } from 'lucide-react';
import CreateExamFlow from './CreateExamFlow';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export default function Exams() {
  const [isCreating, setIsCreating] = useState(false);
  const exams = useLiveQuery(() => db.exams.toArray()) || [];
  const classes = useLiveQuery(() => db.classes.toArray()) || [];
  const settings = useLiveQuery(() => db.settings.get(1));

  const deleteExam = async (id: number) => {
    if (confirm('هل أنت متأكد من حذف هذا الامتحان؟')) {
      await db.exams.delete(id);
      const relatedResults = await db.results.where('examId').equals(id).toArray();
      for (const r of relatedResults) {
        if (r.id) await db.results.delete(r.id);
      }
    }
  };

  const handlePrintExam = async (exam: any) => {
    if (!settings) return;
    const examClass = classes.find(c => c.id === exam.classId);
    if (!examClass) { alert('لم يتم العثور على الصف'); return; }
    const classStudents = await db.students.where('classId').equals(exam.classId).toArray();
    
    if (classStudents.length === 0) {
      alert('الصف المحدد لا يحتوي على طلاب. أضف طلاب لطباعة أوراق الامتحان.');
      return;
    }

    const doc = new jsPDF({ format: 'a4', unit: 'mm' });
    
    for (let i = 0; i < classStudents.length; i++) {
        if (i > 0) doc.addPage();
        const student = classStudents[i];
        
        doc.setFontSize(16);
        doc.text(settings.schoolName || 'School Name', 105, 20, { align: 'center' });
        doc.setFontSize(12);
        doc.text(`Academic Year: ${settings.academicYear || ''}`, 105, 27, { align: 'center' });
        
        doc.setLineWidth(0.5);
        doc.line(20, 32, 190, 32);

        doc.setFontSize(11);
        doc.text(`Exam: ${exam.title}`, 20, 42);
        doc.text(`Subject: ${exam.subject}`, 20, 49);
        doc.text(`Date: ${new Date(exam.date).toLocaleDateString()}`, 20, 56);
        
        doc.text(`Student: ${student.name}`, 120, 42);
        doc.text(`Class: ${examClass.name}`, 120, 49);
        doc.text(`Serial: ${student.serialNumber}`, 120, 56);
        
        doc.setLineWidth(1);
        doc.rect(170, 40, 20, 20);
        doc.setFontSize(8);
        doc.text('CODE HERE', 172, 50);

        doc.setLineWidth(0.5);
        doc.line(20, 62, 190, 62);

        doc.setFontSize(10);
        let y = 70;
        const qList = exam.questions;
        for (let qInfo of qList) {
          if (y > 270) {
            doc.addPage();
            y = 20;
          }
          doc.text(`${qInfo.id}. ${qInfo.text}`, 20, y, { maxWidth: 120 });
          
          doc.circle(150, y-1, 2); doc.text('A', 149, y);
          doc.circle(160, y-1, 2); doc.text('B', 159, y);
          doc.circle(170, y-1, 2); doc.text('C', 169, y);
          doc.circle(180, y-1, 2); doc.text('D', 179, y);
          
          y += 12;
        }
    }
    
    doc.save(`${exam.title.replace(/\s+/g, '_')}_Papers.pdf`);
  };

  if (isCreating) return <CreateExamFlow onCancel={() => setIsCreating(false)} onComplete={() => setIsCreating(false)} />;

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-center border-b border-slate-700 pb-4">
        <h2 className="text-2xl font-semibold">إدارة الامتحانات</h2>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 space-x-reverse transition-colors" onClick={() => setIsCreating(true)}>
          <Plus size={20} /> <span>امتحان ذكي جديد</span>
        </button>
      </div>

      <div className="space-y-4">
        {exams.map(exam => (
          <div key={exam.id} className="bg-slate-800 p-5 rounded-2xl border border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-xl font-bold text-white mb-1" dir="auto">{exam.title}</h3>
              <p className="text-slate-400 text-sm flex items-center gap-2">
                <span className="bg-slate-900 px-2 py-1 rounded text-slate-300 pointer-events-none">{exam.subject}</span>
                <span dir="ltr">{new Date(exam.date).toLocaleDateString()}</span>
                <span>الأسئلة: {exam.questions?.length || 0}</span>
              </p>
            </div>
            <div className="flex space-x-2 space-x-reverse w-full sm:w-auto">
              <button onClick={() => handlePrintExam(exam)} className="flex-1 sm:flex-none justify-center flex items-center space-x-1 space-x-reverse bg-slate-900 border border-slate-600 hover:border-blue-500 text-slate-300 px-3 py-2 rounded-lg transition-colors">
                <Printer size={18} /> <span className="sm:hidden text-sm">طباعة</span>
              </button>
              <button onClick={() => exam.id && deleteExam(exam.id)} className="flex-1 sm:flex-none justify-center flex items-center space-x-1 space-x-reverse bg-slate-900 border border-slate-600 hover:border-red-500 text-red-500 px-3 py-2 rounded-lg transition-colors">
                 <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
        {exams.length === 0 && (
          <div className="text-center py-12 bg-slate-800/50 rounded-2xl border border-slate-700 border-dashed">
            <FileText size={48} className="mx-auto text-slate-500 mb-4" />
            <p className="text-slate-400 text-lg">لم يتم توليد أي امتحانات بعد.</p>
            <p className="text-slate-500 text-sm">انقر على "امتحان ذكي جديد" للبدء في توليد امتحان عبر الذكاء الاصطناعي.</p>
          </div>
        )}
      </div>
    </div>
  );
}
