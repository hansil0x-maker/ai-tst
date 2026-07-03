import { useState, useRef, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import {
  Plus,
  Trash2,
  FileText,
  Printer,
  Eye,
  Clock,
  CheckCircle,
  X,
} from "lucide-react";
import CreateExamFlow from "./CreateExamFlow";
import { syncManager } from "../sync";
import toast from "react-hot-toast";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import JsBarcode from "jsbarcode";

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

  const handlePrintExam = async (exam: any) => {
    if (!settings) return;
    const examClass = classes.find((c) => c.id === exam.classId);
    if (!examClass) {
      toast.error("لم يتم العثور على الصف");
      return;
    }
    const classStudents = await db.students
      .where("classId")
      .equals(exam.classId)
      .toArray();

    if (classStudents.length === 0) {
      toast.error(
        "الصف المحدد لا يحتوي على طلاب. أضف طلاب لطباعة أوراق الامتحان.",
      );
      return;
    }

    const t = toast.loading("جاري تجهيز صفحات الطباعة...", { duration: 0 });

    try {
      const MAX_Q = 20;
      const questionPagesCount = Math.ceil(exam.questions.length / MAX_Q) || 1;

      const printMode = exam.printMode || "economic";
      const printQuestionsPerStudent = exam.printQuestionsPerStudent ?? false;
      const duplexQuestionPages = exam.duplexQuestionPages || 1;

      // 1. Generate Answer Sheet HTML for a student
      const generateAnswerSheet = async (student: any) => {
        const MAX_ANSWERS_PER_PAGE = 60;
        const answerPagesCount =
          Math.ceil(exam.questions.length / MAX_ANSWERS_PER_PAGE) || 1;
        let htmlPages = [];

        for (let p = 0; p < answerPagesCount; p++) {
          const startIndex = p * MAX_ANSWERS_PER_PAGE;
          const pageQuestions = exam.questions.slice(
            startIndex,
            startIndex + MAX_ANSWERS_PER_PAGE,
          );

          // Barcode: ExamId(first 8 chars) - studentSerial - page - startIndex - pageQuestionsCount
          const shortExamId = exam.id.split("-")[0];
          const barcodeData = `${shortExamId}-${student.serialNumber}-${p}-${startIndex}-${pageQuestions.length}`;
          
          const canvas = document.createElement("canvas");
          JsBarcode(canvas, barcodeData, {
            format: "CODE128",
            displayValue: false,
            height: 35,
            width: 2,
            margin: 0,
          });
          const barcodeDataUrl = canvas.toDataURL("image/png");

          let cols = 4;
          let gap = "10px";
          let bubbleSize = "15px";
          let padding = "3px 0";

          htmlPages.push(`
            <div class="page" style="width: 210mm; min-height: 297mm; padding: 15mm; box-sizing: border-box; background: white; display: flex; flex-direction: column; position: relative; page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid;">
              <div style="text-align: center; padding-bottom: 5px; margin-bottom: 5px;">
                <div style="font-size: 20px; font-weight: bold;">${settings.schoolName || "اسم المدرسة"}</div>
                <div style="font-size: 14px; color: #555;">العام الدراسي: ${settings.academicYear || ""}</div>
                <div style="font-size: 18px; font-weight: bold; margin-top: 5px;">ورقة إجابة - ${exam.title} ${answerPagesCount > 1 ? `(صفحة ${p + 1})` : ""}</div>
              </div>
              
              <div style="text-align: center; margin-bottom: 15px;">
                 <img src="${barcodeDataUrl}" style="width: 100%; height: 35px; display: block;" alt="Barcode" />
              </div>

              <div style="display: flex; justify-content: space-between; margin-bottom: 15px; align-items: flex-start; gap: 10px;">
                <div style="flex: 1; font-size: 14px; line-height: 1.6; text-align: right;">
                  <div><strong>اسم الطالب:</strong> ${student.name}</div>
                  <div><strong>الصف:</strong> ${examClass.name}</div>
                  <div><strong>المادة:</strong> ${exam.subject}</div>
                  <div><strong>رقم الجلوس:</strong> ${student.serialNumber}</div>
                </div>
                <div style="flex: 1; background-color: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px; padding: 8px; font-size: 8pt; line-height: 1.4;">
                  <div style="font-weight: bold; margin-bottom: 4px;">📌 تعليمات:</div>
                  <ol style="margin: 0; padding-right: 20px;">
                    <li>استخدم قلمًا أسود/أزرق داكن لتظليل الدائرة بالكامل (●).</li>
                    <li>لا تستخدم علامة (✔) أو (✖) أو تظلل أكثر من دائرة.</li>
                    <li>يُمنع الكتابة فوق الرمز الشريطي أو مربعات الإجابة.</li>
                  </ol>
                </div>
              </div>
              
              <div style="flex-grow: 1; display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: ${gap}; align-content: start;">
                ${pageQuestions
                  .map(
                    (qInfo: any, index: number) => `
                  <div style="display: flex; align-items: center; justify-content: space-between; padding: ${padding}; border-bottom: 1px dashed #ccc;">
                    <div style="font-weight: bold; font-size: 14px; width: 30px;">${startIndex + index + 1}.</div>
                    <div style="display: flex; gap: 8px; direction: ltr;">
                      <div style="width: ${bubbleSize}; height: ${bubbleSize}; border: 2px solid #000; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold;">A</div>
                      <div style="width: ${bubbleSize}; height: ${bubbleSize}; border: 2px solid #000; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold;">B</div>
                      <div style="width: ${bubbleSize}; height: ${bubbleSize}; border: 2px solid #000; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold;">C</div>
                      <div style="width: ${bubbleSize}; height: ${bubbleSize}; border: 2px solid #000; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold;">D</div>
                    </div>
                  </div>
                `,
                  )
                  .join("")}
              </div>
              
              <div style="position: absolute; bottom: 8mm; width: calc(100% - 30mm); text-align: center; font-size: 10px; color: #666;">
                الرجاء تظليل الدائرة بالكامل باستخدام قلم حبر أو رصاص غامق.
              </div>
            </div>
          `);
        }
        return htmlPages.join("");
      };

      // 2. Generate Question Pages HTML
      const generateQuestionPages = (studentName?: string) => {
        let pagesHtml = "";
        pagesHtml += `
            <div class="page" style="width: 210mm; height: auto; min-height: 297mm; padding: 15mm; box-sizing: border-box; background: white; position: relative; page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid;">
              <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px;">
                <div style="font-size: 20px; font-weight: bold;">ورقة الأسئلة - ${exam.title}</div>
                ${studentName ? `<div style="font-size: 14px;">الطالب: ${studentName}</div>` : ""}
              </div>
              <div>
                ${exam.questions
                  .map(
                    (qInfo: any) => `
                  <div style="margin-bottom: 25px; page-break-inside: avoid; break-inside: avoid;">
                    <div style="font-weight: bold; margin-bottom: 10px; font-size: 16px;">${qInfo.id}. ${qInfo.text}</div>
                    <div style="font-size: 15px; line-height: 1.8; display: flex; gap: 20px; flex-wrap: wrap;">
                      <div style="flex: 1; min-width: 150px;">أ) ${qInfo.options.A || ""}</div>
                      <div style="flex: 1; min-width: 150px;">ب) ${qInfo.options.B || ""}</div>
                      <div style="flex: 1; min-width: 150px;">ج) ${qInfo.options.C || ""}</div>
                      <div style="flex: 1; min-width: 150px;">د) ${qInfo.options.D || ""}</div>
                    </div>
                  </div>
                `,
                  )
                  .join("")}
              </div>
            </div>
          `;
        return pagesHtml;
      };

      let finalHtml = "";

      if (printMode === "economic") {
        for (let i = 0; i < classStudents.length; i++) {
          finalHtml += await generateAnswerSheet(classStudents[i]);
        }
        if (printQuestionsPerStudent) {
          for (let i = 0; i < classStudents.length; i++) {
            finalHtml += generateQuestionPages();
          }
        } else {
          finalHtml += generateQuestionPages();
        }
      } else if (printMode === "duplex") {
        for (let i = 0; i < classStudents.length; i++) {
          // break-before: right forces the container to start on a new physical piece of paper
          // This avoids the need to manually inject blank pages and prevents truncation issues!
          finalHtml += `
            <div style="page-break-before: ${i === 0 ? 'auto' : 'right'}; break-before: ${i === 0 ? 'auto' : 'right'};">
              ${await generateAnswerSheet(classStudents[i])}
              ${generateQuestionPages(classStudents[i].name)}
            </div>
          `;
        }
      } else if (printMode === "booklet") {
        // Simple sequential for now, the printer driver usually handles actual imposition
        for (let i = 0; i < classStudents.length; i++) {
          finalHtml += await generateAnswerSheet(classStudents[i]);
          finalHtml += generateQuestionPages();
          // Pad to multiple of 4 pages for booklet
          const totalPages = 1 + questionPagesCount;
          const remainder = totalPages % 4;
          if (remainder !== 0) {
            const paddingPages = 4 - remainder;
            for (let p = 0; p < paddingPages; p++) {
              finalHtml += `<div class="page" style="width: 210mm; height: 296mm; page-break-after: always; break-after: page;"></div>`;
            }
          }
        }
      }

      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        toast.error("يرجى السماح بالنوافذ المنبثقة (Pop-ups) لطباعة الامتحان", {
          id: t,
        });
        return;
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
          <meta charset="utf-8">
          <title>${exam.subject} - ${examClass?.name || ""}</title>
          <style>
            @page { size: A4 portrait; margin: 0; }
            body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #eee; }
            * { box-sizing: border-box; }
            .page { background: white; margin: 0 auto; box-shadow: 0 0 5px rgba(0,0,0,0.1); width: 210mm; min-height: 297mm; position: relative; }
            @media print {
               body { background: white; }
              .page { margin: 0; box-shadow: none; width: 100%; min-height: 100%; page-break-after: always; break-after: page; }
            }
          </style>
        </head>
        <body>
          ${finalHtml}
        </body>
        </html>
      `);
      printWindow.document.close();

      setTimeout(() => {
        toast.dismiss(t);
        printWindow.focus();
        printWindow.print();
      }, 500);
    } catch (error) {
      console.error(error);
      toast.error("حدث خطأ أثناء تجهيز ملف الطباعة", { id: t });
    }
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
                onClick={() => handlePrintExam(exam)}
                className="flex-1 sm:flex-none justify-center flex items-center space-x-1 space-x-reverse bg-slate-900 border border-slate-600 hover:border-blue-500 text-slate-300 px-3 py-2 rounded-lg transition-colors"
              >
                <Printer size={18} />{" "}
                <span className="sm:hidden text-sm">طباعة</span>
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
                    {q.text}
                  </div>
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
