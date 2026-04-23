import fs from 'fs';
import path from 'path';
import { jsPDF } from 'jspdf';

try {
  const doc = new jsPDF();
  doc.text("Hello world!", 10, 10);
  const logoPath = path.resolve('src/logo/mainlogo.png');
  const logoBase64 = fs.readFileSync(logoPath).toString('base64');
  doc.addImage(`data:image/png;base64,${logoBase64}`, 'PNG', 10, 20, 50, 50);
  const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
  fs.writeFileSync('test-image.pdf', pdfBuffer);
  console.log("Success Image");
} catch (e) {
  console.error(e);
}
