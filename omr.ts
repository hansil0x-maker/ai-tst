import cvInit from "@techstark/opencv-js";
import { Jimp } from "jimp";
import { MultiFormatReader, BarcodeFormat, DecodeHintType, RGBLuminanceSource, BinaryBitmap, HybridBinarizer } from '@zxing/library';

let cv = null;

async function initCV() {
  if (!cv) {
    cv = await cvInit;
  }
  return cv;
}

export async function gradeExamWithOMR(imageBase64, numQuestions) {
  const cv = await initCV();

  // 1. Decode base64 image
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");
  const image = await Jimp.read(buffer);

  // Create cv.Mat from Jimp image
  const src = cv.matFromImageData({
    width: image.bitmap.width,
    height: image.bitmap.height,
    data: image.bitmap.data,
  });

  // 2. Barcode Detection
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
  const parts = barcodeText.split('_');
  
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
  const qrSize = 50; // offset buffer

  // 4. Extract Answers using Adaptive Threshold
  const warpedGray = new cv.Mat();
  cv.cvtColor(warped, warpedGray, cv.COLOR_RGBA2GRAY);

  const warpedThresh = new cv.Mat();
  cv.adaptiveThreshold(
    warpedGray,
    warpedThresh,
    255,
    cv.ADAPTIVE_THRESH_GAUSSIAN_C,
    cv.THRESH_BINARY_INV,
    25,
    10,
  );

  // Group contours to find question circles dynamically
  const warpedEdges = new cv.Mat();
  cv.Canny(warpedGray, warpedEdges, 50, 150);
  const warpedContours = new cv.MatVector();
  const warpedHierarchy = new cv.Mat();
  cv.findContours(
    warpedEdges,
    warpedContours,
    warpedHierarchy,
    cv.RETR_EXTERNAL,
    cv.CHAIN_APPROX_SIMPLE,
  );

  const circles = [];
  for (let i = 0; i < warpedContours.size(); ++i) {
    const cnt = warpedContours.get(i);
    const rect = cv.boundingRect(cnt);
    // Dynamic circle size filtering based on QR size
    if (
      rect.width >= 15 &&
      rect.width <= 70 &&
      rect.height >= 15 &&
      rect.height <= 70
    ) {
      // Filter circles in the "Questions Area" (Below the QR code)
      if (rect.y > qrY + qrSize + 20) {
        circles.push(rect);
      }
    }
  }

  // 5. Group circles into Rows (Questions)
  circles.sort((a, b) => a.y - b.y);
  let rows = [];
  let currentRow = [];
  for (const c of circles) {
    if (currentRow.length === 0) {
      currentRow.push(c);
    } else {
      const avgY =
        currentRow.reduce((s, box) => s + box.y, 0) / currentRow.length;
      if (Math.abs(c.y - avgY) < 18) {
        currentRow.push(c);
      } else {
        rows.push(currentRow);
        currentRow = [c];
      }
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);

  const questions = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    let currentQ = [];
    for (let i = 0; i < row.length; i++) {
      currentQ.push(row[i]);
      if (i < row.length - 1 && row[i + 1].x - row[i].x > 70) {
        questions.push(currentQ);
        currentQ = [];
      }
    }
    if (currentQ.length > 0) questions.push(currentQ);
  }

  // 6. Sort into RTL Columns
  const cols = [];
  for (const q of questions) {
    let placed = false;
    for (const col of cols) {
      if (Math.abs(q[0].x - col[0][0].x) < 100) {
        // Using 100 to separate dense columns securely
        col.push(q);
        placed = true;
        break;
      }
    }
    if (!placed) cols.push([q]);
  }

  // Sort columns Right-to-Left
  cols.sort((a, b) => b[0][0].x - a[0][0].x);

  const orderedQuestions = [];
  for (const col of cols) {
    // Sort questions within column Top-to-Bottom
    col.sort((a, b) => a[0].y - b[0].y);
    for (const q of col) {
      orderedQuestions.push(q);
    }
  }

  const finalQuestions = orderedQuestions.slice(0, pageQuestionsCount);

  if (finalQuestions.length === 0) {
    warped.delete();
    warpedGray.delete();
    warpedThresh.delete();
    warpedEdges.delete();
    warpedContours.delete();
    warpedHierarchy.delete();
    src.delete();
    throw new Error(
      "لم يتم العثور على خيارات الإجابة (الدوائر). تأكد من إضاءة الغرفة ووضوح الدوائر.",
    );
  }

  const optionsLetters = ["A", "B", "C", "D"];
  let answers = {};

  for (let i = 0; i < pageQuestionsCount; i++) {
    const qCircles = finalQuestions[i];
    const questionKey = (startIndex + i + 1).toString();

    if (!qCircles || qCircles.length === 0) {
      answers[questionKey] = "EMPTY";
      continue;
    }

    qCircles.sort((a, b) => a.x - b.x);

    let bestOption = null;
    let maxDarkness = 0;
    let densities = [];

    for (let j = 0; j < Math.min(qCircles.length, 4); j++) {
      const rect = qCircles[j];
      const borderOffset = Math.round(rect.width * 0.15);
      const innerRect = new cv.Rect(
        rect.x + borderOffset,
        rect.y + borderOffset,
        rect.width - 2 * borderOffset,
        rect.height - 2 * borderOffset,
      );

      const roi = warpedThresh.roi(innerRect);
      const totalPixels = innerRect.width * innerRect.height;
      const whitePixels = cv.countNonZero(roi);
      const darkness = whitePixels / totalPixels;
      densities.push(darkness);
      roi.delete();

      if (darkness > maxDarkness) {
        maxDarkness = darkness;
        bestOption = optionsLetters[j];
      }
    }

    let sorted = [...densities].sort((a, b) => b - a);
    const secondMax = sorted.length > 1 ? sorted[1] : 0;

    if (maxDarkness < 0.25) {
      answers[questionKey] = "EMPTY";
    } else if (secondMax > maxDarkness * 0.7 && secondMax > 0.25) {
      answers[questionKey] = "INVALID";
    } else {
      answers[questionKey] = bestOption;
    }
  }

  src.delete();
  warped.delete();
  warpedGray.delete();
  warpedThresh.delete();
  warpedEdges.delete();
  warpedContours.delete();
  warpedHierarchy.delete();

  return {
    serialNumber,
    answers,
    page: qrData.page || 0,
    isPartial: pageQuestionsCount < numQuestions,
  };
}
