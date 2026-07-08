const JsBarcode = require('jsbarcode');
const { DOMImplementation, XMLSerializer } = require('@xmldom/xmldom');

const xmlSerializer = new XMLSerializer();
const document = new DOMImplementation().createDocument('http://www.w3.org/1999/xhtml', 'html', null);
const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

try {
  JsBarcode(svgNode, "123-رقم-4", {
    xmlDocument: document,
    format: "CODE128"
  });
  console.log("Success");
} catch(e) {
  console.log("Error:", typeof e === 'string' ? e : e);
}
