const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

// CONFIG
const REPLICATE_API_TOKEN = 'r8_Yuaebq3d2edVmlvog8oGs6201SgR1u12dkRgP';
const INPUT_IMAGE_PATH = './item.png'; // or whatever your base image is
const SEGMENT_TARGET = 'shirt'; // change to "wall", "sofa", etc.

// STEP 1: Upload image to Replicate
async function uploadImage() {
  const formData = new FormData();
  formData.append('file', fs.createReadStream(INPUT_IMAGE_PATH));

  const response = await axios.post('https://dreambooth-api-experimental.replicate.delivery/upload', formData, {
    headers: formData.getHeaders(),
  });

  return response.data.url;
}

// STEP 2: Generate mask
async function generateMask(imageUrl) {
  const response = await axios.post('https://api.replicate.com/v1/predictions', {
    version: "525e03f1d8e66222f3c9cb383dcba1dd3adfd0056d3b4c53b7316b6d22df3b77", // clipseg model version
    input: {
      image: imageUrl,
      prompt: SEGMENT_TARGET,
    },
  }, {
    headers: {
      Authorization: `Token ${REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  const predictionUrl = response.data.urls.get;

  // Poll until it's done
  let maskUrl = null;
  while (!maskUrl) {
    const result = await axios.get(predictionUrl, {
      headers: { Authorization: `Token ${REPLICATE_API_TOKEN}` },
    });

    if (result.data.status === "succeeded") {
      maskUrl = result.data.output;
    } else if (result.data.status === "failed") {
      throw new Error("Replicate failed to generate mask.");
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  return maskUrl;
}

// STEP 3: Download mask image
async function downloadMask(maskUrl) {
  const response = await axios.get(maskUrl, { responseType: "arraybuffer" });
  fs.writeFileSync("mask.png", response.data);
  console.log("✅ Mask saved as mask.png");
}

(async () => {
  try {
    const uploadedUrl = await uploadImage();
    const maskUrl = await generateMask(uploadedUrl);
    await downloadMask(maskUrl);
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
})();
