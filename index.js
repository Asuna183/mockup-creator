const sharp = require("sharp");
const fs = require("fs");

// Load both images
const pattern = "pattern.png";
const item = "item.png";
const output = "output.png";

// Start processing
(async () => {
  try {
    // Resize pattern to match item image size
    const itemMeta = await sharp(item).metadata();

    const resizedPattern = await sharp(pattern)
      .resize(itemMeta.width, itemMeta.height)
      .toBuffer();

    // Blend pattern over item image with some transparency
    await sharp(item)
      .composite([
        {
          input: resizedPattern,
          blend: "overlay", // Try "multiply", "screen", etc.
          opacity: 0.5,
        },
      ])
      .toFile(output);

    console.log("✅ Mockup created: output.png");
  } catch (err) {
    console.error("❌ Error:", err);
  }
})();
