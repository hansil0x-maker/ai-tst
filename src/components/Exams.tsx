import { useState, useRef, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import {
  Plus,
  Trash2,
  FileText,
  Eye,
  Clock,
  CheckCircle,
  X,
} from "lucide-react";
import CreateExamFlow from "./CreateExamFlow";
import { syncManager } from "../sync";
import toast from "react-hot-toast";


export default function Exams() {
  const [isCreating, setIsCreating] = useState(false);
  const [viewExam, setViewExam] = useState<any>(null);
  const [visibleCount, setVisibleCount] = useState(5);
  const [filterClass, setFilterClass] = useState<number>(0);
  const [filterDay, setFilterDay] = useState<string>("All");

  const exams = useLiveQuery(() => db.exams.toArray()) || [];
  const classes = useLiveQuery(() => db.classes.toArray()) || [];
  const students = useLiveQuery(() => db.students.toArray()) || [];
  const settings = useLiveQuery(() => db.settings.get(1));
  const results = useLiveQuery(() => db.results.toArray()) || [];

  const uniqueDays = Array.from(
    new Set(exams.map((e) => new Date(e.date).toLocaleDateString("ar-EG"))),
  );

  const filteredExams = exams.filter((e) => {
    if (filterClass !== 0 && e.classId !== filterClass) return false;
    if (
      filterDay !== "All" &&
      new Date(e.date).toLocaleDateString("ar-EG") !== filterDay
    )
      return false;
    return true;
  });

  useEffect(() => {
    if (exams.length === 0) return;
    const hasShown = sessionStorage.getItem("reminders_shown");
    if (!hasShown) {
      let showedReminder = false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      exams.forEach((exam) => {
        const examDate = new Date(exam.date);
        examDate.setHours(0, 0, 0, 0);
        const diffTime = examDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
          toast(`تذكير: امتحان ${exam.title} اليوم!`, {
            icon: "📅",
            duration: 5000,
          });
          showedReminder = true;
        } else if (diffDays === 1) {
          toast(`تذكير: امتحان ${exam.title} غداً!`, {
            icon: "⏰",
            duration: 5000,
          });
          showedReminder = true;
        }
      });
      if (showedReminder) {
        sessionStorage.setItem("reminders_shown", "true");
      }
    }
  }, [exams]);

  const getStatusDisplay = (exam: any) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const examDate = new Date(exam.date);
    examDate.setHours(0, 0, 0, 0);
    const diffTime = examDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      const examResults = results.filter((r) => r.examId === exam.id);
      const classStudents = students.filter(
        (s) =>
          s.classId === exam.classId && !exam.excludedStudents?.includes(s.id),
      );

      if (
        examResults.length >= classStudents.length &&
        classStudents.length > 0
      ) {
        return (
          <span className="flex items-center text-emerald-400 text-xs">
            <CheckCircle size={14} className="ml-1" /> بعد الامتحان (تم التصحيح)
          </span>
        );
      } else if (examResults.length > 0) {
        const remaining = classStudents.length - examResults.length;
        return (
          <span
            className="flex items-center text-blue-400 text-xs cursor-pointer hover:underline"
            onClick={() => promptExclude(exam)}
            title="انقر لاستثناء الطلاب المتبقين"
          >
            <Clock size={14} className="ml-1" /> جاري التصحيح (متبقي $
            {remaining})
          </span>
        );
      } else {
        return (
          <span className="flex items-center text-amber-400 text-xs">
            <Clock size={14} className="ml-1" /> بعد الامتحان (غير مصحح)
          </span>
        );
      }
    }

    if (diffDays === 0) {
      return (
        <span className="flex items-center text-blue-400 text-xs">
          <Clock size={14} className="ml-1" /> يوم الامتحان
        </span>
      );
    } else {
      return (
        <span className="flex items-center text-slate-400 text-xs">
          <Clock size={14} className="ml-1" /> قبل الامتحان ({diffDays} أيام)
        </span>
      );
    }
  };

  const promptExclude = async (exam: any) => {
    const classStudents = students.filter(
      (s) =>
        s.classId === exam.classId && !exam.excludedStudents?.includes(s.id),
    );
    const examResults = results.filter((r) => r.examId === exam.id);
    const unsubmitted = classStudents.filter(
      (s) => !examResults.some((r) => r.studentId === s.id),
    );

    if (unsubmitted.length > 0) {
      if (
        confirm(
          `هناك ${unsubmitted.length} طلاب لم يتم تصحيح أوراقهم. هل تريد استثنائهم واعتبار الامتحان منتهياً؟`,
        )
      ) {
        const newExcluded = [
          ...(exam.excludedStudents || []),
          ...unsubmitted.map((s) => s.id),
        ];
        await db.exams.update(exam.id, { excludedStudents: newExcluded });
        toast.success("تم استثناء الطلاب واعتبار التصحيح مكتملاً.");
      }
    }
  };

  const deleteExam = async (id: number) => {
    // Custom delete without window.confirm due to iframe limitations
    await db.exams.delete(id);
    const relatedResults = await db.results
      .where("examId")
      .equals(id)
      .toArray();
    for (const r of relatedResults) {
      if (r.id) await db.results.delete(r.id);
    }
    toast.success("تم حذف الامتحان بنجاح");
  };

  

  if (isCreating)
    return (
      <CreateExamFlow
        onCancel={() => setIsCreating(false)}
        onComplete={() => setIsCreating(false)}
      />
    );

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-700 pb-4 gap-4">
        <h2 className="text-2xl font-semibold">إدارة الامتحانات</h2>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <select
            value={filterClass}
            onChange={(e) => setFilterClass(Number(e.target.value))}
            className="bg-slate-900 border border-slate-600 rounded-lg p-2 text-white outline-none text-sm"
          >
            <option value="0">كل الفصول</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.subject})
              </option>
            ))}
          </select>
          <select
            value={filterDay}
            onChange={(e) => setFilterDay(e.target.value)}
            className="bg-slate-900 border border-slate-600 rounded-lg p-2 text-white outline-none text-sm"
          >
            <option value="All">كل الأيام</option>
            {uniqueDays.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <button
            onClick={() => setIsCreating(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center justify-center space-x-2 space-x-reverse transition-colors"
          >
            <Plus size={20} /> <span>امتحان جديد</span>
          </button>
        </div>
      </div>
      <div className="space-y-4">
        {filteredExams.slice(0, visibleCount).map((exam) => (
          <div
            key={exam.id}
            className="bg-slate-800 p-5 rounded-2xl border border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
          >
            <div>
              <h3 className="text-xl font-bold text-white mb-1" dir="auto">
                {exam.title}
              </h3>
              <div className="text-slate-400 text-sm flex flex-wrap items-center gap-2 mb-2">
                <span className="bg-slate-900 px-2 py-1 rounded text-slate-300 pointer-events-none">
                  {exam.subject}
                </span>
                <span dir="ltr">
                  {new Date(exam.date).toLocaleDateString("ar-EG")}
                </span>
                <span>الأسئلة: {exam.questions?.length || 0}</span>
              </div>
              <div className="inline-block px-3 py-1 bg-slate-900/50 rounded-full border border-slate-700">
                {getStatusDisplay(exam)}
              </div>
            </div>
            <div className="flex space-x-2 space-x-reverse w-full sm:w-auto">
              <button
                onClick={() => setViewExam(exam)}
                className="flex-1 sm:flex-none justify-center flex items-center space-x-1 space-x-reverse bg-emerald-900 border border-emerald-600 hover:border-emerald-500 text-emerald-300 px-3 py-2 rounded-lg transition-colors"
              >
                <Eye size={18} /> <span className="sm:hidden text-sm">عرض</span>
              </button>
              
              <button
                onClick={() => exam.id && deleteExam(exam.id)}
                className="flex-1 sm:flex-none justify-center flex items-center space-x-1 space-x-reverse bg-slate-900 border border-slate-600 hover:border-red-500 text-red-500 px-3 py-2 rounded-lg transition-colors"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
        {filteredExams.length > visibleCount && (
          <div className="text-center pt-4">
            <button
              onClick={() => setVisibleCount((v) => v + 5)}
              className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-full transition-colors border border-slate-700"
            >
              عرض المزيد
            </button>
          </div>
        )}
        {filteredExams.length === 0 && (
          <div className="text-center py-12 bg-slate-800/50 rounded-2xl border border-slate-700 border-dashed">
            <FileText size={48} className="mx-auto text-slate-500 mb-4" />
            <p className="text-slate-400 text-lg">
              لم يتم العثور على امتحانات.
            </p>
          </div>
        )}
      </div>

      {viewExam && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl p-6 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setViewExam(null)}
              className="absolute top-4 left-4 p-2 bg-slate-800 hover:bg-slate-700 rounded-full transition-colors text-white"
            >
              <X size={20} />
            </button>
            <h3 className="text-2xl font-bold text-white mb-2 ml-10" dir="auto">
              {viewExam.title}
            </h3>
            <p className="text-slate-400 mb-6 flex flex-wrap gap-3">
              <span className="bg-slate-800 px-3 py-1 rounded-full text-sm">
                {viewExam.subject}
              </span>
              <span className="bg-slate-800 px-3 py-1 rounded-full text-sm">
                تاريخ: {new Date(viewExam.date).toLocaleDateString("ar-EG")}
              </span>
              {viewExam.rating && (
                <span className="bg-yellow-900/30 text-yellow-400 border border-yellow-700 px-3 py-1 rounded-full text-sm">
                  تقييم: {viewExam.rating} نجوم
                </span>
              )}
            </p>

            <div className="space-y-4">
              {viewExam.questions?.map((q: any, idx: number) => (
                <div
                  key={idx}
                  className="bg-slate-800 p-4 rounded-xl border border-slate-700"
                >
                  <div className="font-medium text-lg mb-3" dir="auto">
                    <span className="text-blue-500 ml-2">{q.id}.</span>
                    <span className="text-xs text-slate-400 bg-slate-900 px-2 py-1 rounded-md ml-2">{q.type}</span>
                    {q.text}
                  </div>
                  {q.options && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {Object.entries(q.options).map(([key, val]) => (
                        <div
                          key={key}
                          className={`p-3 rounded-lg border flex items-center ${q.correctAnswer === key ? "bg-emerald-900/30 border-emerald-700 text-emerald-200" : "bg-slate-900 border-slate-700 text-slate-300"}`}
                        >
                          <span className="font-bold ml-2">{key})</span>{" "}
                          <span dir="auto">{val as string}</span>
                          {q.correctAnswer === key && (
                            <span className="mr-auto text-xs font-bold tracking-wider text-emerald-500">
                              صحيح
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {q.type !== 'mcq' && (
                    <div className="mt-3 p-3 bg-slate-900 rounded-lg border border-slate-700">
                      <span className="text-slate-400 text-sm ml-2">الإجابة الصحيحة:</span>
                      <span className="font-bold text-emerald-400">{q.correctAnswer || JSON.stringify(q.matchingPairs)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setViewExam(null)}
                className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
