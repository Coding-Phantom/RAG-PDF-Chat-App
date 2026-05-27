import json
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from langchain_google_genai import ChatGoogleGenerativeAI
import uvicorn

# database imports
from db import create_chat_history_entry
from db import create_pdf_record
from db import create_user
from db import delete_chat_history_entry
from db import delete_pdf_record
from db import get_pdf_record
from db import get_user_by_username
from db import initialize_database
from db import list_chat_history
from db import list_pdf_records

# auth imports
from auth import create_access_token
from auth import get_current_user_dependency
from auth import hash_password
from auth import verify_password

# rag imports
from rag import delete_pdf_from_chroma
from rag import EMBEDDING_MODEL
from rag import index_pdf_in_chroma
from rag import search_pdf_context
from rag import stream_answer_with_context


# generalizing backend path
BACKEND_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BACKEND_DIR / "uploads"
CHROMA_DIR = BACKEND_DIR / "chroma_db"
DATA_DIR = BACKEND_DIR / "data"
DB_PATH = DATA_DIR / "app.db"

load_dotenv(BACKEND_DIR / ".env") # load api / secrets
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

# auth models
class RegisterRequest(BaseModel):
    username: str
    password: str

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

# chat history model
class ChatHistoryEntryModel(BaseModel):
    id: str
    question: str
    answer: str
    sources: str
    pdf_ids: str
    created_at: str

def normalize_model_message(message: object) -> str:
    if isinstance(message, list):
        return " ".join(
            part.get("text", "")
            for part in message
            if isinstance(part, dict)
        )

    return str(message)

# checks if user is authenticated with jwt, most endpoints will have this
get_current_user = get_current_user_dependency(DB_PATH)

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/register")
def register(body: RegisterRequest) -> dict[str, str]:

    # user inputs username and password
    username = body.username.strip()
    password = body.password.strip()
    # in frontend, add additional password confirmation

    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password are required")

    # no dupe usernames
    if get_user_by_username(DB_PATH, username) is not None:
        raise HTTPException(status_code=400, detail="Username already taken")

    # hash password and create user to database
    hashed = hash_password(password)
    create_user(DB_PATH, username, hashed)
    return {"status": "created", "username": username}


@app.post("/login", response_model=TokenResponse)
def login(body: LoginRequest) -> TokenResponse:

    # user inputs username and password, check if in db
    username = body.username.strip()
    password = body.password.strip()
    user = get_user_by_username(DB_PATH, username)
    if user is None or not verify_password(password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    # create token for login, will be used in most endpoints to check authentication
    token = create_access_token(data={"sub": username})
    return TokenResponse(access_token=token)


# obtain pdf list from database to show whats available in frontend
@app.get("/pdfs", response_model=list[PDFRecord])
def list_pdfs(current_user: dict[str, str] = Depends(get_current_user)) -> list[dict[str, str]]:
    return list_pdf_records(DB_PATH, current_user["username"])

# upload pdfs
@app.post("/pdfs", response_model=UploadPdfResponse)
async def upload_pdf(
    file: UploadFile,
    current_user: dict[str, str] = Depends(get_current_user),
) -> UploadPdfResponse: # UploadFile allows FastAPI to show file upload in docs
    if not file.filename or not file.filename.lower().endswith(".pdf"): # .pdf check
        raise HTTPException(status_code=400, detail="Please upload a PDF file")
    
    if file.size is None:
        raise HTTPException(status_code=400, detail="Could not determine file size")

    if file.size > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 50MB limit")

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
            username=current_user["username"],
            filename=safe_filename,
            file_path=stored_filename,
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
def delete_pdf(
    pdf_id: str,
    current_user: dict[str, str] = Depends(get_current_user),
) -> dict[str, str]:

    pdf = delete_pdf_record(DB_PATH, pdf_id, current_user["username"])
    if pdf is None: # check if pdf exists
        raise HTTPException(status_code=404, detail="PDF not found")

    delete_pdf_from_chroma(CHROMA_DIR, pdf_id) # delete from chroma

    pdf_path = UPLOAD_DIR / Path(pdf["file_path"]) # delete from uploads
    if pdf_path.exists():
        pdf_path.unlink()

    return {"status": "deleted", "pdf_id": pdf_id} # return id + deleted pdf


# serve pdf file for viewing
@app.get("/pdfs/{pdf_id}/file")
def view_pdf_file(
    pdf_id: str,
    current_user: dict[str, str] = Depends(get_current_user),
) -> FileResponse:
    pdf = get_pdf_record(DB_PATH, pdf_id)
    if pdf is None or pdf.get("username") != current_user["username"]:
        raise HTTPException(status_code=404, detail="PDF not found")

    pdf_path = UPLOAD_DIR / Path(pdf["file_path"])
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF file not found on disk")

    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=pdf["filename"],
        headers={"Content-Disposition": f'inline; filename="{pdf["filename"]}"'},
    )


