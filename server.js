const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const app = express();
const port = 3000;

// Increase max content length if needed
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Enable CORS and static serving
app.use(cors());
app.use(express.static("public"));

// Helper function to compress an image if its dimensions exceed maxDim
async function compressImageBuffer(buffer, maxDim = 1024) {
  const image = sharp(buffer);
  const metadata = await image.metadata();
  if (metadata.width > maxDim || metadata.height > maxDim) {
    return await image.resize({ width: maxDim, height: maxDim, fit: "inside" }).toBuffer();
  }
  return buffer;
}

// Multer config – store in memory
const upload = multer({ storage: multer.memoryStorage() });

// Serve the frontend file
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post(
  "/generate",
  upload.fields([
    { name: "mask" },
    { name: "pattern" },
    { name: "original" },
  ]),
  async (req, res) => {
    try {
      // Compress original and pattern images to keep sizes manageable
      const originalRaw = req.files["original"][0].buffer;
      const patternRaw = req.files["pattern"][0].buffer;
      const originalImg = await compressImageBuffer(originalRaw, 1024);
      const patternImg = await compressImageBuffer(patternRaw, 1024);

      // Extract mask from the data URL (it must include the prefix)
      const maskDataURL = req.body.mask;
      if (!maskDataURL) throw new Error("Mask image is missing.");
      // Remove the prefix: "data:image/png;base64,"
      const maskBase64 = maskDataURL.replace(/^data:image\/\w+;base64,/, "");
      const maskBuffer = Buffer.from(maskBase64, "base64");

      // Get dimensions of the compressed original image
      const originalMetadata = await sharp(originalImg).metadata();
      const { width, height } = originalMetadata;
      if (!width || !height) throw new Error("Invalid original image dimensions.");

      // Resize the pattern to match the original image dimensions
      const resizedPattern = await sharp(patternImg)
        .resize(width, height)
        .toBuffer();

      // Process the mask:
      // - Resize to match the original
      // - Convert to grayscale (b-w) and threshold for pure black/white
      // - Apply a slight blur to soften edges
      const resizedMask = await sharp(maskBuffer)
        .resize(width, height)
        .toColourspace("b-w")
        .threshold(128)
        .toBuffer();
      const softenedMask = await sharp(resizedMask)
        .blur(1)
        .toBuffer();

      // --- Shading Map Approach ---
      // 1. Extract object region using mask (composite with white background)
      const white_bg = await sharp(originalImg)
        .resize(width, height)
        .toBuffer();
      const object_region = await sharp(originalImg)
        .composite([{ input: softenedMask, blend: "dest-in" }])
        .toBuffer();
      
      // 2. Create a shading map by converting the object region to grayscale
      const shading_map = await sharp(object_region)
        .toColourspace("b-w")
        .toBuffer();

      // 3. Apply the shading map to the resized pattern using multiply
      const pattern_shaded = await sharp(resizedPattern)
        .composite([{ input: shading_map, blend: "multiply" }])
        .toBuffer();

      // 4. Composite the shaded pattern onto the original image using the softened mask as the alpha channel
      const composited = await sharp(originalImg)
        .composite([
          {
            input: pattern_shaded,
            blend: "over",
            mask: { input: softenedMask },
          },
        ])
        .toBuffer();

      // 5. Blend the composite with the original for a smoother integration
      const finalResult = await sharp(originalImg)
        .composite([{ input: composited, blend: "soft-light", opacity: 0.8 }])
        .toBuffer();

      const outputPath = path.join(__dirname, "public", "result.png");
      fs.writeFileSync(outputPath, finalResult);
      res.sendFile(outputPath);
    } catch (err) {
      console.error("❌ ERROR:", err);
      res
        .status(500)
        .send("Something went wrong 💀<br><pre>" + err.message + "</pre>");
    }
  }
);

app.listen(port, () => {
  console.log(`🚀 Mockup Creator running at http://localhost:${port}`);
});
















