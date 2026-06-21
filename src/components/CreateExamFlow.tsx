import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { ArrowLeft, Loader2, Sparkles, Check, CheckSquare, UploadCloud, X } from 'lucide-react';
import type { Question } from '../types';
import toast from 'react-hot-toast';

export default function CreateExamFlow({ onCancel, onComplete }: { onCancel: () => void, onComplete: () => void }) {
  const classes = useLiveQuery(() => db.classes.toArray()) || [];
  
  const [step, setStep] = useState(1);
  
  const [title, setTitle] = useState('');
  const [classId, setClassId] = useState<number>(0);
  const [subject, setSubject] = useState('');
  const [notes, setNotes] = useState('');
  const [contentBlock, setContentBlock] = useState('');
  
  const [files, setFiles] = useState<{name: string, data: string, mimeType: string}[]>([]);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<Question[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;
    
    Array.from(selectedFiles).forEach((file: File) => {
      if (file.type.startsWith('image/')) {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        
        img.onload = () => {
          URL.revokeObjectURL(objectUrl);
          
          const maxDim = 800;
          let width = img.width;
          let height = img.height;
          
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = (height / width) * maxDim;
              width = maxDim;
            } else {
              width = (width / height) * maxDim;
              height = maxDim;
            }
          }
          
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
            const base64Data = dataUrl.split(',')[1];
            setFiles(prev => [...prev, { name: file.name, data: base64Data, mimeType: 'image/jpeg' }]);
          }
        };
        img.src = objectUrl;
      } else {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const base64Url = ev.target?.result as string;
          if (!base64Url) return;
          const base64Data = base64Url.split(',')[1];
          setFiles(prev => [...prev, { name: file.name, data: base64Data, mimeType: file.type }]);
        };
        reader.readAsDataURL(file);
      }
    });
  };

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleGenerate = async () => {
    if (!navigator.onLine) {
      toast.error('أنت غير متصل بالإنترنت. يرجى الاتصال بالإنترنت لتوليد الامتحان.');
      return;
    }
    
    if (!contentBlock && files.length === 0 && !notes) {
      toast.error('الرجاء توفير محتوى، خطة منهج، أو كتابة ملاحظات لتوليد الامتحان.');
      setErrorMsg('الرجاء توفير محتوى، خطة منهج، أو كتابة ملاحظات لتوليد الامتحان.');
      return;
    }
    setErrorMsg('');
    setIsGenerating(true);
    toast.loading('جاري توليد الامتحان عبر الذكاء الاصطناعي...', { id: 'generate' });
    try {
      const res = await fetch('/api/generate-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: notes, content: contentBlock, files })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل التوليد');
      
      if (data.questions && Array.isArray(data.questions)) {
        setGeneratedQuestions(data.questions);
        setStep(2);
        toast.success('تم التوليد بنجاح', { id: 'generate' });
      } else {
        throw new Error('تنسيق JSON غير صالح من الذكاء الاصطناعي.');
      }
    } catch (error: any) {
      setErrorMsg(error.message);
      toast.error(error.message, { id: 'generate' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveExam = async () => {
    if (!title || classId === 0 || !subject) {
      toast.error('يرجى العودة والرجاء ملء بيانات الامتحان الأساسية (العنوان، المادة، الصف) قبل الحفظ.');
      setStep(1);
      return;
    }

    const correctAnswers: Record<number, string> = {};
    generatedQuestions.forEach(q => {
      correctAnswers[q.id] = q.correctAnswer;
    });

    await db.exams.add({
      title,
      classId,
      subject,
      date: new Date().toISOString(),
      totalMarks: generatedQuestions.length,
      passMark: Math.floor(generatedQuestions.length * 0.5),
      questions: generatedQuestions,
      correctAnswers,
      status: 'Pending'
    });
    
    toast.success('تم اعتماد وحفظ الامتحان!');
    onComplete();
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center space-x-3 space-x-reverse border-b border-slate-700 pb-4">
        <button onClick={onCancel} className="p-2 hover:bg-slate-800 rounded-full transition-colors"><ArrowLeft size={20} className="transform rotate-180" /></button>
        <h2 className="text-2xl font-semibold">توليد امتحان بالذكاء الاصطناعي</h2>
      </div>

      {step === 1 && (
        <div className="space-y-4 max-w-2xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">عنوان الامتحان</label>
              <input type="text" value={title} onChange={e=>setTitle(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-blue-500 outline-none" placeholder="اختبار الفصل الأول..." />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">المادة</label>
              <input type="text" value={subject} onChange={e=>setSubject(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-blue-500 outline-none" placeholder="الرياضيات..." />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm text-slate-400 mb-1">الصف المستهدف</label>
              <select value={classId} onChange={e=>setClassId(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-blue-500 outline-none">
                <option value={0}>اختر الصف...</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.subject})</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">المحتوى / المنهج (الصق النص)</label>
            <textarea value={contentBlock} onChange={e=>setContentBlock(e.target.value)} rows={4} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-blue-500 outline-none resize-none font-mono text-sm" placeholder="قم بلصق محتوى القراءة أو المنهج هنا..."></textarea>
          </div>
          
          <div className="bg-slate-800 p-4 border border-slate-700 rounded-xl">
             <label className="block text-sm text-slate-400 mb-2">أو ارفع صور / ملفات PDF</label>
             <div className="flex flex-col gap-3">
               <label className="flex items-center justify-center w-full bg-slate-900 border border-dashed border-slate-600 hover:border-blue-500 text-slate-300 rounded-xl p-6 cursor-pointer focus:outline-none transition-colors">
                  <div className="flex items-center space-x-2 space-x-reverse">
                    <UploadCloud size={24} /> <span>اختر صور أو ملفات PDF</span>
                  </div>
                  <input type="file" multiple accept="image/*, .pdf" className="hidden" onChange={handleFileUpload} />
               </label>
               {files.length > 0 && (
                 <div className="flex flex-wrap gap-2">
                   {files.map((file, idx) => (
                     <div key={idx} className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1 flex items-center space-x-2 space-x-reverse text-sm">
                       <span className="truncate max-w-[150px]">{file.name}</span>
                       <button onClick={() => removeFile(idx)} className="text-red-400 hover:text-red-300"><X size={14} /></button>
                     </div>
                   ))}
                 </div>
               )}
             </div>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">ملاحظات إضافية (اختياري)</label>
            <input type="text" value={notes} onChange={e=>setNotes(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-blue-500 outline-none" placeholder="مثال: قم بإنشاء 10 أسئلة صعبة جداً..." />
          </div>

          {errorMsg && <div className="p-4 bg-red-900/30 border border-red-800 text-red-200 rounded-xl text-sm">{errorMsg}</div>}

          <button onClick={handleGenerate} disabled={isGenerating} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-4 rounded-xl transition-colors flex items-center justify-center space-x-2 space-x-reverse">
            {isGenerating ? <Loader2 className="animate-spin" /> : <Sparkles />}
            <span>{isGenerating ? 'جاري التوليد...' : 'توليد بالذكاء الاصطناعي'}</span>
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
           <div className="bg-emerald-900/20 border border-emerald-800 p-4 rounded-2xl flex items-start space-x-3 space-x-reverse">
             <div className="p-2 bg-emerald-900/50 rounded-full text-emerald-400"><CheckSquare size={24} /></div>
             <div>
               <h3 className="font-semibold text-emerald-400 text-lg">تم توليد الامتحان بنجاح</h3>
               <p className="text-emerald-200/70 text-sm">قم بمراجعة الأسئلة الـ {generatedQuestions.length} أدناه. يمكنك القبول والحفظ.</p>
             </div>
           </div>
           
           <div className="space-y-4">
             {generatedQuestions.map((q, idx) => (
               <div key={idx} className="bg-slate-800 p-5 rounded-2xl border border-slate-700">
                 <div className="font-medium text-lg mb-3" dir="auto"><span className="text-blue-500 ml-2">{q.id}.</span>{q.text}</div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                   {Object.entries(q.options).map(([key, val]) => (
                     <div key={key} className={`p-3 rounded-lg border flex items-center ${q.correctAnswer === key ? 'bg-emerald-900/30 border-emerald-700 text-emerald-200' : 'bg-slate-900 border-slate-700 text-slate-300'}`}>
                       <span className="font-bold ml-2">{key})</span> <span dir="auto">{val as string}</span>
                       {q.correctAnswer === key && <span className="mr-auto text-xs font-bold tracking-wider text-emerald-500">صحيح</span>}
                     </div>
                   ))}
                 </div>
               </div>
             ))}
           </div>

           <button onClick={handleSaveExam} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-4 rounded-xl transition-colors flex items-center justify-center space-x-2 space-x-reverse">
            <Check />
            <span>حفظ واعتماد الامتحان</span>
          </button>
        </div>
      )}
    </div>
  );
}