# list chat history for current user
@app.get("/history", response_model=list[ChatHistoryEntryModel])
def get_chat_history(current_user: dict[str, str] = Depends(get_current_user)) -> list[dict[str, str]]:
    return list_chat_history(DB_PATH, current_user["username"])


# delete chat history entry
@app.delete("/history/{entry_id}")
def delete_chat_history(
    entry_id: str,
    current_user: dict[str, str] = Depends(get_current_user),
) -> dict[str, str]:
    result = delete_chat_history_entry(DB_PATH, entry_id, current_user["username"])
    if result is None:
        raise HTTPException(status_code=404, detail="History entry not found")

    return {"status": "deleted", "entry_id": entry_id}


# Gemini Ask Question API (non streamed)
@app.post("/ask", response_model=AskResponse)
def ask_question(
    request: AskRequest,
    current_user: dict[str, str] = Depends(get_current_user),
) -> AskResponse: # AskRequest contains question + list of pdfs (single or many)
    question = request.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required")

    if not request.pdf_ids:
        raise HTTPException(status_code=400, detail="Select at least one PDF")

    user_pdfs = list_pdf_records(DB_PATH, current_user["username"])
    valid_ids = {p["id"] for p in user_pdfs}
    for pid in request.pdf_ids:
        if pid not in valid_ids:
            raise HTTPException(status_code=404, detail=f"PDF {pid} not found")

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


# Streaming Response to chunks from Gemini Ask Question
@app.post("/ask/stream")
def ask_question_stream(
    request: AskRequest,
    current_user: dict[str, str] = Depends(get_current_user),) -> StreamingResponse:

    # Get question for search context for based on PDF
    question = request.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required")

    if not request.pdf_ids:
        raise HTTPException(status_code=400, detail="Select at least one PDF")

    user_pdfs = list_pdf_records(DB_PATH, current_user["username"])
    valid_ids = {p["id"] for p in user_pdfs}
    for pid in request.pdf_ids:
        if pid not in valid_ids:
            raise HTTPException(status_code=404, detail=f"PDF {pid} not found")

    context_documents = search_pdf_context(
        question=question,
        persist_directory=CHROMA_DIR,
        pdf_ids=request.pdf_ids,
    )

    if not context_documents:
        raise HTTPException(status_code=404, detail="No matching context found")

    def generate():
        full_answer = []

        for token in stream_answer_with_context(question, context_documents):
            full_answer.append(token)
            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

        sources = [
            {
                "pdf_id": str(document.metadata.get("pdf_id", "")),
                "filename": str(document.metadata.get("filename", "")),
                "page": document.metadata.get("page", "unknown"),
                "snippet": document.page_content[:300],
            }
            for document in context_documents
        ]
        yield f"data: {json.dumps({'type': 'sources', 'content': sources})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

        create_chat_history_entry(
            DB_PATH,
            current_user["username"],
            question,
            "".join(full_answer),
            json.dumps(sources),
            json.dumps(request.pdf_ids),
        )

    return StreamingResponse(generate(), media_type="text/event-stream")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
