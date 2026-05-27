import { useEffect, useState } from 'react'
import {
  clearToken,
  deleteHistoryEntry,
  deletePdf,
  getHistory,
  getPdfs,
  getUsage,
  getUsernameFromToken,
  streamAskQuestion,
  uploadPdf,
  type ChatHistoryEntry,
  type PdfRecord,
  type Source,
} from '../api'

import ReactMarkdown from 'react-markdown'
import PdfViewer from '../components/PdfViewer'

export default function Dashboard() {
  const [pdfs, setPdfs] = useState<PdfRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [deletingPdfId, setDeletingPdfId] = useState('')
  const [selectedPdfIds, setSelectedPdfIds] = useState<string[]>([])
  const [question, setQuestion] = useState('')
  const [streamingAnswer, setStreamingAnswer] = useState('')
  const [answerSources, setAnswerSources] = useState<Source[]>([])
  const [isAsking, setIsAsking] = useState(false)
  const [error, setError] = useState('')
  const [viewingPdf, setViewingPdf] = useState<PdfRecord | null>(null)
  const [viewingPdfPage, setViewingPdfPage] = useState(1)
  const [history, setHistory] = useState<ChatHistoryEntry[]>([])
  const [deletingHistoryId, setDeletingHistoryId] = useState('')
  const [selectedHistoryId, setSelectedHistoryId] = useState('')
  const [sourceError, setSourceError] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [dragOver, setDragOver] = useState(false)
  const [usage, setUsage] = useState<{ count: number; limit: number } | null>(null)

  useEffect(() => {
    async function loadPdfs() {
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

    async function loadHistory() {
      try {
        const entries = await getHistory()
        setHistory(entries)
      } catch {
        // history is optional
      }
    }

    async function loadUsage() {
      try {
        const result = await getUsage()
        console.log('Usage result:', result)
        setUsage(result)
      } catch (err) {
        console.error('Usage load failed:', err)
      }
    }

    loadPdfs()
    loadHistory()
    loadUsage()
  }, [])

  async function uploadFile(file: File) {
    setError('')
    setIsUploading(true)

    try {
      const result = await uploadPdf(file)
      setPdfs((currentPdfs) => [result.pdf, ...currentPdfs])
      setSelectedPdfIds((currentIds) => [result.pdf.id, ...currentIds])
      getUsage().then(setUsage).catch(() => {})
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

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    await uploadFile(file)
    event.target.value = ''
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault()
    event.stopPropagation()
    setDragOver(true)
  }

  function handleDragLeave(event: React.DragEvent) {
    event.preventDefault()
    event.stopPropagation()
    setDragOver(false)
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault()
    event.stopPropagation()
    setDragOver(false)

    const file = event.dataTransfer.files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf') {
      setError('Only PDF files are accepted.')
      return
    }

    uploadFile(file)
  }

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

  function togglePdfSelection(pdfId: string) {
    setSelectedPdfIds((currentIds) =>
      currentIds.includes(pdfId)
        ? currentIds.filter((id) => id !== pdfId)
        : [...currentIds, pdfId],
    )
  }

  function handleSourceClick(source: Source) {
    setSourceError('')
    const pdf = pdfs.find((p) => p.id === source.pdf_id)
    if (pdf) {
      const page = typeof source.page === 'string' ? parseInt(source.page) || 1 : source.page
      setViewingPdfPage(page)
      setViewingPdf(pdf)
    } else {
      setSourceError(`"${source.filename}" is no longer available for viewing.`)
    }
  }

  function handleHistoryClick(entry: ChatHistoryEntry) {
    setStreamingAnswer(entry.answer)
    setAnswerSources(JSON.parse(entry.sources))
    setQuestion(entry.question)
    setSelectedHistoryId(entry.id)
  }

  async function handleDeleteHistory(entryId: string) {
    setError('')
    setDeletingHistoryId(entryId)
    try {
      await deleteHistoryEntry(entryId)
      setHistory((prev) => prev.filter((h) => h.id !== entryId))
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete history')
    } finally {
      setDeletingHistoryId('')
    }
  }

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
    setSourceError('')
    setStreamingAnswer('')
    setAnswerSources([])
    setSelectedHistoryId('')
    setIsAsking(true)

    try {
      await streamAskQuestion(
        trimmedQuestion,
        selectedPdfIds,
        (token) => setStreamingAnswer((prev) => prev + token),
        (sources) => setAnswerSources(sources),
        () => {
          setIsAsking(false)
          getHistory().then(setHistory).catch(() => {})
      getUsage().then(setUsage).catch(() => {})
        },
      )
    } catch (caughtError) {
      setIsAsking(false)
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Could not answer question',
      )
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`${sidebarOpen ? 'flex' : 'hidden'} fixed md:static inset-y-0 left-0 z-40 w-72 shrink-0 flex-col border-r border-gray-700 bg-gray-900`}>
        <div className="flex flex-col items-center border-b border-gray-700 p-4">
          <img
            src="/PDFInsight.png"
            alt="PDFInsight"
            className="mb-2 h-12 object-contain"
          />
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-gray-400">
              {getUsernameFromToken()}
            </span>
            <button
              type="button"
              onClick={() => { clearToken(); window.location.reload() }}
              className="rounded border border-gray-600 px-2 py-1 font-mono text-xs text-gray-400 hover:bg-gray-800"
            >
              Log out
            </button>
          </div>
        </div>

        {usage ? (
          <div className="border-b border-gray-700 px-4 py-3">
            <div className="flex items-center justify-between font-mono text-xs">
              <span className="text-gray-400">Requests today</span>
              <span className={usage.count > usage.limit * 0.8 ? 'text-yellow-400' : 'text-gray-300'}>
                {usage.count} / {usage.limit}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-700">
              <div
                className={`h-full rounded-full transition-all ${
                  usage.count > usage.limit * 0.8 ? 'bg-yellow-500' : 'bg-blue-500'
                }`}
                style={{ width: `${Math.min((usage.count / usage.limit) * 100, 100)}%` }}
              />
            </div>
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto p-4">
          <h2 className="mb-3 font-mono text-sm font-bold text-blue-400">
            History
          </h2>

          {history.length === 0 ? (
            <p className="font-mono text-xs text-gray-500">No history yet.</p>
          ) : (
            <ul className="space-y-2">
              {history.map((entry) => (
                <li
                  key={entry.id}
                  className={`flex items-start justify-between gap-2 rounded border px-3 py-2 ${
                    selectedHistoryId === entry.id
                      ? 'border-blue-500 bg-blue-950'
                      : 'border-gray-700 bg-gray-900'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleHistoryClick(entry)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate font-mono text-xs text-gray-300 hover:text-white">
                      {entry.question}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] text-gray-600">
                      {new Date(entry.created_at).toLocaleDateString()}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteHistory(entry.id)}
                    disabled={deletingHistoryId === entry.id}
                    className="shrink-0 rounded border border-red-400 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-red-200 hover:bg-red-950 disabled:border-gray-600 disabled:text-gray-500"
                  >
                    {deletingHistoryId === entry.id ? '...' : 'X'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <main className="flex flex-1 flex-col overflow-y-auto p-6">
        <div className="mx-auto w-full max-w-3xl">
          <button
            className="mb-4 rounded border border-gray-600 px-3 py-1 font-mono text-sm text-gray-400 hover:bg-gray-800"
            onClick={() => setSidebarOpen((prev) => !prev)}
          >
            {sidebarOpen ? '✕ Close' : '☰ Menu'}
          </button>

          {error ? (
            <div className="mb-4 rounded border border-red-500 bg-red-950 px-4 py-3 font-mono text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <h1 className="mb-6 font-mono text-2xl md:text-4xl font-bold text-red-200">
            PDFInsight
          </h1>

          <section
            className={`mb-6 rounded bg-gray-800 p-4 ${dragOver ? 'border-2 border-dashed border-blue-400' : 'border-2 border-transparent'}`}
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
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
              <p className="w-full text-right font-mono text-xs text-gray-500">
                or drag &amp; drop
              </p>
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
                        onClick={() => { setViewingPdfPage(1); setViewingPdf(pdf) }}
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

          <section className="mb-4 flex flex-col sm:flex-row gap-2">
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

          {streamingAnswer ? (
            <section className="rounded bg-gray-800 p-4">
              <div className="prose prose-invert max-w-none font-mono text-lg leading-6">
                <ReactMarkdown>{streamingAnswer}</ReactMarkdown>
                {isAsking ? (
                  <span className="ml-0.5 inline-block h-5 w-2 animate-pulse bg-blue-400 align-middle" />
                ) : null}
              </div>

              {answerSources.length > 0 ? (
                <div className="mt-5 border-t border-gray-700 pt-4">
                  <h2 className="mb-3 font-mono text-sm font-bold text-blue-400">
                    Sources
                  </h2>

                  {sourceError ? (
                    <div className="mb-4 rounded border border-red-500 bg-red-950 px-4 py-3 font-mono text-sm text-red-200">
                      {sourceError}
                    </div>
                  ) : null}

                  <ul className="space-y-3">
                    {answerSources.map((source, index) => (
                      <li
                        key={`${source.pdf_id}-${source.page}-${index}`}
                        className="cursor-pointer rounded border border-gray-700 bg-gray-900 p-3 hover:border-blue-500"
                        onClick={() => handleSourceClick(source)}
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
            <PdfViewer
              pdfRecord={viewingPdf}
              initialPage={viewingPdfPage}
              onClose={() => { setViewingPdf(null); setViewingPdfPage(1) }}
            />
          ) : null}
        </div>
      </main>
    </div>
  )
}
