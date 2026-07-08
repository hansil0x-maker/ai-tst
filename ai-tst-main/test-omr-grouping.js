// Simulate 15 questions in 4 columns
let circles = [];
for(let col=0; col<4; col++) {
  let baseX = 100 + col * 150;
  for(let row=0; row<15; row++) {
    let baseY = 200 + row * 30;
    for(let opt=0; opt<4; opt++) {
      circles.push({x: baseX + opt*25 + (Math.random()*4-2), y: baseY + (Math.random()*4-2)});
    }
  }
}

// 1. Group into Major Columns (by X)
circles.sort((a,b) => a.x - b.x);
let majorCols = [];
let currentCol = [];
for(let c of circles) {
  if(currentCol.length === 0) {
    currentCol.push(c);
  } else {
    // Distance to the last circle in the current column
    if (c.x - currentCol[currentCol.length-1].x < 50) {
      currentCol.push(c);
    } else {
      majorCols.push(currentCol);
      currentCol = [c];
    }
  }
}
majorCols.push(currentCol);
console.log("Found " + majorCols.length + " major columns");

// 2. For each major column, group into Rows (Questions) by Y
let allQuestions = [];
for(let mCol of majorCols) {
  mCol.sort((a,b) => a.y - b.y);
  let qRows = [];
  let currentRow = [];
  for(let c of mCol) {
    if(currentRow.length === 0) {
      currentRow.push(c);
    } else {
      let avgY = currentRow.reduce((s, b) => s + b.y, 0) / currentRow.length;
      if (Math.abs(c.y - avgY) < 15) {
        currentRow.push(c);
      } else {
        qRows.push(currentRow);
        currentRow = [c];
      }
    }
  }
  qRows.push(currentRow);
  console.log("Column has " + qRows.length + " questions");
  // Sort A,B,C,D left-to-right
  for(let r of qRows) {
    r.sort((a,b) => a.x - b.x);
  }
  allQuestions.push(qRows);
}
