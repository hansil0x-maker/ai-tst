const fs = require('fs');
let code = fs.readFileSync('src/components/StudentRoom.tsx', 'utf-8');
code = code.replace(
  'يرجى التزام الهدوء والانتظار في مكانك حتى ينشر المعلم النتيجة أو يغلق الجلسة.',
  'يرجى التزام الهدوء والانتظار في مكانك حتى ينشر المعلم النتيجة أو يغلق الجلسة.\n                   </p>\n                   {accessCode && (\n                     <div className="mt-4 p-4 bg-slate-900 rounded-lg border border-emerald-900/50">\n                        <p className="text-sm text-slate-400 mb-1">رمز وصولك للنتيجة لاحقاً:</p>\n                        <p className="text-2xl font-mono font-bold text-emerald-400 tracking-widest">{accessCode}</p>\n                     </div>\n                   )}'
);
fs.writeFileSync('src/components/StudentRoom.tsx', code);
