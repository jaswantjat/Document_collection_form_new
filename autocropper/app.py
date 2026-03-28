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


def resize_for_detection(img: np.ndarray, max_dim: int = 1400) -> Tuple[np.ndarray, float]:
    """
    Resize the image for contour detection while keeping track of the scale so
    detected corners can be mapped back to the original image.
    """
    height, width = img.shape[:2]
    longest_side = max(height, width)
    if longest_side <= max_dim:
        return img.copy(), 1.0

    scale = max_dim / float(longest_side)
    resized = cv2.resize(
        img,
        (int(width * scale), int(height * scale)),
        interpolation=cv2.INTER_AREA,
    )
    return resized, scale


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


def get_detection_profile(document_type: str) -> Dict[str, float]:
    """
    Detection thresholds vary by document family.
    - Bills / IBI / escritura should occupy a large portion of the frame.
    - DNI/NIE may be either a small card or a full page certificate.
    """
    if document_type in ('electricity', 'ibi'):
        return {
            'min_area_ratio': 0.12,
            'aspect_min': 1.15,
            'aspect_max': 2.10,
            'prefer_large_area': 1.6,
        }

    return {
        'min_area_ratio': 0.02,
        'aspect_min': 1.10,
        'aspect_max': 2.30,
        'prefer_large_area': 1.15,
    }


