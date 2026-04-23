import fs from 'fs';
import path from 'path';
import { jsPDF } from 'jspdf';

try {
  const doc = new jsPDF();
  const logoPath = path.resolve('src/logo/mainlogo.png');
  const logoBase64 = fs.readFileSync(logoPath).toString('base64');
  
  doc.saveGraphicsState();
  doc.setGState(new doc.GState({opacity: 0.15}));
  doc.addImage(`data:image/png;base64,${logoBase64}`, 'PNG', 55, 98, 100, 100);
  doc.restoreGraphicsState();
  
  doc.text("Hello world!", 10, 10);
  
  const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
  fs.writeFileSync('test-watermark.pdf', pdfBuffer);
  console.log("Success Watermark");
} catch (e) {
  console.error(e);
}
