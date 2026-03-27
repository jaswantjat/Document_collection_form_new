"""
Autocropper Service - Document Cropping and PDF Generation
Processes Spanish documents: DNI, IBI, Electricity Bills
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import io
import base64
from typing import List, Dict, Any, Optional, Tuple
import traceback
import numpy as np
import cv2
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.utils import ImageReader

app = Flask(__name__)
CORS(app)

# ============================================================================
# FEATURE FLAGS
# ============================================================================
FEATURES = {
    'document_detection': True,
    'perspective_correction': True,
    'orientation_detection': False,
    'pdf_generation': True
}

# ============================================================================
# IMAGE PROCESSING UTILITIES
# ============================================================================

def decode_base64_image(image_b64: str) -> np.ndarray:
    """
    Decode a base64 data URL to an OpenCV image (BGR format)
    """
    # Remove data URL prefix if present
    if ',' in image_b64:
        _, encoded = image_b64.split(',', 1)
    else:
        encoded = image_b64

    # Decode base64
    img_data = base64.b64decode(encoded)
    img_array = np.frombuffer(img_data, dtype=np.uint8)
    img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    return img


def encode_to_base64(img: np.ndarray, format: str = '.jpg', quality: int = 90) -> str:
    """
    Encode an OpenCV image to base64 data URL
    """
    encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), quality]
    _, buffer = cv2.imencode(format, img, encode_param)
    img_b64 = base64.b64encode(buffer).decode('utf-8')
    return f"data:image/jpeg;base64,{img_b64}"


def order_corners(pts: np.ndarray) -> np.ndarray:
    """
    Order corner points in consistent order: top-left, top-right, bottom-right, bottom-left
    """
    # Sort by x coordinate
    x_sorted = pts[np.argsort(pts[:, 0]), :]

    # Grab left-most and right-most points
    left = x_sorted[:2, :]
    right = x_sorted[2:, :]

    # Now sort by y to get top-left vs bottom-left, top-right vs bottom-right
    left = left[np.argsort(left[:, 1]), :]
    (tl, bl) = left

    right = right[np.argsort(right[:, 1]), :]
    (tr, br) = right

    # Return in order: top-left, top-right, bottom-right, bottom-left
    return np.array([tl, tr, br, bl], dtype=np.float32)


def find_document_edges(img: np.ndarray) -> Optional[np.ndarray]:
    """
    Find document edges in an image using edge detection and contour finding.

    Returns:
        Four corner points of the document (ordered), or None if no document found
    """
    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Apply Gaussian blur to reduce noise
    gray = cv2.GaussianBlur(gray, (5, 5), 0)

    # Apply Canny edge detection
    # Lower threshold = 50, upper threshold = 150
    edges = cv2.Canny(gray, 50, 150)

    # Dilate edges to close gaps
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    edges = cv2.dilate(edges, kernel, iterations=2)

    # Find contours
    contours, _ = cv2.findContours(edges.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        return None

    # Find the largest contour by area
    largest_contour = max(contours, key=cv2.contourArea)
    contour_area = cv2.contourArea(largest_contour)

    # Filter out very small contours (less than 5% of image area)
    img_area = img.shape[0] * img.shape[1]
    if contour_area < img_area * 0.05:
        return None

    # Approximate the contour to a polygon
    epsilon = 0.02 * cv2.arcLength(largest_contour, True)
    approx = cv2.approxPolyDP(largest_contour, epsilon, True)

    # We need a quadrilateral (4 corners)
    if len(approx) != 4:
        # If not exactly 4 points, try to get the convex hull and approximate again
        hull = cv2.convexHull(largest_contour)
        epsilon = 0.02 * cv2.arcLength(hull, True)
        approx = cv2.approxPolyDP(hull, epsilon, True)
        if len(approx) != 4:
            # Still not 4 points, try to find 4 extreme points
            return find_extreme_corners(largest_contour)

    # Reshape to (4, 2)
    corners = approx.reshape(4, 2).astype(np.float32)

    # Order corners consistently
    return order_corners(corners)


def find_extreme_corners(contour: np.ndarray) -> Optional[np.ndarray]:
    """
    Find the 4 extreme corners of a contour (top-left, top-right, bottom-right, bottom-left)
    """
    if len(contour) < 4:
        return None

    # Reshape contour to (N, 2)
    points = contour.reshape(-1, 2)

    # Find extreme points
    tl = points[np.argmin(points[:, 0] + points[:, 1])]  # Min x + y
    tr = points[np.argmax(points[:, 0] - points[:, 1])]  # Max x - y
    br = points[np.argmax(points[:, 0] + points[:, 1])]  # Max x + y
    bl = points[np.argmin(points[:, 0] - points[:, 1])]  # Min x - y

    return np.array([tl, tr, br, bl], dtype=np.float32)


def four_point_transform(img: np.ndarray, corners: np.ndarray) -> np.ndarray:
    """
    Apply a perspective transform to get a top-down view of the document

    Args:
        img: Source image
        corners: Four corner points in order [tl, tr, br, bl]

    Returns:
        Warped image with perspective corrected
    """
    # Order corners: tl, tr, br, bl
    rect = order_corners(corners)

    # Compute the width of the new image
    # Bottom width (distance between br and bl)
    width_bottom = np.linalg.norm(rect[2] - rect[3])
    # Top width (distance between tr and tl)
    width_top = np.linalg.norm(rect[1] - rect[0])
    # Maximum width
    max_width = max(int(width_bottom), int(width_top))

    # Compute the height of the new image
    # Right height (distance between tr and br)
    height_right = np.linalg.norm(rect[1] - rect[2])
    # Left height (distance between tl and bl)
    height_left = np.linalg.norm(rect[0] - rect[3])
    # Maximum height
    max_height = max(int(height_right), int(height_left))

    # Destination points for the transform (top-down view)
    dst = np.array([
        [0, 0],                           # Top-left
        [max_width - 1, 0],               # Top-right
        [max_width - 1, max_height - 1],  # Bottom-right
        [0, max_height - 1]               # Bottom-left
    ], dtype=np.float32)

    # Compute the perspective transform matrix
    M = cv2.getPerspectiveTransform(rect, dst)

    # Apply the perspective transform
    warped = cv2.warpPerspective(img, M, (max_width, max_height))

    return warped


def crop_to_rectangle(img: np.ndarray, corners: np.ndarray) -> np.ndarray:
    """
    Crop image to the bounding rectangle defined by corners (simple crop, no perspective correction)
    Fallback if perspective transform fails
    """
    # Get the bounding rectangle
    x, y, w, h = cv2.boundingRect(corners)

    # Add small padding (2%)
    pad_x = int(w * 0.02)
    pad_y = int(h * 0.02)

    # Ensure within image bounds
    x1 = max(0, x - pad_x)
    y1 = max(0, y - pad_y)
    x2 = min(img.shape[1], x + w + pad_x)
    y2 = min(img.shape[0], y + h + pad_y)

    return img[y1:y2, x1:x2]


def detect_and_crop_document(img: np.ndarray, use_perspective: bool = True) -> np.ndarray:
    """
    Main function: detect document in image and return cropped version

    Args:
        img: Input image
        use_perspective: If True, apply perspective correction; otherwise simple crop

    Returns:
        Cropped and perspective-corrected image, or original if no document detected
    """
    corners = find_document_edges(img)

    if corners is not None:
        # Document found
        if use_perspective:
            try:
                # Apply perspective transform for proper alignment
                return four_point_transform(img, corners)
            except Exception:
                # Fall back to simple crop if perspective transform fails
                return crop_to_rectangle(img, corners)
        else:
            # Simple crop without perspective correction
            return crop_to_rectangle(img, corners)
    else:
        # No document detected - return original
        return img


def create_pdf_from_images(images: List[np.ndarray]) -> str:
    """
    Create a PDF from a list of OpenCV images using ReportLab

    Args:
        images: List of OpenCV images (BGR format)

    Returns:
        Base64-encoded data URL for the PDF
    """
    if not images:
        return None

    try:
        # Create PDF in memory
        pdf_buffer = io.BytesIO()

        # Get page size (A4 is more standard for documents)
        page_width, page_height = A4

        # Create PDF canvas
        c = canvas.Canvas(pdf_buffer, pagesize=A4)

        # Process each image as a page
        for i, img in enumerate(images):
            # Convert BGR to RGB
            rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            # Convert to PIL Image
            pil_img = Image.fromarray(rgb_img)

            # Get image dimensions
            img_width, img_height = pil_img.size

            # Calculate fit to page (with margin)
            margin = 50
            available_width = page_width - 2 * margin
            available_height = page_height - 2 * margin

            # Scale image to fit within available space
            width_ratio = available_width / img_width
            height_ratio = available_height / img_height
            scale = min(width_ratio, height_ratio)

            scaled_width = img_width * scale
            scaled_height = img_height * scale

            # Center the image on the page
            x = (page_width - scaled_width) / 2
            y = (page_height - scaled_height) / 2

            # Convert PIL image to bytes for ReportLab
            img_buffer = io.BytesIO()
            pil_img.save(img_buffer, format='PNG')
            img_buffer.seek(0)

            # Draw image on PDF page
            c.drawImage(
                ImageReader(img_buffer),
                x, y,
                scaled_width,
                scaled_height,
                preserveAspectRatio=True
            )

            # Add new page for next image (except for the last one)
            if i < len(images) - 1:
                c.showPage()

        # Save the PDF
        c.save()

        # Get PDF bytes
        pdf_bytes = pdf_buffer.getvalue()

        # Encode to base64
        pdf_b64 = base64.b64encode(pdf_bytes).decode('utf-8')
        return f"data:application/pdf;base64,{pdf_b64}"

    except Exception as e:
        print(f"Error creating PDF: {e}")
        import traceback
        traceback.print_exc()
        return None


# ============================================================================
# ROUTES
# ============================================================================

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'autocropper',
        'version': '0.4.0',
        'features': FEATURES
    })


@app.route('/api/process', methods=['POST'])
def process_documents():
    """
    Process document images and return cropped images + combined PDF

    Expected JSON body:
    {
        "documentType": "dni" | "ibi" | "electricity",
        "images": ["data:image/jpeg;base64,...", ...]
    }

    Returns:
    {
        "success": true,
        "cropped_images": ["data:image/jpeg;base64,...", ...],
        "combined_pdf": "data:application/pdf;base64,..."
    }
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'No JSON data provided'}), 400

        document_type = data.get('documentType')
        images = data.get('images', [])

        if not document_type:
            return jsonify({'success': False, 'error': 'documentType is required'}), 400

        if not images:
            return jsonify({'success': False, 'error': 'images array is required'}), 400

        cropped_images = []
        cropped_cv2_images = []  # Keep OpenCV images for PDF generation

        for img_b64 in images:
            try:
                # Decode image
                img = decode_base64_image(img_b64)

                if img is None:
                    cropped_images.append(img_b64)  # Keep original if decode fails
                    continue

                # Detect and crop document
                cropped = detect_and_crop_document(img)
                cropped_cv2_images.append(cropped)

                # Encode back to base64
                cropped_b64 = encode_to_base64(cropped)
                cropped_images.append(cropped_b64)

            except Exception as e:
                # If processing fails, keep original image
                cropped_images.append(img_b64)

        # Generate combined PDF from all cropped images
        combined_pdf = None
        if cropped_cv2_images:
            combined_pdf = create_pdf_from_images(cropped_cv2_images)

        return jsonify({
            'success': True,
            'cropped_images': cropped_images,
            'combined_pdf': combined_pdf,
            'message': 'Document processing complete'
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'trace': traceback.format_exc()
        }), 500


@app.route('/api/test-base64', methods=['POST'])
def test_base64():
    """
    Test endpoint to verify base64 image handling
    """
    try:
        data = request.get_json()
        image_b64 = data.get('image', '')

        if not image_b64:
            return jsonify({'success': False, 'error': 'No image provided'}), 400

        # Verify we can parse the base64
        if image_b64.startswith('data:image/'):
            return jsonify({
                'success': True,
                'received_image_size': len(image_b64),
                'message': 'Base64 image received successfully'
            })

        return jsonify({'success': False, 'error': 'Invalid image format'}), 400

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


if __name__ == '__main__':
    port = int(__import__('os').environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
