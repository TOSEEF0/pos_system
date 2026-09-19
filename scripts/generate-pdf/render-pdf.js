// scripts/generate-pdf/render-pdf.js
const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

console.log("Generating Aaj Cash & Carry POS Product Guide PDF...");

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      show: false,
      width: 1200,
      height: 1600,
      webPreferences: {
        nodeIntegration: true
      }
    });

    const htmlPath = path.join(__dirname, "pos-product-guide.html");
    await win.loadFile(htmlPath);

    // Allow styles and layout to stabilize
    await new Promise((resolve) => setTimeout(resolve, 800));

    const pdfData = await win.webContents.printToPDF({
      pageSize: "A4",
      printBackground: true,
      margins: {
        marginType: "none"
      }
    });

    const outputDir = path.join(__dirname, "..", "..", "dist_electron");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const pdfPath1 = path.join(outputDir, "Aaj_Cash_and_Carry_POS_Buyer_Guide.pdf");
    const pdfPath2 = path.join(__dirname, "..", "..", "Aaj_Cash_and_Carry_POS_Buyer_Guide.pdf");

    fs.writeFileSync(pdfPath1, pdfData);
    fs.writeFileSync(pdfPath2, pdfData);

    console.log("=================================================");
    console.log("✅ PDF GENERATED SUCCESSFULLY!");
    console.log("Location 1:", pdfPath1);
    console.log("Location 2:", pdfPath2);
    console.log("File size:", Math.round(pdfData.length / 1024), "KB");
    console.log("=================================================");
  } catch (err) {
    console.error("❌ Failed to render PDF:", err);
  } finally {
    app.quit();
  }
});
