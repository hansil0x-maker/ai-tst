const fs = require('fs');
let code = fs.readFileSync('omr.ts', 'utf8');

code = code.replace(
  "import { MultiFormatReader, BarcodeFormat, DecodeHintType, RGBLuminanceSource, BinaryBitmap, HybridBinarizer, GlobalHistogramBinarizer } from '@zxing/library';",
  "import ZXing from '@zxing/library';\nconst { MultiFormatReader, BarcodeFormat, DecodeHintType, RGBLuminanceSource, BinaryBitmap, HybridBinarizer, GlobalHistogramBinarizer } = ZXing;"
);

fs.writeFileSync('omr.ts', code);
console.log("Patched omr.ts ZXing import");
