from flask import Flask, request, send_file, jsonify
from PIL import Image, ImageOps, ImageChops
import io, base64, os

app = Flask(__name__)

# Set maximum allowed payload to 20 MB.
app.config['MAX_CONTENT_LENGTH'] = 20 * 1024 * 1024  # 20 MB

@app.errorhandler(413)
def request_too_large(e):
    return jsonify({"error": "File too large! Please upload an image smaller than 20 MB."}), 413

@app.route('/')
def serve_index():
    return send_file(os.path.join(os.path.dirname(__file__), 'public', 'index.html'))

@app.route('/generate', methods=['POST'])
def generate():
    try:
        # Get original and pattern images from files and the mask from form data
        original_file = request.files.get('original')
        pattern_file = request.files.get('pattern')
        mask_data = request.form.get('mask')  # Expected as a full data URL (e.g., data:image/png;base64,...)

        if not original_file or not pattern_file or not mask_data:
            return jsonify({"error": "Missing original image, pattern, or mask data"}), 400

        # Open images and convert to RGB (for original and pattern)
        original = Image.open(original_file.stream).convert("RGB")
        pattern = Image.open(pattern_file.stream).convert("RGB")

        # Decode the mask data URL and convert to grayscale (L mode)
        header, encoded = mask_data.split(",", 1)
        mask_bytes = base64.b64decode(encoded)
        mask = Image.open(io.BytesIO(mask_bytes)).convert("L")

        # Resize pattern and mask to match the original image dimensions
        original_size = original.size
        pattern = pattern.resize(original_size)
        mask = mask.resize(original_size)

        # --- Shading Map Approach ---
        # 1. Use the mask to extract the object (shirt) region from the original image.
        #    Composite the original with a white background so that only the masked area remains.
        white_bg = Image.new("RGB", original_size, (255, 255, 255))
        object_region = Image.composite(original, white_bg, mask)
        
        # 2. Convert the extracted object region to grayscale to serve as a shading map.
        shading_map = object_region.convert("L")
        
        # 3. Apply the shading map to the pattern.
        #    Multiply the pattern by the shading map (converted to RGB) so the pattern inherits the shadows.
        pattern_shaded = ImageChops.multiply(pattern, shading_map.convert("RGB"))
        
        # 4. Composite the modified (shaded) pattern over the original image,
        #    but only in the masked area.
        composited = Image.composite(pattern_shaded, original, mask)
        
        # 5. Optionally, blend the composited result with the original image to further smooth the transition.
        result = Image.blend(original, composited, alpha=0.8)
        
        # Save the result into a BytesIO object
        output = io.BytesIO()
        result.save(output, format="PNG")
        output.seek(0)
        return send_file(output, mimetype="image/png")
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(port=3000, debug=True)

