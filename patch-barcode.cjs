const fs = require('fs');
let code = fs.readFileSync('omr.ts', 'utf8');

// replace imports
code = code.replace(
  "import { MultiFormatReader, BarcodeFormat, DecodeHintType, RGBLuminanceSource, BinaryBitmap, HybridBinarizer } from '@zxing/library';",
  "import { MultiFormatReader, BarcodeFormat, DecodeHintType, RGBLuminanceSource, BinaryBitmap, HybridBinarizer, GlobalHistogramBinarizer } from '@zxing/library';"
);

const startIdx = code.indexOf('  // 2. Barcode Detection');
const endIdx = code.indexOf('  const barcodeText = result.getText();');

const replaceBlock = `  // 2. Barcode Detection
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  const reader = new MultiFormatReader();
  reader.setHints(hints);
  
  const imgDataOriginal = new Uint8ClampedArray(image.bitmap.data);
  const source = new RGBLuminanceSource(imgDataOriginal, image.bitmap.width, image.bitmap.height);
  const bitmap = new BinaryBitmap(new HybridBinarizer(source));
  
  let result;
  try {
    result = reader.decode(bitmap);
  } catch(e) {
    try {
      result = reader.decode(new BinaryBitmap(new GlobalHistogramBinarizer(source)));
    } catch(e2) {
      try {
        // Fallback: OpenCV pre-processing to fix shadows
        const gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        const thresh = new cv.Mat();
        cv.adaptiveThreshold(gray, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 51, 15);
        
        const enhancedData = new Uint8ClampedArray(image.bitmap.width * image.bitmap.height * 4);
        for(let i=0; i<thresh.rows; i++) {
           for(let j=0; j<thresh.cols; j++) {
              const val = thresh.ucharPtr(i, j)[0];
              const idx = (i * thresh.cols + j) * 4;
              enhancedData[idx] = val;
              enhancedData[idx+1] = val;
              enhancedData[idx+2] = val;
              enhancedData[idx+3] = 255;
           }
        }
        gray.delete();
        thresh.delete();
        
        const enhancedSource = new RGBLuminanceSource(enhancedData, image.bitmap.width, image.bitmap.height);
        const enhancedBitmap = new BinaryBitmap(new HybridBinarizer(enhancedSource));
        result = reader.decode(enhancedBitmap);
      } catch(e3) {
        src.delete();
        throw new Error("لم يتم العثور على الرمز الشريطي (الباركود). حاول تحسين الإضاءة وتجنب وجود ظلال قوية على الورقة.");
      }
    }
  }
`;

code = code.substring(0, startIdx) + replaceBlock + code.substring(endIdx);
fs.writeFileSync('omr.ts', code);
