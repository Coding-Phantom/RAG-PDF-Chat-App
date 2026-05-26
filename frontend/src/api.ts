const API_URL = 'http://127.0.0.1:8000'

// token management via local storage
function getToken(): string | null {
  return localStorage.getItem('token')
}

export function setToken(token: string): void {
  localStorage.setItem('token', token)
}

export function clearToken(): void {
  localStorage.removeItem('token')
}

export function isLoggedIn(): boolean {
  return getToken() !== null
}

export function getUsernameFromToken(): string | null {
  const token = getToken()
  if (!token) return null

  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.sub ?? null
  } catch {
    return null
  }
}

// sets the Authorization header for authenticated requests
async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken()
  const headers = new Headers(options.headers)

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  return fetch(url, { ...options, headers })
}

// TypeScript types
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

export type LoginResponse = {
  access_token: string
  token_type: string
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const message = data?.detail ?? 'Something went wrong'
    throw new Error(message)
  }

  return data as T
}

/* Auth */

export async function register(username: string, password: string): Promise<void> {
  const response = await fetch(`${API_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  await parseResponse<Record<string, string>>(response)
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  return parseResponse<LoginResponse>(response)
}

/* PDFs */

export async function getPdfs(): Promise<PdfRecord[]> {
  const response = await authFetch(`${API_URL}/pdfs`)
  return parseResponse<PdfRecord[]>(response)
}

export async function uploadPdf(file: File): Promise<UploadPdfResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await authFetch(`${API_URL}/pdfs`, {
    method: 'POST',
    body: formData,
  })

  return parseResponse<UploadPdfResponse>(response)
}

export async function deletePdf(pdfId: string): Promise<void> {
  const response = await authFetch(`${API_URL}/pdfs/${pdfId}`, {
    method: 'DELETE',
  })

  await parseResponse<{ status: string; pdf_id: string }>(response)
}

export async function fetchPdfBlobUrl(pdfId: string): Promise<string> {
  const response = await authFetch(`${API_URL}/pdfs/${pdfId}/file`)

  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.detail ?? 'Failed to fetch PDF')
  }

  const blob = await response.blob()
  return URL.createObjectURL(blob)
}

export async function askQuestion(
  question: string,
  pdfIds: string[],
): Promise<AskResponse> {
  const response = await authFetch(`${API_URL}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, pdf_ids: pdfIds }),
  })

  return parseResponse<AskResponse>(response)
}
