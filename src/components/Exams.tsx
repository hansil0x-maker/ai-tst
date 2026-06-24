import { useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Plus, Trash2, FileText, Printer, Send, Download } from 'lucide-react';
import CreateExamFlow from './CreateExamFlow';
import { syncManager } from '../sync';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import QRCode from 'qrcode';

export default function Exams() {
  const [isCreating, setIsCreating] = useState(false);
  const exams = useLiveQuery(() => db.exams.toArray()) || [];
  const classes = useLiveQuery(() => db.classes.toArray()) || [];
  const settings = useLiveQuery(() => db.settings.get(1));

  const deleteExam = async (id: number) => {
    // Custom delete without window.confirm due to iframe limitations
    await db.exams.delete(id);
    const relatedResults = await db.results.where('examId').equals(id).toArray();
    for (const r of relatedResults) {
      if (r.id) await db.results.delete(r.id);
    }
    toast.success('تم حذف الامتحان بنجاح');
  };

  const handlePrintExam = async (exam: any) => {
    if (!settings) return;
    const examClass = classes.find(c => c.id === exam.classId);
    if (!examClass) { toast.error('لم يتم العثور على الصف'); return; }
    const classStudents = await db.students.where('classId').equals(exam.classId).toArray();
    
    if (classStudents.length === 0) {
      toast.error('الصف المحدد لا يحتوي على طلاب. أضف طلاب لطباعة أوراق الامتحان.');
      return;
    }

    const t = toast.loading('جاري تجهيز ملف الطباعة...');
    
    // Create a hidden container for rendering the pages
    const printContainer = document.createElement('div');
    printContainer.style.position = 'absolute';
    printContainer.style.left = '-9999px';
    printContainer.style.top = '0';
    printContainer.style.width = '794px'; // A4 width at 96 DPI
    printContainer.style.backgroundColor = '#fff';
    printContainer.style.color = '#000';
    printContainer.dir = 'rtl';
    printContainer.style.fontFamily = 'sans-serif';
    document.body.appendChild(printContainer);

    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      for (let i = 0; i < classStudents.length; i++) {
        const student = classStudents[i];
        
        // Generate QR code data URL
        const qrDataUrl = await QRCode.toDataURL(student.serialNumber, { margin: 1, width: 80 });

        const pageHtml = `
          <div class="page" style="width: 794px; min-height: 1123px; padding: 40px; box-sizing: border-box; background: white;">
            <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px;">
              <div style="font-size: 24px; font-weight: bold;">${settings.schoolName || 'اسم المدرسة'}</div>
              <div style="font-size: 14px; color: #555;">العام الدراسي: ${settings.academicYear || ''}</div>
            </div>
            
            <div style="display: flex; justify-content: space-between; margin-bottom: 20px; align-items: flex-start;">
              <div style="flex: 1; font-size: 16px; line-height: 1.8;">
                <div><strong>الطالب:</strong> ${student.name}</div>
                <div><strong>الصف:</strong> ${examClass.name}</div>
                <div><strong>الرقم التسلسلي:</strong> ${student.serialNumber}</div>
              </div>
              <div style="flex: 1; font-size: 16px; line-height: 1.8;">
                <div><strong>الامتحان:</strong> ${exam.title}</div>
                <div><strong>المادة:</strong> ${exam.subject}</div>
                <div><strong>التاريخ:</strong> ${new Date(exam.date).toLocaleDateString('ar-EG')}</div>
              </div>
              <div style="width: 80px; height: 80px; border: 2px dashed #000; padding: 4px;">
                <img src="${qrDataUrl}" width="100%" height="100%" />
              </div>
            </div>
            
            <hr style="border: 0; border-bottom: 2px solid #000; margin-bottom: 30px;" />
            
            <div>
              ${exam.questions.map((qInfo: any) => `
                <div style="margin-bottom: 25px; display: flex; align-items: flex-start; justify-content: space-between; page-break-inside: avoid;">
                  <div style="flex: 1; margin-left: 20px;">
                    <div style="font-weight: bold; margin-bottom: 10px; font-size: 16px;">${qInfo.id}. ${qInfo.text}</div>
                    <div style="margin-right: 20px; font-size: 14px; line-height: 1.6;">
                      <div>أ) ${qInfo.options.A || ''}</div>
                      <div>ب) ${qInfo.options.B || ''}</div>
                      <div>ج) ${qInfo.options.C || ''}</div>
                      <div>د) ${qInfo.options.D || ''}</div>
                    </div>
                  </div>
                  <div style="display: flex; gap: 15px; direction: ltr; margin-top: 10px;">
                    <div style="width: 25px; height: 25px; border: 2px solid #000; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">A</div>
                    <div style="width: 25px; height: 25px; border: 2px solid #000; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">B</div>
                    <div style="width: 25px; height: 25px; border: 2px solid #000; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">C</div>
                    <div style="width: 25px; height: 25px; border: 2px solid #000; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">D</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
        
        printContainer.innerHTML = pageHtml;
        
        // Render to canvas
        const canvas = await html2canvas(printContainer.firstElementChild as HTMLElement, {
          scale: 2,
          useCORS: true,
          logging: false
        });
        
        const imgData = canvas.toDataURL('image/png');
        
        if (i > 0) {
          pdf.addPage();
        }
        
        pdf.addImage(imgData, 'PNG', 0, 0, 210, 297);
      }
      
      pdf.save(`exam_${exam.title}.pdf`);
      toast.success('تم إنشاء ملف الطباعة بنجاح', { id: t });
    } catch (error) {
      console.error(error);
      toast.error('حدث خطأ أثناء تجهيز ملف الطباعة', { id: t });
    } finally {
      document.body.removeChild(printContainer);
    }
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
