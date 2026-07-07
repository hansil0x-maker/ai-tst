const fs = require('fs');
let code = fs.readFileSync('src/components/ScannerTab.tsx', 'utf8');

code = code.replace(
  "handleCapturePaper = async (e: React.ChangeEvent<HTMLInputElement>)",
  "handleCapturePaper = async (e: any)"
);

code = code.replace(
  "reader.readAsDataURL(file);",
  "reader.readAsDataURL(file as any);"
);

fs.writeFileSync('src/components/ScannerTab.tsx', code);
console.log("Patched ScannerTab.tsx");
