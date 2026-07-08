const fs = require('fs');

function patchFile(filepath) {
  let code = fs.readFileSync(filepath, 'utf8');

  // We want to replace the whole Object.entries(q.options) with a conditional block
  const targetRegex = /<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">\s*\{Object.entries\(q.options\)\.map\(\(\[key, val\]\) => \([\s\S]*?\}\)\}\s*<\/div>/g;

  const newBlock = `{q.type === 'mcq' && q.options && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                   {Object.entries(q.options).map(([key, val]) => (
                     <div key={key} className={\`p-3 rounded-lg border flex items-center \${q.correctAnswer === key ? 'bg-emerald-900/30 border-emerald-700 text-emerald-200' : 'bg-slate-900 border-slate-700 text-slate-300'}\`}>
                       <span className="font-bold ml-2">{key})</span> <span dir="auto">{val}</span>
                       {q.correctAnswer === key && <span className="mr-auto text-xs font-bold tracking-wider text-emerald-500">صحيح</span>}
                     </div>
                   ))}
                  </div>
                 )}
                 {q.type === 'true_false' && (
                  <div className="text-sm text-slate-300">الجواب الصحيح: <span className="text-emerald-400 font-bold">{q.correctAnswer === 'true' ? 'صح' : 'خطأ'}</span></div>
                 )}
                 {(q.type === 'short_answer' || q.type === 'fill_blanks') && (
                  <div className="text-sm text-slate-300">الجواب الصحيح: <span className="text-emerald-400 font-bold">{q.correctAnswer}</span></div>
                 )}
                 {q.type === 'matching' && q.matchingPairs && (
                  <div className="space-y-2 mt-2">
                    {q.matchingPairs.map((pair: any, i: number) => (
                      <div key={i} className="flex gap-4 p-2 bg-slate-900 border border-slate-700 rounded-lg">
                        <div className="flex-1 text-slate-300">{pair.left}</div>
                        <div className="text-blue-500">←→</div>
                        <div className="flex-1 text-emerald-400 font-bold">{pair.right}</div>
                      </div>
                    ))}
                  </div>
                 )}
                 {q.type === 'image_labeling' && (
                  <div className="text-sm text-slate-300">
                    <div>صورة: {q.imageDescription || 'بدون وصف'}</div>
                    <div className="mt-1">الجواب الصحيح: <span className="text-emerald-400 font-bold">{q.correctAnswer}</span></div>
                  </div>
                 )}`;

  code = code.replace(targetRegex, newBlock);
  fs.writeFileSync(filepath, code);
  console.log("Patched " + filepath);
}

patchFile('src/components/CreateExamFlow.tsx');
patchFile('src/components/Exams.tsx');
