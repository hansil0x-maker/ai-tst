import cvInit from '@techstark/opencv-js';
import { Jimp } from 'jimp';
import jsQR from 'jsqr';

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
  const buffer = Buffer.from(base64Data, 'base64');
  const image = await Jimp.read(buffer);
  
  // Create cv.Mat from Jimp image
  const src = cv.matFromImageData({
    width: image.bitmap.width,
    height: image.bitmap.height,
    data: image.bitmap.data
  });

  // 2. QR Code Detection
  const imgDataOriginal = new Uint8ClampedArray(image.bitmap.data);
  const codeOriginal = jsQR(imgDataOriginal, image.bitmap.width, image.bitmap.height);
  
  if (!codeOriginal) {
    src.delete();
    throw new Error("لم يتم العثور على رمز QR في الصورة. يرجى التأكد من وضوح الصورة وأن الرمز ظاهر بالكامل.");
  }

  // Parse QR Data
  let qrData;
  try {
    qrData = JSON.parse(codeOriginal.data);
  } catch (e) {
    qrData = { serial: codeOriginal.data };
  }
  
  const serialNumber = qrData.serial || "UNKNOWN";

  // 3. Single Anchor Perspective Transform using QR Code corners
  const loc = codeOriginal.location;
  
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    loc.topLeftCorner.x, loc.topLeftCorner.y,
    loc.topRightCorner.x, loc.topRightCorner.y,
    loc.bottomLeftCorner.x, loc.bottomLeftCorner.y,
    loc.bottomRightCorner.x, loc.bottomRightCorner.y
  ]);

  const warpedWidth = 1240;
  const warpedHeight = 1754;
  const qrX = 100;
  const qrY = 150;
  const qrSize = 250; 
  
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    qrX, qrY,
    qrX + qrSize, qrY,
    qrX, qrY + qrSize,
    qrX + qrSize, qrY + qrSize
  ]);

  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  const warped = new cv.Mat();
  cv.warpPerspective(src, warped, M, new cv.Size(warpedWidth, warpedHeight));

  srcTri.delete(); dstTri.delete(); M.delete();

  // 4. Extract Answers using Adaptive Threshold
  const warpedGray = new cv.Mat();
  cv.cvtColor(warped, warpedGray, cv.COLOR_RGBA2GRAY);
  
  const warpedThresh = new cv.Mat();
  cv.adaptiveThreshold(warpedGray, warpedThresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 25, 10);

  // Group contours to find question circles dynamically
  const warpedEdges = new cv.Mat();
  cv.Canny(warpedGray, warpedEdges, 50, 150);
  const warpedContours = new cv.MatVector();
  const warpedHierarchy = new cv.Mat();
  cv.findContours(warpedEdges, warpedContours, warpedHierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  const circles = [];
  for (let i = 0; i < warpedContours.size(); ++i) {
    const cnt = warpedContours.get(i);
    const rect = cv.boundingRect(cnt);
    // Dynamic circle size filtering based on QR size
    if (rect.width >= 25 && rect.width <= 70 && rect.height >= 25 && rect.height <= 70) {
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
      const avgY = currentRow.reduce((s, box) => s + box.y, 0) / currentRow.length;
      if (Math.abs(c.y - avgY) < 30) {
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
    for (let i=0; i<row.length; i++) {
       currentQ.push(row[i]);
       if (i < row.length - 1 && (row[i+1].x - row[i].x > 100)) {
           questions.push(currentQ);
           currentQ = [];
       }
    }
    if (currentQ.length > 0) questions.push(currentQ);
  }

  let minX = Infinity, maxX = -Infinity;
  for (const q of questions) {
     if (q[0]) {
         if (q[0].x < minX) minX = q[0].x;
         if (q[q.length-1].x > maxX) maxX = q[q.length-1].x;
     }
  }
  const midX = (minX + maxX) / 2;

  const orderedQuestions = [];
  questions.sort((a, b) => a[0].y - b[0].y);
  let gridRows = [];
  let curGridRow = [];
  for (const q of questions) {
     if (curGridRow.length === 0) {
        curGridRow.push(q);
     } else {
        if (Math.abs(q[0].y - curGridRow[0][0].y) < 50) {
           curGridRow.push(q);
        } else {
           gridRows.push(curGridRow);
           curGridRow = [q];
        }
     }
  }
  if (curGridRow.length > 0) gridRows.push(curGridRow);

  for (const gr of gridRows) {
      gr.sort((a, b) => b[0].x - a[0].x);
      for (const q of gr) {
         orderedQuestions.push(q);
      }
  }

  const finalQuestions = orderedQuestions.slice(0, numQuestions);

  if (finalQuestions.length === 0) {
    warped.delete(); warpedGray.delete(); warpedThresh.delete();
    warpedEdges.delete(); warpedContours.delete(); warpedHierarchy.delete();
    src.delete();
    throw new Error("لم يتم العثور على خيارات الإجابة (الدوائر). تأكد من إضاءة الغرفة ووضوح الدوائر.");
  }

  const optionsLetters = ["A", "B", "C", "D"];
  let answers = {};

  for (let i = 0; i < numQuestions; i++) {
    const qCircles = finalQuestions[i];
    if (!qCircles || qCircles.length === 0) {
       answers[(i+1).toString()] = "EMPTY";
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
         rect.height - 2 * borderOffset
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
    
    let sorted = [...densities].sort((a,b) => b - a);
    const secondMax = sorted.length > 1 ? sorted[1] : 0;

    if (maxDarkness < 0.25) { 
      answers[(i+1).toString()] = "EMPTY";
    } else if (secondMax > maxDarkness * 0.7 && secondMax > 0.25) {
      answers[(i+1).toString()] = "INVALID";
    } else {
      answers[(i+1).toString()] = bestOption;
    }
  }

  src.delete();
  warped.delete(); warpedGray.delete(); warpedThresh.delete();
  warpedEdges.delete(); warpedContours.delete(); warpedHierarchy.delete();

  return { serialNumber, answers };
}
