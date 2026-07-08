const fs = require('fs');
let code = fs.readFileSync('src/components/Exams.tsx', 'utf8');

code = code.replace("import {\n  Plus,\n  Trash2,\n  FileText,\n  Printer,\n  Eye,", "import {\n  Plus,\n  Trash2,\n  FileText,\n  Eye,");
code = code.replace("import jsPDF from \"jspdf\";\nimport html2canvas from \"html2canvas\";\nimport JsBarcode from \"jsbarcode\";", "");

const handlePrintStart = "const handlePrintExam = async (exam: any) => {";
const handlePrintEndStr = "toast.error(\"Error: \" + (error as Error).message, { id: t });\n    }\n  };";

const startIndex = code.indexOf(handlePrintStart);
if (startIndex !== -1) {
  const endIndex = code.indexOf(handlePrintEndStr, startIndex) + handlePrintEndStr.length;
  code = code.substring(0, startIndex) + code.substring(endIndex);
}

const printBtnRegex = /<button\s+onClick=\{\(\) => handlePrintExam\(exam\)\}[\s\S]*?<\/button>/;
code = code.replace(printBtnRegex, "");

fs.writeFileSync('src/components/Exams.tsx', code);
console.log("Patched Exams.tsx");
