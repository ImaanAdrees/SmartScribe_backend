import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

/**
 * Generate a well-designed backup report PDF for admin
 * @param {Object} options
 * @param {string} options.outputPath - Where to save the PDF
 * @param {string} options.logoPath - Path to logo image
 * @param {Object} options.data - Data to show in the PDF
 * @param {Date} options.date - Date of backup
 */
export async function generateBackupReportPDF({ outputPath, logoPath, data, date }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    // Color scheme
    const colors = {
      primary: "#2C3E50",
      secondary: "#3498DB",
      accent: "#E74C3C",
      success: "#27AE60",
      warning: "#F39C12",
      info: "#16A085",
      lightBg: "#F8F9FA",
      border: "#E0E0E0",
      textDark: "#2C3E50",
      textLight: "#7F8C8D",
      white: "#FFFFFF"
    };

    // Logo as Watermark (subtle background)
    if (fs.existsSync(logoPath)) {
      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      
      doc.save();
      doc.opacity(0.1);
      doc.image(logoPath, pageWidth / 2 - 100, pageHeight / 2 - 100, {
        width: 200,
        align: "center",
        valign: "center"
      });
      doc.restore();
    }

    // Header Section with Gradient-like effect
    doc.rect(0, 0, doc.page.width, 120).fill(colors.primary);
    
    // Logo in header
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 40, 30, { width: 60 });
    }
    
    // Header Title
    doc.fillColor(colors.white)
      .fontSize(28)
      .font("Helvetica-Bold")
      .text("BACKUP REPORT", 120, 45, { align: "left" });
    
    doc.fontSize(11)
      .font("Helvetica")
      .fillColor(colors.white)
      .text(`Generated: ${date.toLocaleString()}`, 120, 85, { align: "left", opacity: 0.9 });
    
    doc.moveDown(2);

    // Summary Section with Cards
    const startY = 150;
    const cardWidth = (doc.page.width - 80) / 4;
    const cardHeight = 80;
    
    const summaryItems = [
      { label: "Total Users", value: data.totalUsers, color: colors.secondary },
      { label: "Transcriptions", value: data.totalTranscriptions, color: colors.success },
      { label: "Summaries", value: data.totalSummaries, color: colors.warning },
      { label: "Exports", value: data.totalExports, color: colors.info }
    ];
    
    summaryItems.forEach((item, index) => {
      const x = 40 + (index * (cardWidth + 10));
      const y = startY;
      
      // Card background
      doc.rect(x, y, cardWidth, cardHeight)
        .fill(colors.lightBg)
        .stroke();
      
      // Colored top bar
      doc.rect(x, y, cardWidth, 5).fill(item.color);
      
      // Icon (using text for simplicity)
      doc.fontSize(24)
        .fillColor(item.color)
        .text(item.icon, x + 15, y + 15);
      
      // Value
      doc.fontSize(20)
        .font("Helvetica-Bold")
        .fillColor(colors.textDark)
        .text(String(item.value), x + 15, y + 40);
      
      // Label
      doc.fontSize(9)
        .font("Helvetica")
        .fillColor(colors.textLight)
        .text(item.label, x + 15, y + 62);
    });
    
    doc.moveDown(8);

    // Top Users Section with colorful table
    doc.fillColor(colors.primary)
      .fontSize(18)
      .font("Helvetica-Bold")
      .text("TOP USERS", 40, doc.y);
    
    doc.moveDown(0.5);
    
    // Decorative line
    doc.strokeColor(colors.secondary)
      .lineWidth(3)
      .moveTo(40, doc.y)
      .lineTo(200, doc.y)
      .stroke();
    
    doc.moveDown(1);
    
    const tableTop = doc.y;
    const colWidths = [200, 180, 100];
    
    // Table Header with color
    const headerY = tableTop;
    doc.rect(40, headerY, doc.page.width - 80, 30)
      .fill(colors.secondary);
    
    doc.fillColor(colors.white)
      .fontSize(11)
      .font("Helvetica-Bold");
    
    doc.text("Name", 50, headerY + 10, { width: colWidths[0] - 10, align: "left" });
    doc.text("Email", 50 + colWidths[0], headerY + 10, { width: colWidths[1] - 10, align: "left" });
    doc.text("Transcriptions", 50 + colWidths[0] + colWidths[1], headerY + 10, { 
      width: colWidths[2] - 20, 
      align: "center" 
    });
    
    // Table rows with alternating colors
    data.topUsers.forEach((user, i) => {
      const y = tableTop + 30 + (i * 25);
      const rowColor = i % 2 === 0 ? colors.lightBg : colors.white;
      
      doc.rect(40, y, doc.page.width - 80, 25)
        .fill(rowColor);
      
      doc.fillColor(colors.textDark)
        .fontSize(10)
        .font("Helvetica");
      
      doc.text(user.name, 50, y + 8, { width: colWidths[0] - 10 });
      doc.text(user.email, 50 + colWidths[0], y + 8, { width: colWidths[1] - 10 });
      
      // Highlight value with color
      doc.fillColor(colors.success)
        .font("Helvetica-Bold")
        .text(String(user.transcriptions), 50 + colWidths[0] + colWidths[1], y + 8, { 
          width: colWidths[2] - 20,
          align: "center"
        });
    });
    
    // Footer Section
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      
      // Footer line
      const footerY = doc.page.height - 50;
      doc.strokeColor(colors.border)
        .lineWidth(1)
        .moveTo(40, footerY)
        .lineTo(doc.page.width - 40, footerY)
        .stroke();
      
      // Footer text
      doc.fillColor(colors.textLight)
        .fontSize(8)
        .font("Helvetica")
        .text(
          "Confidential Report - Generated by Admin System",
          40,
          footerY + 10,
          { align: "center", width: doc.page.width - 80 }
        );
      
      // Page numbers
      doc.text(
        `Page ${i + 1} of ${pageCount}`,
        40,
        footerY + 10,
        { align: "right", width: doc.page.width - 80 }
      );
    }

    doc.end();
    stream.on("finish", () => resolve(outputPath));
    stream.on("error", reject);
  });
}