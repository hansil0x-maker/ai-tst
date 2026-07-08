const fs = require('fs');
let code = fs.readFileSync('src/components/LiveExamDashboard.tsx', 'utf8');

const oldSubmissions = `            {submissions.length > 0 && (
              <div className="pt-4 border-t border-slate-700">
                <h3 className="font-bold text-white flex items-center gap-2 mb-3">
                  <CheckCircle2 className="text-emerald-500" size={20} />
                  التسليمات ({submissions.length} / {students.length})
                </h3>
                <div className="space-y-2">
                  {submissions.map((sub, i) => (
                     <div key={i} className="flex justify-between p-3 bg-slate-900 rounded-lg border border-slate-700">
                       <span className="text-emerald-400">{sub.student.name}</span>
                       <span className="text-slate-500 text-sm">تم التسليم</span>
                     </div>
                  ))}
                </div>
              </div>
            )}`;

const newSubmissions = `
            {submissions.length > 0 && (
              <div className="pt-4 border-t border-slate-700">
                <h3 className="font-bold text-white flex items-center gap-2 mb-3">
                  <CheckCircle2 className="text-emerald-500" size={20} />
                  التسليمات ({submissions.length} / {students.length})
                </h3>
                <div className="space-y-2 mb-4">
                  {submissions.map((sub, i) => (
                     <div key={i} className="flex justify-between p-3 bg-slate-900 rounded-lg border border-slate-700">
                       <span className="text-emerald-400">{sub.student.name}</span>
                       <span className="text-slate-500 text-sm">تم التسليم</span>
                     </div>
                  ))}
                </div>
                
                <button
                  onClick={async () => {
                    const toastId = toast.loading('جاري التصحيح الذكي للإجابات...');
                    try {
                      const exam = exams?.find(e => e.id === selectedExamId);
                      const res = await fetch('/api/grade-digital-submissions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ exam, submissions })
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error);
                      
                      toast.success('تم التصحيح بنجاح!', { id: toastId });
                      
                      // Save to DB
                      for (const graded of data.gradedSubmissions) {
                         const matchSub = submissions.find(s => s.student.name === graded.studentName);
                         await db.results.add({
                            examId: selectedExamId,
                            studentId: null as any,
                            studentName: graded.studentName,
                            scannedAnswers: matchSub ? matchSub.answers : {},
                            score: graded.score,
                            percentage: graded.percentage,
                            category: graded.category,
                            isCheatSuspected: false
                         });
                      }
                      
                      toast.success('تم حفظ النتائج في قاعدة البيانات');
                    } catch (e: any) {
                      toast.error('فشل التصحيح: ' + e.message, { id: toastId });
                    }
                  }}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl transition-colors flex justify-center items-center gap-2"
                >
                  تصحيح الإجابات بالذكاء الاصطناعي ✨
                </button>
              </div>
            )}
`;

code = code.replace(oldSubmissions, newSubmissions);
fs.writeFileSync('src/components/LiveExamDashboard.tsx', code);
console.log("Patched LiveExamDashboard with AI grading");
