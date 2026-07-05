const fs = require('fs');
let code = fs.readFileSync('omr.ts', 'utf8');

// replace from // 5. Group circles to // 6. Sort
const startIdx = code.indexOf('  // 5. Group circles into Rows (Questions)');
const endIdx = code.indexOf('  const finalQuestions = orderedQuestions.slice(0, pageQuestionsCount);');

const replaceBlock = `  // 5. Group into Major Columns (by X)
  circles.sort((a, b) => a.x - b.x);
  let majorCols = [];
  let currentCol = [];
  for (const c of circles) {
    if (currentCol.length === 0) {
      currentCol.push(c);
    } else {
      if (c.x - currentCol[currentCol.length - 1].x < 50) {
        currentCol.push(c);
      } else {
        majorCols.push(currentCol);
        currentCol = [c];
      }
    }
  }
  if (currentCol.length > 0) majorCols.push(currentCol);

  // 6. Sort columns Right-to-Left (since dir="rtl", Col 1 is on the right)
  majorCols.sort((a, b) => b[0].x - a[0].x);

  // 7. For each major column, group into Rows (Questions) by Y
  const orderedQuestions = [];
  for (const mCol of majorCols) {
    mCol.sort((a, b) => a.y - b.y);
    let qRows = [];
    let currentRow = [];
    for (const c of mCol) {
      if (currentRow.length === 0) {
        currentRow.push(c);
      } else {
        const avgY = currentRow.reduce((s, box) => s + box.y, 0) / currentRow.length;
        if (Math.abs(c.y - avgY) < 15) {
          currentRow.push(c);
        } else {
          qRows.push(currentRow);
          currentRow = [c];
        }
      }
    }
    if (currentRow.length > 0) qRows.push(currentRow);

    // Sort A, B, C, D left-to-right (A is left-most in dir="ltr" inside the options)
    // Wait, the options in HTML: 
    // <div style="display: flex; gap: 8px; direction: ltr;">
    // A, B, C, D. So A is left-most, D is right-most.
    for (const r of qRows) {
      r.sort((a, b) => a.x - b.x);
      orderedQuestions.push(r);
    }
  }

`;

code = code.substring(0, startIdx) + replaceBlock + code.substring(endIdx);
fs.writeFileSync('omr.ts', code);
