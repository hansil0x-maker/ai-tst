const fs = require('fs');
let code = fs.readFileSync('src/components/CreateExamFlow.tsx', 'utf8');

// Replace state
code = code.replace(
  "const [printMode, setPrintMode] = useState<'economic'|'duplex'|'booklet'>('economic');\n  const [printQuestionsPerStudent, setPrintQuestionsPerStudent] = useState(false);\n  const [duplexQuestionPages, setDuplexQuestionPages] = useState(2);",
  "const [totalQuestions, setTotalQuestions] = useState(10);\n  const [autoDistribute, setAutoDistribute] = useState(true);\n  const [qTypes, setQTypes] = useState({ mcq: 5, tf: 5, fill: 0, short: 0, match: 0, diagram: 0 });"
);

// Replace the UI block for print formatting and the limit note
const oldUIBlockStart = `<div className="bg-slate-800 p-5 rounded-2xl border border-slate-700">`;
const limitNote = `<div className="p-4 bg-yellow-900/20 border border-yellow-800/50 text-yellow-200/80 rounded-xl text-sm mb-4">
            💡 ملاحظة: الحد الأقصى لعدد الأسئلة في كل ورقة إجابة (وجه واحد) هو 60 سؤالاً. سيتم توزيع الأسئلة الإضافية على صفحات إجابة جديدة تلقائياً.
          </div>`;

const uiReplacement = `<div className="bg-slate-800 p-5 rounded-2xl border border-slate-700">
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
          </div>`;

// This regex replaces from the start of the print settings div to the end of that div.
const printSettingsRegex = /<div className="bg-slate-800 p-5 rounded-2xl border border-slate-700">\s*<h3 className="text-lg font-semibold mb-4 text-white">تنسيق طباعة الامتحان<\/h3>[\s\S]*?(?=<div>\s*<label className="block text-sm text-slate-400 mb-1">ملاحظات إضافية<\/label>)/;

code = code.replace(printSettingsRegex, uiReplacement + '\n          ');

code = code.replace(limitNote, "");

// Modify the API call payload
const oldApiCall = `body: JSON.stringify({ prompt: notes, content: contentBlock, files, totalPages: printMode === 'booklet' ? 4 : undefined, previousQuestions })`;
const newApiCall = `body: JSON.stringify({ prompt: notes, content: contentBlock, files, totalQuestions, autoDistribute, qTypes, previousQuestions })`;
code = code.replace(oldApiCall, newApiCall);

// Modify the DB save object
const oldSaveObj = `printMode,\n        printQuestionsPerStudent,\n        duplexQuestionPages,`;
code = code.replace(oldSaveObj, "");

fs.writeFileSync('src/components/CreateExamFlow.tsx', code);
console.log("Patched CreateExamFlow.tsx");
