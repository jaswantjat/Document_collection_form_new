export async function pdfToImageFiles(file: File): Promise<File[]> {
  const formData = new FormData();
  formData.append('file', file, file.name);

  const res = await fetch('/api/pdf-to-images', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    let message = 'Error al convertir el PDF.';
    try {
      const json = await res.json();
      if (json.message) message = json.message;
    } catch {
      // ignore parse error
    }
    throw new Error(message);
  }

  const json = await res.json();
  if (!json.success || !Array.isArray(json.images)) {
    throw new Error(json.message || 'El servicio de conversión no devolvió imágenes.');
  }

  return json.images.map((img: { name: string; data: string; mimeType: string }) => {
    const byteString = atob(img.data);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: img.mimeType });
    return new File([blob], img.name, { type: img.mimeType });
  });
}
