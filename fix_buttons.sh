#!/bin/bash
awk '
/تحليل النتائج الذكي/ {
    print
    getline
    print
    getline
    print
    print "                    <button onClick={handleNextBatch} className=\"w-full bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold py-3 rounded-xl transition-colors mt-2 border border-slate-600\">بدء الجلسة التالية وإخفاء النتائج (الخيار ب)</button>"
    print "                    </div>"
    next
}
{print}
' src/components/LiveExamDashboard.tsx > src/components/LiveExamDashboard.tmp
mv src/components/LiveExamDashboard.tmp src/components/LiveExamDashboard.tsx
