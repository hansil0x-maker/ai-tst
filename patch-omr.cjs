const fs = require('fs');
let code = fs.readFileSync('omr.ts', 'utf8');

// Replace jsQR import
code = code.replace('import jsQR from "jsqr";', `import { MultiFormatReader, BarcodeFormat, DecodeHintType, RGBLuminanceSource, BinaryBitmap, HybridBinarizer } from '@zxing/library';`);

// Replace jsQR detection
const searchBlock = `  // 2. QR Code Detection
  const imgDataOriginal = new Uint8ClampedArray(image.bitmap.data);
  const codeOriginal = jsQR(
    imgDataOriginal,
    image.bitmap.width,
    image.bitmap.height,
  );

  if (!codeOriginal) {
    src.delete();
    throw new Error(
      "لم يتم العثور على رمز QR في الصورة. يرجى التأكد من وضوح الصورة وأن الرمز ظاهر بالكامل.",
    );
  }

  // Parse QR Data
  let qrData;
  try {
    qrData = JSON.parse(codeOriginal.data);
  } catch (e) {
    qrData = { serial: codeOriginal.data };
  }

  const serialNumber = qrData.serial || "UNKNOWN";
  const startIndex = qrData.startIndex || 0;
  const pageQuestionsCount = qrData.pageQuestions || numQuestions;

  // 3. Single Anchor Perspective Transform using QR Code corners
  const loc = codeOriginal.location;
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    loc.topLeftCorner.x,
    loc.topLeftCorner.y,
    loc.topRightCorner.x,
    loc.topRightCorner.y,
    loc.bottomLeftCorner.x,
    loc.bottomLeftCorner.y,
    loc.bottomRightCorner.x,
    loc.bottomRightCorner.y,
  ]);

  const warpedWidth = 1240;
  const warpedHeight = 1754;

  const qrX = 100;
  const qrY = 150;
  const qrSize = 250;

  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    qrX,
    qrY,
    qrX + qrSize,
    qrY,
    qrX,
    qrY + qrSize,
    qrX + qrSize,
    qrY + qrSize,
  ]);

  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  const warped = new cv.Mat();
  cv.warpPerspective(src, warped, M, new cv.Size(warpedWidth, warpedHeight));

  srcTri.delete();
  dstTri.delete();
  M.delete();`;

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
  // We use warpAffine instead of warpPerspective
  cv.warpAffine(src, warped, M, new cv.Size(image.bitmap.width, image.bitmap.height), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));
  M.delete();
  
  // Store barcode Y coordinate after rotation to filter circles below it
  // Since we rotated around center, we need to find where the barcode center went
  const barcodeCenterY = (p1.getY() + p2.getY()) / 2;
  const barcodeCenterX = (p1.getX() + p2.getX()) / 2;
  const dx = barcodeCenterX - center.x;
  const dy = barcodeCenterY - center.y;
  const rad = -angle * Math.PI / 180;
  const rotatedY = center.y + dx * Math.sin(rad) + dy * Math.cos(rad);
  const qrY = rotatedY;
  const qrSize = 50; // Just an offset buffer
`;

code = code.replace(searchBlock, replaceBlock);
fs.writeFileSync('omr.ts', code);
