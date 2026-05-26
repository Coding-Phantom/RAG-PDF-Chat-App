const API_URL = 'http://127.0.0.1:8000'


// TypeScript types = python pydantic models to use for json parsing
export type PdfRecord = {
  id: string
  filename: string
  file_path: string
  created_at: string
}

export type UploadPdfResponse = {
  pdf: PdfRecord
  chunks_indexed: number
}

export type Source = {
  pdf_id: string
  filename: string
  page: number | string
  snippet: string
}

export type AskResponse = {
  answer: string
  sources: Source[]
}

// parse response from backend
async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const message = data?.detail ?? 'Something went wrong'
    throw new Error(message)
  }

  return data as T
}

/* API functions */

export async function getPdfs(): Promise<PdfRecord[]> {
  const response = await fetch(`${API_URL}/pdfs`)
  return parseResponse<PdfRecord[]>(response)
}

// upload pdf, Promise waits for file
export async function uploadPdf(file: File): Promise<UploadPdfResponse> {
  const formData = new FormData() // file prompt
  formData.append('file', file)

  const response = await fetch(`${API_URL}/pdfs`, {
    method: 'POST',
    body: formData,
  })

  return parseResponse<UploadPdfResponse>(response)
}

// delete pdf by id
export async function deletePdf(pdfId: string): Promise<void> {
  const response = await fetch(`${API_URL}/pdfs/${pdfId}`, {
    method: 'DELETE',
  })

  await parseResponse<{ status: string; pdf_id: string }>(response)
}

// get pdf file url for viewing
export function getPdfFileUrl(pdfId: string): string {
  return `${API_URL}/pdfs/${pdfId}/file`
}

// ask question
export async function askQuestion(
  question: string,
  pdfIds: string[],
): Promise<AskResponse> {
  const response = await fetch(`${API_URL}/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      question,
      pdf_ids: pdfIds,
    }),
  })

  return parseResponse<AskResponse>(response)
}
