import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Plus, Trash2, FileText, Printer, Send } from 'lucide-react';
import CreateExamFlow from './CreateExamFlow';
import { syncManager } from '../sync';

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

    const printWindow = document.createElement('iframe');
    printWindow.style.position = 'absolute';
    printWindow.style.top = '-10000px';
    document.body.appendChild(printWindow);

    const doc = printWindow.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
        <head>
          <meta charset="UTF-8">
          <title>طباعة الامتحان</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; }
            .page { width: 210mm; min-height: 297mm; padding: 20mm; margin: 0 auto; box-sizing: border-box; page-break-after: always; position: relative; }
            .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
            .school-name { font-size: 24px; font-weight: bold; }
            .year { font-size: 14px; color: #555; }
            .meta { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 14px; }
            .meta div { flex: 1; }
            .qr-box { width: 80px; height: 80px; border: 2px dashed #000; display: flex; align-items: center; justify-content: center; font-size: 10px; flex-shrink: 0; margin-right: 20px; }
            .content-row { display: flex; align-items: flex-start; justify-content: space-between; }
            .questions { margin-top: 20px; }
            .question { margin-bottom: 25px; display: flex; align-items: flex-start; justify-content: space-between; }
            .q-text { flex: 1; margin-left: 20px; font-size: 14px; line-height: 1.5; }
            .options { display: flex; gap: 15px; direction: ltr; }
            .bubble { width: 20px; height: 20px; border: 1px solid #000; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; }
            @media print {
              body { background: #fff; }
              .page { margin: 0; padding: 15mm; border: none; }
            }
          </style>
        </head>
        <body>
    `);

    for (let i = 0; i < classStudents.length; i++) {
        const student = classStudents[i];
        doc.write(`
          <div class="page">
            <div class="header">
              <div class="school-name">${settings.schoolName || 'اسم المدرسة'}</div>
              <div class="year">العام الدراسي: ${settings.academicYear || ''}</div>
            </div>
            <div class="content-row">
              <div class="meta">
                <div>
                  <p><strong>الطالب:</strong> ${student.name}</p>
                  <p><strong>الصف:</strong> ${examClass.name}</p>
                  <p><strong>الرقم التسلسلي:</strong> ${student.serialNumber}</p>
                </div>
                <div>
                  <p><strong>الامتحان:</strong> ${exam.title}</p>
                  <p><strong>المادة:</strong> ${exam.subject}</p>
                  <p><strong>التاريخ:</strong> ${new Date(exam.date).toLocaleDateString('ar-EG')}</p>
                </div>
              </div>
              <div class="qr-box">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(student.serialNumber)}" alt="QR" width="80" height="80"/>
              </div>
            </div>
            
            <hr style="margin: 20px 0; border: 0; border-bottom: 1px solid #000;" />
            
            <div class="questions">
        `);

        for (let qInfo of exam.questions) {
          doc.write(`
              <div class="question">
                <div class="q-text">
                  <div style="font-weight: bold; margin-bottom: 10px;">${qInfo.id}. ${qInfo.text}</div>
                  <div style="margin-right: 15px; font-size: 13px;">
                    <div>أ) ${qInfo.options.A || ''}</div>
                    <div>ب) ${qInfo.options.B || ''}</div>
                    <div>ج) ${qInfo.options.C || ''}</div>
                    <div>د) ${qInfo.options.D || ''}</div>
                  </div>
                </div>
                <div class="options" style="margin-top: 15px;">
                  <div class="bubble">A</div>
                  <div class="bubble">B</div>
                  <div class="bubble">C</div>
                  <div class="bubble">D</div>
                </div>
              </div>
          `);
        }

        doc.write(`
            </div>
          </div>
        `);
    }

    doc.write(`
        </body>
      </html>
    `);
    doc.close();

    // Wait for images (QR codes) to load
    setTimeout(() => {
      printWindow.contentWindow?.focus();
      printWindow.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(printWindow);
      }, 1000);
    }, 1500);
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
              <button onClick={() => syncManager.broadcastExam(exam)} className="flex-1 sm:flex-none justify-center flex items-center space-x-1 space-x-reverse bg-emerald-900 border border-emerald-600 hover:border-emerald-500 text-emerald-300 px-3 py-2 rounded-lg transition-colors">
                <Send size={18} /> <span className="sm:hidden text-sm">إرسال للمصححين</span>
              </button>
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
