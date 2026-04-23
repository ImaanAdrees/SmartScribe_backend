import fs from 'fs';
import { jsPDF } from 'jspdf';

try {
  const doc = new jsPDF();
  doc.text("Hello world!", 10, 10);
  const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
  fs.writeFileSync('test.pdf', pdfBuffer);
  console.log("Success");
} catch (e) {
  console.error(e);
}
