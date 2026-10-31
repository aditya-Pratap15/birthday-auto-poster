const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function makeTransparent(inputPath, outputPath, tolerance = 238) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  const b64 = fs.readFileSync(inputPath).toString('base64');
  const mime = inputPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const dataUri = `data:${mime};base64,${b64}`;

  const pngBase64 = await page.evaluate(async (src, tol) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        // Background color keying (pure white and near white)
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          
          if (r >= tol && g >= tol && b >= tol) {
            const minChannel = Math.min(r, g, b);
            if (minChannel >= 250) {
              data[i + 3] = 0;
            } else {
              // Smooth edge roll-off
              const factor = (255 - minChannel) / (255 - tol);
              data[i + 3] = Math.round(data[i + 3] * factor);
            }
          }
        }
        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/png').split(',')[1]);
      };
      img.src = src;
    });
  }, dataUri, tolerance);

  await browser.close();
  fs.writeFileSync(outputPath, Buffer.from(pngBase64, 'base64'));
  console.log(`[✓] Created transparent cutout: ${outputPath}`);
}

module.exports = { makeTransparent };

if (require.main === module) {
  const [,, input, output, tol] = process.argv;
  if (!input || !output) {
    console.log('Usage: node make_transparent_cutout.js <input> <output> [tolerance]');
    process.exit(1);
  }
  makeTransparent(input, output, tol ? parseInt(tol) : 238);
}

