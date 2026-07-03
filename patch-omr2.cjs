const fs = require('fs');
let code = fs.readFileSync('omr.ts', 'utf8');

// replace the import
code = code.replace(/import jsQR from "jsqr";/g, "import { MultiFormatReader, BarcodeFormat, DecodeHintType, RGBLuminanceSource, BinaryBitmap, HybridBinarizer } from '@zxing/library';");

// find the start of // 2. QR Code Detection
const startIdx = code.indexOf('  // 2. QR Code Detection');
// find the end of M.delete();
const endIdx = code.indexOf('  M.delete();', startIdx) + 13;

const replaceBlock = `  // 2. Barcode Detection
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]);
  const reader = new MultiFormatReader();
  reader.setHints(hints);
  
  const imgDataOriginal = new Uint8ClampedArray(image.bitmap.data);
  const source = new RGBLuminanceSource(imgDataOriginal, image.bitmap.width, image.bitmap.height);
  const bitmap = new BinaryBitmap(new HybridBinarizer(source));
  
  let result;
  try {
    result = reader.decode(bitmap);
  } catch(e) {
    src.delete();
    throw new Error("لم يتم العثور على الرمز الشريطي (الباركود) في الصورة. يرجى التأكد من وضوح الصورة وأن الرمز ظاهر بالكامل.");
  }

  const barcodeText = result.getText();
  const parts = barcodeText.split('-');
  
  // Format: shortExamId - serialNumber - page - startIndex - pageQuestionsCount
  const serialNumber = parts[1] || "UNKNOWN";
  const startIndex = parseInt(parts[3]) || 0;
  const pageQuestionsCount = parseInt(parts[4]) || numQuestions;

  // 3. Rotation using Barcode angle
  const points = result.getResultPoints();
  const p1 = points[0];
  const p2 = points[points.length - 1]; // In case there are more
  
  // Calculate angle to make the barcode perfectly horizontal
  let angle = Math.atan2(p2.getY() - p1.getY(), p2.getX() - p1.getX()) * (180 / Math.PI);
  
  const center = new cv.Point(image.bitmap.width / 2, image.bitmap.height / 2);
  const M = cv.getRotationMatrix2D(center, angle, 1.0);
  
  const warped = new cv.Mat();
  cv.warpAffine(src, warped, M, new cv.Size(image.bitmap.width, image.bitmap.height), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));
  M.delete();
  
  // Find where the barcode went after rotation
  const barcodeCenterY = (p1.getY() + p2.getY()) / 2;
  const barcodeCenterX = (p1.getX() + p2.getX()) / 2;
  const dx = barcodeCenterX - center.x;
  const dy = barcodeCenterY - center.y;
  const rad = -angle * Math.PI / 180;
  const rotatedY = center.y + dx * Math.sin(rad) + dy * Math.cos(rad);
  const qrY = rotatedY;
  const qrSize = 50; // offset buffer`;

code = code.substring(0, startIdx) + replaceBlock + code.substring(endIdx);

fs.writeFileSync('omr.ts', code);
