from pathlib import Path
from uuid import uuid4 # uuid for identifying pdfs

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from langchain_google_genai import ChatGoogleGenerativeAI
import uvicorn

# database imports
from db import create_pdf_record
from db import delete_pdf_record
from db import get_pdf_record
from db import initialize_database
from db import list_pdf_records

# rag imports
from rag import answer_question_with_context
from rag import delete_pdf_from_chroma
from rag import EMBEDDING_MODEL
from rag import index_pdf_in_chroma
from rag import search_pdf_context


# generalizing backend path
BACKEND_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BACKEND_DIR / "uploads"
CHROMA_DIR = BACKEND_DIR / "chroma_db"
DATA_DIR = BACKEND_DIR / "data"
DB_PATH = DATA_DIR / "app.db"

load_dotenv(BACKEND_DIR / ".env") # load api
initialize_database(DB_PATH) # load database

app = FastAPI(title="PDF RAG API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# pydantic model for pdf record
class PDFRecord(BaseModel):
    id: str
    filename: str
    file_path: str
    created_at: str

# model for pdf name and chunks indexed
class UploadPdfResponse(BaseModel):
    pdf: PDFRecord
    chunks_indexed: int

# ask question based on list of pdfs (can check/uncheck pdfs to add to context)
class AskRequest(BaseModel):
    question: str
    pdf_ids: list[str]

# contains pdf text
class Source(BaseModel):
    pdf_id: str
    filename: str
    page: int | str
    snippet: str

# response from AI mode with answer and context from checked pdfs
class AskResponse(BaseModel):
    answer: str
    sources: list[Source]

# make all text into string for consistency
def normalize_model_message(message: object) -> str:
    if isinstance(message, list):
        return " ".join(
            part.get("text", "")
            for part in message
            if isinstance(part, dict)
        )

    return str(message)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}



# obtain pdf list from database to show whats available in frontend
@app.get("/pdfs", response_model=list[PDFRecord])
def list_pdfs() -> list[dict[str, str]]:
    return list_pdf_records(DB_PATH)

# upload pdfs
@app.post("/pdfs", response_model=UploadPdfResponse)
async def upload_pdf(file: UploadFile) -> UploadPdfResponse: # UploadFile allows FastAPI to show file upload in docs
    if not file.filename or not file.filename.lower().endswith(".pdf"): # .pdf check
        raise HTTPException(status_code=400, detail="Please upload a PDF file")

    # file sucessfully uploaded
    pdf_id = str(uuid4()) # random id
    safe_filename = Path(file.filename).name # real file name
    stored_filename = f"{pdf_id}.pdf" # file name but as uuid for uniqueness

     # upload file directory
    UPLOAD_DIR.mkdir(exist_ok=True)
    pdf_path = UPLOAD_DIR / stored_filename

    # write bytes to file path
    with pdf_path.open("wb") as saved_file:
        saved_file.write(await file.read())

    try:
        # add vectors into chroma database
        chunks_indexed = index_pdf_in_chroma(
            pdf_path=pdf_path,
            persist_directory=CHROMA_DIR,
            pdf_id=pdf_id,
            display_filename=safe_filename,
        )

        # add pdf into sqlite database after indexing succeeds
        pdf = create_pdf_record(
            db_path=DB_PATH,
            pdf_id=pdf_id,
            filename=safe_filename,
            file_path=pdf_path,
        )
    except Exception as error:
        if pdf_path.exists():
            pdf_path.unlink()

        try:
            delete_pdf_from_chroma(CHROMA_DIR, pdf_id)
        except Exception:
            pass

        raise HTTPException(
            status_code=500,
            detail=f"PDF upload failed while indexing: {error}",
        ) from error

    # return json response with pdf record and chunk number
    return UploadPdfResponse(
        pdf=PDFRecord(**pdf),
        chunks_indexed=chunks_indexed,
    )


# uses id to delete pdf record from sqllite chroma, and local uploads
@app.delete("/pdfs/{pdf_id}")
def delete_pdf(pdf_id: str) -> dict[str, str]:

    pdf = delete_pdf_record(DB_PATH, pdf_id)
    if pdf is None: # check if pdf exists
        raise HTTPException(status_code=404, detail="PDF not found")

    delete_pdf_from_chroma(CHROMA_DIR, pdf_id) # delete from chroma

    pdf_path = Path(pdf["file_path"]) # delete from uploads
    if pdf_path.exists():
        pdf_path.unlink()

    return {"status": "deleted", "pdf_id": pdf_id} # return id + deleted pdf


# serve pdf file for viewing
@app.get("/pdfs/{pdf_id}/file")
def view_pdf_file(pdf_id: str) -> FileResponse:
    pdf = get_pdf_record(DB_PATH, pdf_id)
    if pdf is None:
        raise HTTPException(status_code=404, detail="PDF not found")

    pdf_path = Path(pdf["file_path"])
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF file not found on disk")

    # allows for pdf viewing in browser without download
    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=pdf["filename"],
        headers={"Content-Disposition": f'inline; filename="{pdf["filename"]}"'},
    )


# Gemini Ask Question API
@app.post("/ask", response_model=AskResponse)
def ask_question(request: AskRequest) -> AskResponse: # AskRequest contains question + list of pdfs (single or many)
    question = request.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required")

    if not request.pdf_ids:
        raise HTTPException(status_code=400, detail="Select at least one PDF")

    context_documents = search_pdf_context(
        question=question,
        persist_directory=CHROMA_DIR,
        pdf_ids=request.pdf_ids,
    )

    if not context_documents:
        raise HTTPException(status_code=404, detail="No matching context found")

    answer = answer_question_with_context(question, context_documents)
    sources = [
        Source(
            pdf_id=str(document.metadata.get("pdf_id", "")),
            filename=str(document.metadata.get("filename", "")),
            page=document.metadata.get("page", "unknown"),
            snippet=document.page_content[:300],
        )
        for document in context_documents
    ]

    return AskResponse(answer=answer, sources=sources)


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
