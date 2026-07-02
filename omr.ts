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

  // Convert to grayscale
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  // 2. Find Anchor Marks
  // Apply a light blur and threshold to find the black squares
  const blurred = new cv.Mat();
  cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
  
  const thresh = new cv.Mat();
  // Using Otsu's thresholding to separate black squares from white paper
  cv.threshold(blurred, thresh, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  let anchors = [];
  for (let i = 0; i < contours.size(); ++i) {
    const cnt = contours.get(i);
    const area = cv.contourArea(cnt);
    // Anchor marks are 40x40. Depending on the camera scale, they could be anything from 10x10 to 100x100.
    // Let's assume reasonable bounds
    if (area > 100 && area < 20000) {
      const rect = cv.boundingRect(cnt);
      const aspect = rect.width / rect.height;
      
      // Calculate solidity
      const hull = new cv.Mat();
      cv.convexHull(cnt, hull, false, true);
      const hullArea = cv.contourArea(hull);
      const solidity = hullArea > 0 ? area / hullArea : 0;
      hull.delete();

      if (aspect > 0.7 && aspect < 1.3 && solidity > 0.8) {
        // It's a square-like solid shape
        const centerX = rect.x + rect.width / 2;
        const centerY = rect.y + rect.height / 2;
        anchors.push({ x: centerX, y: centerY, area: area, rect });
      }
    }
  }

  // If we found more than 4, take the 4 largest
  anchors.sort((a, b) => b.area - a.area);
  if (anchors.length > 4) {
    anchors = anchors.slice(0, 4);
  }

  let serialNumber = "UNKNOWN";
  // 3. QR Code Detection
  // Try original image first
  const imgDataOriginal = new Uint8ClampedArray(image.bitmap.data);
  const codeOriginal = jsQR(imgDataOriginal, image.bitmap.width, image.bitmap.height);
  if (codeOriginal) {
    serialNumber = codeOriginal.data;
  }

  let answers: any = {};
  
  if (anchors.length !== 4) {
    src.delete(); gray.delete(); blurred.delete(); thresh.delete();
    contours.delete(); hierarchy.delete();
    throw new Error(`لم يتم العثور على زوايا الورقة الأربعة بشكل صحيح. تم العثور على ${anchors.length} زوايا فقط.`);
  }

  // Sort anchors into TL, TR, BL, BR
  anchors.sort((a, b) => a.y - b.y); // top 2, bottom 2
  const top = anchors.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottom = anchors.slice(2, 4).sort((a, b) => a.x - b.x);
  
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    top[0].x, top[0].y,
    top[1].x, top[1].y,
    bottom[0].x, bottom[0].y,
    bottom[1].x, bottom[1].y
  ]);
  
  // Exact centers based on the Exams.tsx layout
  // Page: 794x1123.
  // Top-Left: x=20, y=20, w=40, h=40 -> center (40, 40)
  // Top-Right: x=734, y=20 -> center (754, 40)
  // Bottom-Left: x=20, y=1063 -> center (40, 1083)
  // Bottom-Right: x=734, y=1063 -> center (754, 1083)
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    40, 40,
    754, 40,
    40, 1083,
    754, 1083
  ]);

  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  const warped = new cv.Mat();
  cv.warpPerspective(src, warped, M, new cv.Size(794, 1123));

  // Cleanup perspective mats
  srcTri.delete(); dstTri.delete(); M.delete();

  // If original failed, try warped for QR code
  if (!codeOriginal) {
    const imgDataWarped = new Uint8ClampedArray(warped.data);
    const codeWarped = jsQR(imgDataWarped, 794, 1123);
    if (codeWarped) {
      serialNumber = codeWarped.data;
    }
  }

  if (serialNumber === "UNKNOWN") {
    warped.delete(); src.delete(); gray.delete(); blurred.delete(); thresh.delete();
    contours.delete(); hierarchy.delete();
    throw new Error("لم يتم العثور على رمز QR أو قراءته بشكل صحيح.");
  }

    // 4. Extract Answers using Adaptive Threshold
    const warpedGray = new cv.Mat();
    cv.cvtColor(warped, warpedGray, cv.COLOR_RGBA2GRAY);
    
    const warpedThresh = new cv.Mat();
    // Adaptive threshold to handle weak shading and shadows
    cv.adaptiveThreshold(warpedGray, warpedThresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 21, 5);

    // Group contours to find question rows
    const warpedEdges = new cv.Mat();
    cv.Canny(warpedGray, warpedEdges, 50, 150);
    const warpedContours = new cv.MatVector();
    const warpedHierarchy = new cv.Mat();
    cv.findContours(warpedEdges, warpedContours, warpedHierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const circles = [];
    for (let i = 0; i < warpedContours.size(); ++i) {
      const cnt = warpedContours.get(i);
      const rect = cv.boundingRect(cnt);
      // Expected circle size is ~25x25. Allow 15-35.
      if (rect.width >= 15 && rect.width <= 35 && rect.height >= 15 && rect.height <= 35) {
        // Circles are on the left side, X coordinates roughly 60, 100, 140, 180
        if (rect.x > 40 && rect.x < 220) {
          circles.push(rect);
        }
      }
    }

    // Group by Y
    let rows = [];
    circles.sort((a, b) => a.y - b.y);
    let currentRow = [];
    for (const c of circles) {
      if (currentRow.length === 0) {
        currentRow.push(c);
      } else {
        const avgY = currentRow.reduce((s, box) => s + box.y, 0) / currentRow.length;
        if (Math.abs(c.y - avgY) < 15) {
          currentRow.push(c);
        } else {
          rows.push(currentRow);
          currentRow = [c];
        }
      }
    }
    if (currentRow.length > 0) rows.push(currentRow);

    // Filter to rows that have at least a few circles to be sure it's a question row
    // A scribbled circle might not be detected, so even 2-3 circles is fine.
    rows = rows.filter(r => r.length >= 2);
    
    // Sort rows by Y
    rows.sort((a, b) => {
      const ay = a.reduce((s, box) => s + box.y, 0) / a.length;
      const by = b.reduce((s, box) => s + box.y, 0) / b.length;
      return ay - by;
    });

    // We only take up to numQuestions
    if (rows.length > numQuestions) {
      rows = rows.slice(0, numQuestions);
    }

    if (rows.length === 0) {
      warped.delete(); warpedGray.delete(); warpedThresh.delete();
      warpedEdges.delete(); warpedContours.delete(); warpedHierarchy.delete();
      src.delete(); gray.delete(); blurred.delete(); thresh.delete();
      contours.delete(); hierarchy.delete();
      throw new Error("لم يتم العثور على خيارات الإجابة (الدوائر) في الورقة.");
    }

    // Fixed X coordinates based on layout
    const xCoords = [60, 100, 140, 180]; // A, B, C, D
    const optionsLetters = ["A", "B", "C", "D"];

    for (let i = 0; i < numQuestions; i++) {
      let qy = -1;
      if (i < rows.length) {
        qy = rows[i].reduce((s, box) => s + box.y, 0) / rows[i].length;
      } else {
        // If we missed a row, interpolate or guess based on previous
        if (i > 0 && rows[i-1]) {
           const prevY = rows[i-1].reduce((s, box) => s + box.y, 0) / rows[i-1].length;
           qy = prevY + 68; // Rough guess for Y spacing if margin-bottom is 25 + text height
        }
      }

      if (qy !== -1) {
        let densities = [];
        for (let j = 0; j < 4; j++) {
          // Box ROI: x, y, width, height
          // Using a slightly smaller box to avoid the 2px black border!
          // Border is 2px, size is 25x25. Center is x+12.5.
          // Inner area: x+4 to x+21 (width 17)
          const boxX = xCoords[j] + 4;
          const boxY = Math.round(qy) + 4;
          const boxW = 17;
          const boxH = 17;
          
          if (boxX + boxW < warpedThresh.cols && boxY + boxH < warpedThresh.rows && boxX >= 0 && boxY >= 0) {
            const rect = new cv.Rect(boxX, boxY, boxW, boxH);
            const roi = warpedThresh.roi(rect);
            const nonZero = cv.countNonZero(roi);
            densities.push(nonZero);
            roi.delete();
          } else {
            densities.push(0);
          }
        }

        // Relative comparison
        const maxDensity = Math.max(...densities);
        const maxIndex = densities.indexOf(maxDensity);
        
        let sorted = [...densities].sort((a,b) => b - a);
        const secondMax = sorted[1];

        // Limits
        // Total pixels in 17x17 = 289
        // A light shade might be 50 pixels.
        if (maxDensity < 40) {
          answers[(i+1).toString()] = "EMPTY";
        } else if (secondMax > maxDensity * 0.75 && secondMax > 40) {
          // Ambiguous / multiple shaded
          answers[(i+1).toString()] = "INVALID";
        } else {
          answers[(i+1).toString()] = optionsLetters[maxIndex];
        }
      } else {
        answers[(i+1).toString()] = "EMPTY";
      }
    }

    warped.delete();
    warpedGray.delete();
    warpedThresh.delete();
    warpedEdges.delete();
    warpedContours.delete();
    warpedHierarchy.delete();

  // Cleanup
  src.delete(); gray.delete(); blurred.delete(); thresh.delete();
  contours.delete(); hierarchy.delete();

  // If perspective failed, anchors.length < 4, answers is empty
  // We can return a specific error or let the system handle empty answers

  return { serialNumber, answers };
}
