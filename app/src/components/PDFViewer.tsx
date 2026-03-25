interface PDFViewerProps {
  pdfUrl: string;
}

export function PDFViewer({ pdfUrl }: PDFViewerProps) {
  return (
    <iframe
      src={pdfUrl}
      className="w-full h-full rounded-2xl border-0"
      title="PDF Document"
    />
  );
}