def build_detection_masks(img: np.ndarray) -> List[np.ndarray]:
    """
    Generate multiple masks because different documents fail under different
    lighting/background conditions.
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # Edge mask
    edges = cv2.Canny(blurred, 40, 140)
    edges = cv2.dilate(edges, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)), iterations=2)
    edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9)), iterations=2)

    # Bright/low-saturation paper mask for printed pages
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    bright_mask = cv2.inRange(hsv, (0, 0, 115), (180, 95, 255))
    bright_mask = cv2.morphologyEx(bright_mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (11, 11)), iterations=2)
    bright_mask = cv2.morphologyEx(bright_mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)), iterations=1)

    # Adaptive threshold fallback for low-contrast cards/pages
    adaptive = cv2.adaptiveThreshold(
        blurred,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        15,
    )
    adaptive = cv2.morphologyEx(adaptive, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9)), iterations=2)

    return [edges, bright_mask, adaptive]


def contour_to_corners(contour: np.ndarray) -> Optional[np.ndarray]:
    """
    Convert any promising contour into a quadrilateral candidate.
    """
    if contour is None or len(contour) < 4:
        return None

    perimeter = cv2.arcLength(contour, True)
    approx = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
    if len(approx) == 4:
      return order_corners(approx.reshape(4, 2).astype(np.float32))

    rect = cv2.minAreaRect(contour)
    box = cv2.boxPoints(rect)
    return order_corners(box.astype(np.float32))


def evaluate_contour(contour: np.ndarray, img_shape: Tuple[int, int, int], profile: Dict[str, float]) -> Optional[Dict[str, Any]]:
    """
    Evaluate a contour as a document candidate.
    """
    image_h, image_w = img_shape[:2]
    image_area = float(image_h * image_w)
    contour_area = cv2.contourArea(contour)
    if contour_area <= 0:
        return None

    area_ratio = contour_area / image_area
    if area_ratio < profile['min_area_ratio']:
        return None

    rect = cv2.minAreaRect(contour)
    (center_x, center_y), (width, height), _ = rect
    if width < 5 or height < 5:
        return None

    box_area = float(width * height)
    fill_ratio = contour_area / max(box_area, 1.0)
    aspect = max(width, height) / max(min(width, height), 1.0)

    aspect_penalty = 0.0
    if aspect < profile['aspect_min']:
        aspect_penalty = profile['aspect_min'] - aspect
    elif aspect > profile['aspect_max']:
        aspect_penalty = aspect - profile['aspect_max']

    center_dx = abs(center_x - image_w / 2.0) / max(image_w / 2.0, 1.0)
    center_dy = abs(center_y - image_h / 2.0) / max(image_h / 2.0, 1.0)
    center_penalty = (center_dx + center_dy) * 0.35

    x, y, bounding_w, bounding_h = cv2.boundingRect(contour)
    extent = contour_area / max(bounding_w * bounding_h, 1.0)

    # Reject contours that are effectively the entire image boundary.
    if bounding_w / image_w > 0.985 and bounding_h / image_h > 0.985:
        return None

    margin_left = x / max(image_w, 1.0)
    margin_top = y / max(image_h, 1.0)
    margin_right = (image_w - (x + bounding_w)) / max(image_w, 1.0)
    margin_bottom = (image_h - (y + bounding_h)) / max(image_h, 1.0)
    border_touches = sum(1 for margin in (margin_left, margin_top, margin_right, margin_bottom) if margin < 0.01)
    border_penalty = border_touches * 0.28

    score = (
        area_ratio * 8.0 * profile['prefer_large_area']
        + fill_ratio * 1.6
        + extent * 1.0
        - aspect_penalty * 2.2
        - center_penalty
        - border_penalty
    )

    return {
        'contour': contour,
        'score': score,
        'area_ratio': area_ratio,
        'fill_ratio': fill_ratio,
        'aspect': aspect,
        'border_touches': border_touches,
    }


def find_document_candidate(img: np.ndarray, document_type: str = 'dni') -> Optional[Dict[str, Any]]:
    """
    Return the best detected document candidate with metadata so the caller can
    decide whether perspective warping is actually safe.
    """
    profile = get_detection_profile(document_type)
    resized, scale = resize_for_detection(img)

    best_candidate: Optional[Dict[str, Any]] = None
    seen_boxes = set()

    for mask in build_detection_masks(resized):
        contours, _ = cv2.findContours(mask.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        contours = sorted(contours, key=cv2.contourArea, reverse=True)[:25]

        for contour in contours:
            candidate = evaluate_contour(contour, resized.shape, profile)
            if not candidate or candidate['score'] <= 0:
                continue

            corners = contour_to_corners(contour)
            if corners is None:
                continue

            signature = tuple(int(v) for v in corners.flatten())
            if signature in seen_boxes:
                continue
            seen_boxes.add(signature)

            if best_candidate is None or candidate['score'] > best_candidate['score']:
                candidate['corners'] = corners
                best_candidate = candidate

    if best_candidate is None:
        return None

    if scale != 1.0:
        best_candidate['corners'] = best_candidate['corners'] / scale

    best_candidate['corners'] = order_corners(best_candidate['corners'].astype(np.float32))
    return best_candidate


def find_document_edges(img: np.ndarray, document_type: str = 'dni') -> Optional[np.ndarray]:
    """
    Find document edges by evaluating multiple contour extraction strategies and
    scoring the candidates, instead of blindly taking the largest contour.
    """
    candidate = find_document_candidate(img, document_type=document_type)
    if not candidate:
        return None
    return candidate['corners']


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


def find_background_crop(img: np.ndarray, document_type: str) -> Optional[np.ndarray]:
    """
    Conservative fallback: detect a large region that differs from the dominant
    border/background color. Useful for page photos on desks/tables.
    """
    image_h, image_w = img.shape[:2]
    border = max(8, int(min(image_h, image_w) * 0.03))

    border_samples = np.concatenate([
        img[:border, :, :].reshape(-1, 3),
        img[-border:, :, :].reshape(-1, 3),
        img[:, :border, :].reshape(-1, 3),
        img[:, -border:, :].reshape(-1, 3),
    ], axis=0)
    border_color = np.median(border_samples.astype(np.float32), axis=0)

    diff = np.linalg.norm(img.astype(np.float32) - border_color, axis=2)
    border_diff = np.linalg.norm(border_samples.astype(np.float32) - border_color, axis=1)
    threshold = max(22.0, float(np.percentile(border_diff, 95)) * 1.8)
    foreground = (diff > threshold).astype(np.uint8) * 255

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
    foreground = cv2.morphologyEx(foreground, cv2.MORPH_CLOSE, kernel, iterations=2)
    foreground = cv2.morphologyEx(foreground, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)), iterations=1)

    contours, _ = cv2.findContours(foreground.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    profile = get_detection_profile(document_type)
    best_crop = None
    best_score = -1.0
    image_area = float(image_h * image_w)

    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        if w < 10 or h < 10:
            continue

        area_ratio = (w * h) / image_area
        if area_ratio < profile['min_area_ratio']:
            continue

        if w / image_w > 0.985 and h / image_h > 0.985:
            continue

        aspect = max(w, h) / max(min(w, h), 1.0)
        if aspect < profile['aspect_min'] * 0.8 or aspect > profile['aspect_max'] * 1.4:
            continue

        score = area_ratio - abs(aspect - ((profile['aspect_min'] + profile['aspect_max']) / 2.0)) * 0.03
        if score > best_score:
            best_score = score
            best_crop = img[max(0, y - 8):min(image_h, y + h + 8), max(0, x - 8):min(image_w, x + w + 8)]

    return best_crop


def normalize_orientation(img: np.ndarray, document_type: str) -> np.ndarray:
    """
    Keep the detected document orientation as-is. Real user uploads include
    both portrait and landscape pages, and the service does not have a robust
    orientation detector yet.
    """
    return img


def should_use_perspective(candidate: Dict[str, Any], document_type: str) -> bool:
    """
    Perspective correction is only safe when the boundary is trustworthy.
    Tight or partial-frame documents should avoid aggressive warping.
    """
    if document_type == 'dni':
        return (
            candidate['score'] >= 1.35
            and candidate['fill_ratio'] >= 0.78
            and candidate['border_touches'] <= 1
            and candidate['area_ratio'] <= 0.82
        )

    return (
        candidate['score'] >= 1.2
        and candidate['fill_ratio'] >= 0.55
    )


def should_use_candidate_crop(candidate: Dict[str, Any], document_type: str) -> bool:
    """
    Bounding-box crop is safer than a warp, but still skip it when the
    candidate is basically the entire frame.
    """
    if candidate['area_ratio'] >= 0.985:
        return False

    if document_type == 'dni':
        return candidate['score'] >= 0.9 and candidate['fill_ratio'] >= 0.65

    return candidate['score'] >= 0.6


def detect_and_crop_document(img: np.ndarray, document_type: str = 'dni', use_perspective: bool = True) -> np.ndarray:
    """
    Main function: detect document in image and return cropped version

    Args:
        img: Input image
        use_perspective: If True, apply perspective correction; otherwise simple crop

    Returns:
        Cropped and perspective-corrected image, or original if no document detected
    """
    candidate = find_document_candidate(img, document_type=document_type)

    if candidate is not None:
        corners = candidate['corners']
        if use_perspective and should_use_perspective(candidate, document_type):
            try:
                return normalize_orientation(four_point_transform(img, corners), document_type)
            except Exception:
                pass

        if should_use_candidate_crop(candidate, document_type):
            return normalize_orientation(crop_to_rectangle(img, corners), document_type)

    background_crop = find_background_crop(img, document_type)
    if background_crop is not None:
        return normalize_orientation(background_crop, document_type)

    return normalize_orientation(img, document_type)


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
        'version': '0.4.1',
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
                cropped = detect_and_crop_document(img, document_type=document_type)
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
