import { useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'

import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

import { fetchPdfBlobUrl, type PdfRecord } from '../api'

type PdfViewerProps = {
  pdfRecord: PdfRecord
  onClose: () => void
  initialPage?: number
}

export default function PdfViewer({ pdfRecord, onClose, initialPage }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pdfPage, setPdfPage] = useState(1)
  const [pdfBlobUrl, setPdfBlobUrl] = useState('')
  const pdfBlobUrlRef = useRef('')

  useEffect(() => {
    fetchPdfBlobUrl(pdfRecord.id)
      .then((url) => {
        pdfBlobUrlRef.current = url
        setPdfBlobUrl(url)
      })

    return () => {
      if (pdfBlobUrlRef.current) {
        URL.revokeObjectURL(pdfBlobUrlRef.current)
        pdfBlobUrlRef.current = ''
      }
    }
  }, [pdfRecord.id])

  function handleClose() {
    if (pdfBlobUrlRef.current) {
      URL.revokeObjectURL(pdfBlobUrlRef.current)
      pdfBlobUrlRef.current = ''
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex h-full w-full max-w-5xl flex-col rounded bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
          <h2 className="truncate font-mono text-sm font-bold text-blue-400">
            {pdfRecord.filename}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded px-3 py-1 font-mono text-sm text-gray-400 hover:bg-gray-800 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="flex flex-1 flex-col items-center overflow-auto p-4">
          {pdfBlobUrl ? (
            <Document
              file={pdfBlobUrl}
              onLoadSuccess={({ numPages: n }) => {
                setNumPages(n)
                setPdfPage(initialPage ?? 1)
              }}
              className="flex flex-col items-center"
            >
              <Page
                pageNumber={pdfPage}
                renderTextLayer
                renderAnnotationLayer
                className="shadow-xl"
                width={Math.min(window.innerWidth * 0.8, 900)}
              />
            </Document>
          ) : (
            <p className="font-mono text-sm text-gray-400">Loading PDF...</p>
          )}
        </div>

        {numPages ? (
          <div className="flex items-center justify-center gap-4 border-t border-gray-700 px-4 py-3 font-mono text-sm">
            <button
              type="button"
              disabled={pdfPage <= 1}
              onClick={() => setPdfPage((p) => Math.max(1, p - 1))}
              className="rounded px-3 py-1 text-blue-300 hover:bg-gray-800 disabled:text-gray-600"
            >
              Prev
            </button>
            <span className="text-gray-300">
              {pdfPage} / {numPages}
            </span>
            <button
              type="button"
              disabled={pdfPage >= numPages}
              onClick={() => setPdfPage((p) => Math.min(numPages, p + 1))}
              className="rounded px-3 py-1 text-blue-300 hover:bg-gray-800 disabled:text-gray-600"
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
