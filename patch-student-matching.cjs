const fs = require('fs');
let code = fs.readFileSync('src/components/StudentRoom.tsx', 'utf8');

const matchingBlock = `{currentQ.type === 'matching' && currentQ.matchingPairs && (
              <div className="space-y-4">
                <p className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-4">اختر الكلمة المناسبة لكل عنصر:</p>
                <div className="space-y-3">
                  {currentQ.matchingPairs.map((pair: any, idx: number) => {
                     const allRights = [...currentQ.matchingPairs].map(p => p.right).sort();
                     const currentAnswers = answers[currentQ.id] || {};
                     return (
                        <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                           <div className="flex-1 font-semibold text-slate-700 dark:text-slate-200">{pair.left}</div>
                           <select
                              value={currentAnswers[pair.left] || ''}
                              onChange={(e) => setAnswers(prev => ({...prev, [currentQ.id]: {...(prev[currentQ.id] || {}), [pair.left]: e.target.value}}))}
                              className="flex-1 p-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:border-blue-500"
                           >
                              <option value="" disabled>اختر...</option>
                              {allRights.map((r: string, i: number) => <option key={i} value={r}>{r}</option>)}
                           </select>
                        </div>
                     )
                  })}
                </div>
              </div>
            )}`;

code = code.replace(
  "{currentQ.type === 'image_labeling' && (",
  matchingBlock + "\n            {currentQ.type === 'image_labeling' && ("
);

fs.writeFileSync('src/components/StudentRoom.tsx', code);
console.log("Patched StudentRoom matching");
