import { useEffect, useState } from 'react'
import {
  askQuestion,
  deletePdf,
  getPdfFileUrl,
  getPdfs,
  uploadPdf,
  type AskResponse,
  type PdfRecord,
} from './api'

import ReactMarkdown from 'react-markdown'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'

import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

// state for pdfs, loading, uploading, deleting, selection, question, result, asking, error
function App() {
  const [pdfs, setPdfs] = useState<PdfRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [deletingPdfId, setDeletingPdfId] = useState('')
  const [selectedPdfIds, setSelectedPdfIds] = useState<string[]>([])
  const [question, setQuestion] = useState('')
  const [askResult, setAskResult] = useState<AskResponse | null>(null)
  const [isAsking, setIsAsking] = useState(false)
  const [error, setError] = useState('')
  const [viewingPdf, setViewingPdf] = useState<PdfRecord | null>(null)
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pdfPage, setPdfPage] = useState(1)

  useEffect(() => {
    async function loadPdfs() { // load pdfs from API
      try {
        const pdfList = await getPdfs()
        setPdfs(pdfList)
        setSelectedPdfIds(pdfList.map((pdf) => pdf.id))
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : 'Could not load PDFs',
        )
      } finally {
        setIsLoading(false)
      }
    }

    loadPdfs()
  }, [])


  // upload pdf
  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setError('')
    setIsUploading(true)

    try {
      const result = await uploadPdf(file)
      setPdfs((currentPdfs) => [result.pdf, ...currentPdfs])
      setSelectedPdfIds((currentIds) => [result.pdf.id, ...currentIds])
      event.target.value = ''
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Could not upload PDF',
      )
    } finally {
      setIsUploading(false)
    }
  }

  // delete pdf
  async function handleDelete(pdfId: string) {
    setError('')
    setDeletingPdfId(pdfId)

    try {
      await deletePdf(pdfId)
      setPdfs((currentPdfs) => currentPdfs.filter((pdf) => pdf.id !== pdfId))
      setSelectedPdfIds((currentIds) => currentIds.filter((id) => id !== pdfId))
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Could not delete PDF',
      )
    } finally {
      setDeletingPdfId('')
    }
  }


  // set checkbox selection for pdfs, toggle on/off for context
  function togglePdfSelection(pdfId: string) {
    setSelectedPdfIds((currentIds) =>
      currentIds.includes(pdfId)
        ? currentIds.filter((id) => id !== pdfId)
        : [...currentIds, pdfId],
    )
  }

  // question ask (handle other cases if needed)
  async function handleAsk() {
    const trimmedQuestion = question.trim()
    if (!trimmedQuestion) {
      setError('Please enter a question.')
      return
    }

    if (selectedPdfIds.length === 0) {
      setError('Please select at least one PDF.')
      return
    }

    setError('')
    setAskResult(null)
    setIsAsking(true)

    try {
      const result = await askQuestion(trimmedQuestion, selectedPdfIds)
      setAskResult(result)
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Could not answer question',
      )
    } finally {
      setIsAsking(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-900 p-6 text-white">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="mb-6 text-center font-mono text-4xl font-bold text-red-200">
          PDFInsight
        </h1>

        {error ? (
          <div className="mb-4 rounded border border-red-500 bg-red-950 px-4 py-3 font-mono text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <section className="mb-6 rounded bg-gray-800 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-mono text-lg font-bold text-blue-400">
              Loaded PDFs
            </h2>

            <span className="font-mono text-xs text-gray-400">
              {selectedPdfIds.length} selected
            </span>

            <label className="cursor-pointer rounded bg-blue-600 px-4 py-2 font-mono text-sm font-semibold text-white hover:bg-blue-700">
              {isUploading ? 'Uploading...' : 'Upload PDF'}
              <input
                type="file"
                accept="application/pdf"
                onChange={handleUpload}
                disabled={isUploading}
                className="sr-only"
              />
            </label>
          </div>

          {isLoading ? (
            <p className="font-mono text-sm text-gray-400">Loading PDFs...</p>
          ) : null}


          {!isLoading && pdfs.length === 0 ? (
            <p className="font-mono text-sm text-gray-400">No PDFs found.</p>
          ) : null}

          {!isLoading && pdfs.length > 0 ? (
            <ul className="space-y-2">
              {pdfs.map((pdf) => (
                <li
                  key={pdf.id}
                  className="flex items-center justify-between gap-4 rounded border border-gray-700 bg-gray-900 px-3 py-2 font-mono text-sm"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedPdfIds.includes(pdf.id)}
                      onChange={() => togglePdfSelection(pdf.id)}
                      className="h-4 w-4 shrink-0 accent-blue-500"
                    />

                    <div className="min-w-0">
                      <p className="truncate text-gray-100">{pdf.filename}</p>
                      <p className="mt-1 truncate text-xs text-gray-500">
                        ID: {pdf.id}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => setViewingPdf(pdf)}
                      className="rounded border border-blue-500 px-3 py-1.5 text-xs font-semibold text-blue-300 hover:bg-blue-950"
                    >
                      View
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(pdf.id)}
                      disabled={deletingPdfId === pdf.id}
                      className="rounded border border-red-400 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-950 disabled:cursor-not-allowed disabled:border-gray-600 disabled:text-gray-500"
                    >
                      {deletingPdfId === pdf.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="mb-4 flex gap-2">
          <input
            className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-800 p-3 font-mono text-base text-white outline-none placeholder:text-gray-500 focus:border-blue-500"
            type="text"
            placeholder="Ask something..."
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />

          <button
            type="button"
            onClick={handleAsk}
            disabled={isAsking}
            className="rounded bg-blue-600 px-5 py-3 font-mono text-base font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
          >
            {isAsking ? 'Asking...' : 'Ask'}
          </button>
        </section>

        {isAsking ? (
          <p className="mb-4 font-mono text-sm text-gray-400">Thinking...</p>
        ) : null}

        {askResult ? (
          <section className="rounded bg-gray-800 p-4">
            <div className="prose prose-invert max-w-none font-mono text-lg leading-6">
              <ReactMarkdown>{askResult.answer}</ReactMarkdown>
            </div>

            {askResult.sources.length > 0 ? (
              <div className="mt-5 border-t border-gray-700 pt-4">
                <h2 className="mb-3 font-mono text-sm font-bold text-blue-400">
                  Sources
                </h2>

                <ul className="space-y-3">
                  {askResult.sources.map((source, index) => (
                    <li
                      key={`${source.pdf_id}-${source.page}-${index}`}
                      className="rounded border border-gray-700 bg-gray-900 p-3"
                    >
                      <p className="font-mono text-xs font-bold text-gray-200">
                        {source.filename} · page {source.page}
                      </p>
                      <p className="mt-2 max-h-16 overflow-hidden font-mono text-xs leading-5 text-gray-400">
                        {source.snippet}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}
        {viewingPdf ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="flex h-full w-full max-w-5xl flex-col rounded bg-gray-900">
              <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
                <h2 className="truncate font-mono text-sm font-bold text-blue-400">
                  {viewingPdf.filename}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setViewingPdf(null)
                    setNumPages(null)
                    setPdfPage(1)
                  }}
                  className="rounded px-3 py-1 font-mono text-sm text-gray-400 hover:bg-gray-800 hover:text-white"
                >
                  Close
                </button>
              </div>
              <div className="flex flex-1 flex-col items-center overflow-auto p-4">
                <Document
                  file={getPdfFileUrl(viewingPdf.id)}
                  onLoadSuccess={({ numPages: n }) => {
                    setNumPages(n)
                    setPdfPage(1)
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
        ) : null}
      </div>
    </main>
  )
}

export default App
