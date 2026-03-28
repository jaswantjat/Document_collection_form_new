FROM python:3.11-slim-bookworm

# Set working directory
WORKDIR /app

# Install system dependencies for OpenCV and Tesseract
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    libxrandr2 \
    libasound2 \
    libblas3 \
    liblapack3 \
    libharfbuzz0b \
    libtesseract-dev \
    tesseract-ocr \
    tesseract-ocr-spa \
    && rm -rf /var/lib/apt/lists/*

# Set Tesseract OCR language data path
ENV TESSDATA_PREFIX=/usr/share/tesseract-ocr/
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port
EXPOSE 5000

# Run with Gunicorn on Railway's assigned port
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-5000} app:app --timeout 120 --workers 1 --worker-class sync"]
