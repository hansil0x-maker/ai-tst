import React, { useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { ArrowLeft, Loader2, Sparkles, Check, CheckSquare, UploadCloud, X, ChevronRight, ChevronLeft, Star } from 'lucide-react';
import type { Question } from '../types';
import toast from 'react-hot-toast';

export default function CreateExamFlow({ onCancel, onComplete }: { onCancel: () => void, onComplete: () => void }) {
  const classes = useLiveQuery(() => db.classes.toArray()) || [];
  
  const pastExams = useLiveQuery(() => db.exams.toArray()) || [];
  const uniqueTitles = Array.from(new Set(pastExams.map(e => e.title))).filter(Boolean);
  const uniqueSubjects = Array.from(new Set(pastExams.map(e => e.subject))).filter(Boolean);
  
  const [step, setStep] = useState(1);
  
  const [title, setTitle] = useState('');
  const [classId, setClassId] = useState<number>(0);
  const [subject, setSubject] = useState('');
  const [examDate, setExamDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [contentBlock, setContentBlock] = useState('');
  const [totalQuestions, setTotalQuestions] = useState(10);
  const [autoDistribute, setAutoDistribute] = useState(true);
  const [qTypes, setQTypes] = useState({ mcq: 5, tf: 5, fill: 0, short: 0, match: 0, diagram: 0 });
  
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
      const referenceExams = pastExams.filter(e => e.rating === 5).slice(0, 3).map(e => ({
         title: e.title,
         subject: e.subject,
         questions: e.questions,
         ratingComment: e.ratingComment
      }));
      
      
      // Prepare previous questions for AI Batching Engine
      const startOfDay = new Date();
      startOfDay.setHours(0,0,0,0);
      const todaysExams = await db.exams.where('createdAt').aboveOrEqual(startOfDay.getTime()).toArray();
      const previousQuestions = todaysExams.flatMap(e => e.questions.map(q => q.text));
      
      const res = await fetch('/api/generate-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: notes, content: contentBlock, files, totalQuestions, autoDistribute, qTypes, previousQuestions })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل التوليد');
      
      if (data.questions && Array.isArray(data.questions)) {
        setGeneratedQuestions(data.questions);
        if (data.aiComment) {
          setAiComment(data.aiComment);
        }
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

  const [editPrompt, setEditPrompt] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [retryReason, setRetryReason] = useState('');
  const [showRetry, setShowRetry] = useState(false);
  const [aiComment, setAiComment] = useState('يبدو هذا الامتحان متوازناً وجاهزاً للاستخدام.');
  const [rating, setRating] = useState(0);
  const [ratingComment, setRatingComment] = useState('');

  const suggScrollRef = useRef<HTMLDivElement>(null);

  const handleEditGenerate = async () => {
    if (!editPrompt) return;
    const previousNotes = notes;
    setNotes(notes ? notes + " | تعديل: " + editPrompt : "تعديل: " + editPrompt);
    setShowEdit(false);
    setEditPrompt('');
    await handleGenerate();
  };

  const handleRetryGenerate = async () => {
    if (retryReason) {
      setNotes(notes ? notes + " | سبب الإعادة: " + retryReason : "سبب الإعادة: " + retryReason);
    }
    setShowRetry(false);
    setRetryReason('');
    await handleGenerate();
  };

  const handleProceedToRating = () => {
    if (!title || classId === 0 || !subject) {
      toast.error('يرجى العودة والرجاء ملء بيانات الامتحان الأساسية (العنوان، المادة، الصف) قبل الحفظ.');
      setStep(1);
      return;
    }
    setStep(3);
  };

  const handleFinalSave = async () => {
    const correctAnswers: Record<number, string> = {};
    generatedQuestions.forEach(q => {
      correctAnswers[q.id] = q.correctAnswer;
    });

    const currentSettings = await db.settings.get(1);
    await db.exams.add({
      title,
      classId,
      subject,
      date: examDate,
      totalMarks: generatedQuestions.length,
      passMark: Math.floor(generatedQuestions.length * 0.5),
      questions: generatedQuestions,
      correctAnswers,
      status: 'Pending',
      rating,
      ratingComment,
      academicYear: currentSettings?.academicYear || '2026-2027',
      printMode,
      printQuestionsPerStudent,
      duplexQuestionPages
    } as any);
    
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
              <input type="text" list="titles-list" value={title} onChange={e=>setTitle(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-blue-500 outline-none" placeholder="اختبار الفصل الأول..." />
              <datalist id="titles-list">
                {uniqueTitles.map((t, i) => <option key={i} value={t} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">المادة</label>
              <input type="text" list="subjects-list" value={subject} onChange={e=>setSubject(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-blue-500 outline-none" placeholder="الرياضيات..." />
              <datalist id="subjects-list">
                {uniqueSubjects.map((s, i) => <option key={i} value={s} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">تاريخ الامتحان</label>
              <input type="date" value={examDate} onChange={e=>setExamDate(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-blue-500 outline-none" />
            </div>
            <div>
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

          <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700">
            <h3 className="text-lg font-semibold mb-4 text-white">إعدادات أسئلة الامتحان</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">إجمالي عدد الأسئلة</label>
                <input type="number" min="1" value={totalQuestions} onChange={e=>setTotalQuestions(parseInt(e.target.value) || 1)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-blue-500 outline-none" />
              </div>
              <div className="flex items-center gap-2 p-3 bg-slate-900 rounded-xl border border-slate-700">
                  <input 
                    type="checkbox" 
                    id="autoDist" 
                    checked={autoDistribute} 
                    onChange={e => setAutoDistribute(e.target.checked)}
                    className="w-4 h-4 text-blue-600 bg-slate-800 border-slate-600 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="autoDist" className="text-sm text-slate-300">
                    توزيع الأنواع تلقائياً عبر الذكاء الاصطناعي
                  </label>
              </div>
              
              {!autoDistribute && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">اختيار من متعدد</label>
                    <input type="number" min="0" value={qTypes.mcq} onChange={e=>setQTypes({...qTypes, mcq: parseInt(e.target.value)||0})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">صح أو خطأ</label>
                    <input type="number" min="0" value={qTypes.tf} onChange={e=>setQTypes({...qTypes, tf: parseInt(e.target.value)||0})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">أكمل الفراغ</label>
                    <input type="number" min="0" value={qTypes.fill} onChange={e=>setQTypes({...qTypes, fill: parseInt(e.target.value)||0})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">أجب</label>
                    <input type="number" min="0" value={qTypes.short} onChange={e=>setQTypes({...qTypes, short: parseInt(e.target.value)||0})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">توصيل / جدول</label>
                    <input type="number" min="0" value={qTypes.match} onChange={e=>setQTypes({...qTypes, match: parseInt(e.target.value)||0})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">رسم / صورة</label>
                    <input type="number" min="0" value={qTypes.diagram} onChange={e=>setQTypes({...qTypes, diagram: parseInt(e.target.value)||0})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white outline-none" />
                  </div>
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">ملاحظات إضافية</label>
            <input type="text" value={notes} onChange={e=>setNotes(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-blue-500 outline-none mb-3" placeholder="مثال: قم بإنشاء 10 أسئلة صعبة جداً..." />
            
            <div className="relative group">
              <button 
                onClick={(e) => { e.preventDefault(); suggScrollRef.current?.scrollBy({ left: -150, behavior: 'smooth' }); }}
                className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 bg-slate-800 border border-slate-600 p-1 rounded-full z-10 hidden group-hover:block hover:bg-slate-700"
              ><ChevronRight size={16}/></button>
              <button 
                onClick={(e) => { e.preventDefault(); suggScrollRef.current?.scrollBy({ left: 150, behavior: 'smooth' }); }}
                className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 bg-slate-800 border border-slate-600 p-1 rounded-full z-10 hidden group-hover:block hover:bg-slate-700"
              ><ChevronLeft size={16}/></button>
              
              <div ref={suggScrollRef} className="flex overflow-x-auto gap-2 no-scrollbar scroll-smooth px-1">
                {[
                  "أنشئ 10 أسئلة اختيار من متعدد بمستوى متوسط",
                  "امتحان قصير من 5 أسئلة مع التركيز على التعاريف",
                  "اختبار شامل من 20 سؤال يغطي كل المواضيع",
                  "أسئلة تحليلية صعبة للطلاب المتفوقين",
                  "ركز على الفصول الثلاثة الأولى فقط",
                  "تجنب الأسئلة التي تعتمد على الحفظ المباشر"
                ].map((sug, i) => (
                  <button 
                    key={i} 
                    onClick={() => setNotes(sug)}
                    className="bg-slate-800 hover:bg-blue-900/40 text-blue-300 border border-slate-700 hover:border-blue-500/50 rounded-full px-4 py-1.5 text-xs transition-colors cursor-pointer whitespace-nowrap flex-shrink-0"
                  >
                    {sug}
                  </button>
                ))}
              </div>
            </div>
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

           <button onClick={handleProceedToRating} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-4 rounded-xl transition-colors flex items-center justify-center space-x-2 space-x-reverse mb-4">
            <Check />
            <span>حفظ واعتماد الامتحان</span>
          </button>

          {showEdit && (
            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 mb-4">
              <label className="block text-sm text-slate-400 mb-2">ما الذي تود تعديله في هذا الامتحان؟</label>
              <textarea 
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none mb-3 resize-none"
                rows={3}
                placeholder="مثال: اجعل الأسئلة أسهل، أو أضف سؤالين عن موضوع كذا..."
              ></textarea>
              <div className="flex gap-2">
                <button onClick={handleEditGenerate} disabled={isGenerating} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg transition-colors">
                  {isGenerating ? 'جاري التعديل...' : 'تطبيق التعديل'}
                </button>
                <button onClick={() => setShowEdit(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg transition-colors">إلغاء</button>
              </div>
            </div>
          )}

          {showRetry && (
            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 mb-4">
              <label className="block text-sm text-slate-400 mb-2">لماذا تود إعادة المحاولة؟ (اختياري)</label>
              <textarea 
                value={retryReason}
                onChange={(e) => setRetryReason(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none mb-3 resize-none"
                rows={2}
                placeholder="مثال: الأسئلة طويلة جداً، أو غير مرتبطة بشكل كافي بالموضوع..."
              ></textarea>
              <div className="flex gap-2">
                <button onClick={handleRetryGenerate} disabled={isGenerating} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg transition-colors">
                  {isGenerating ? 'جاري الإعادة...' : 'تأكيد وإعادة'}
                </button>
                <button onClick={() => setShowRetry(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg transition-colors">إلغاء</button>
              </div>
            </div>
          )}

          {!showEdit && !showRetry && (
            <div className="flex flex-wrap gap-3">
              <button onClick={() => setShowEdit(true)} className="flex-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 font-medium py-3 rounded-xl transition-colors">
                تعديل الامتحان
              </button>
              <button onClick={() => setShowRetry(true)} disabled={isGenerating} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-medium py-3 rounded-xl transition-colors">
                إعادة المحاولة
              </button>
              <button onClick={() => setStep(1)} className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 font-medium py-3 rounded-xl transition-colors">
                إلغاء
              </button>
            </div>
          )}

          <div className="bg-blue-900/10 border border-blue-800/30 rounded-xl p-4 mt-6 flex items-start space-x-3 space-x-reverse">
             <div className="p-2 bg-blue-900/30 rounded-full text-blue-400 mt-1"><Sparkles size={20} /></div>
             <div>
               <p className="text-blue-300/80 text-sm italic">{aiComment}</p>
             </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          <div className="bg-slate-800 border border-slate-700 p-6 rounded-2xl text-center space-y-4">
            <h3 className="text-xl font-semibold text-white">تقييم الامتحان (اختياري)</h3>
            <p className="text-slate-400 text-sm">كيف تقيم جودة الامتحان الذي تم توليده؟ إذا أعطيته 5 نجوم، سيتم استخدامه كنموذج تدريبي مستقبلاً لتحسين الامتحانات في هذه المادة.</p>
            
            <div className="flex justify-center space-x-2 space-x-reverse py-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <button 
                  key={star} 
                  onClick={() => setRating(star)}
                  className={`p-2 transition-all transform hover:scale-110 ${rating >= star ? 'text-yellow-400' : 'text-slate-600'}`}
                >
                  <Star size={36} fill={rating >= star ? 'currentColor' : 'none'} />
                </button>
              ))}
            </div>

            {rating === 5 && (
              <div className="text-right">
                <label className="block text-sm text-slate-400 mb-2">تعليقك (اختياري)</label>
                <textarea 
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none resize-none"
                  rows={2}
                  placeholder="ما الذي أعجبك في هذا الامتحان؟"
                ></textarea>
              </div>
            )}
            
            <button onClick={handleFinalSave} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-4 rounded-xl transition-colors mt-4">
              حفظ واعتماد نهائي
            </button>
            <button onClick={() => setStep(2)} className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 rounded-xl transition-colors mt-2">
              رجوع
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
