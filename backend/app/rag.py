from pathlib import Path

from langchain_community.document_loaders import PyPDFLoader
from langchain_community.vectorstores import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from langchain_core.messages import HumanMessage
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_google_genai import ChatGoogleGenerativeAI


COLLECTION_NAME = "pdf_chunks"
EMBEDDING_MODEL = "models/gemini-embedding-001" # change model if needed
CHAT_MODEL = "gemini-3.5-flash"


# get pdf and split into vectors
def load_and_split_pdf(pdf_path: str | Path) -> list[Document]:
    path = Path(pdf_path)

    if not path.exists():
        raise FileNotFoundError(f"PDF not found: {path}")

    loader = PyPDFLoader(str(path))
    documents = loader.load()

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
    )

    return splitter.split_documents(documents)

# retrieve vectors from that pdf using gemini embeddings to convert
def get_vector_store(persist_directory: str | Path) -> Chroma:
    embeddings = GoogleGenerativeAIEmbeddings(model=EMBEDDING_MODEL)
    return Chroma(
        collection_name=COLLECTION_NAME,
        embedding_function=embeddings,
        persist_directory=str(persist_directory),
    )

# uses above functions to load/split pdf, convert to vectors, and store in chroma database
def index_pdf_in_chroma(
    pdf_path: str | Path,
    persist_directory: str | Path,
    pdf_id: str,
    display_filename: str | None = None,) -> int:
    path = Path(pdf_path)
    chunks = load_and_split_pdf(path)

    for chunk in chunks:
        chunk.metadata["pdf_id"] = pdf_id
        chunk.metadata["filename"] = display_filename or path.name

    vector_store = get_vector_store(persist_directory)

    chunk_ids = [f"{pdf_id}-chunk-{index}" for index in range(len(chunks))]
    vector_store.add_documents(chunks, ids=chunk_ids)

    if hasattr(vector_store, "persist"):
        vector_store.persist()

    return len(chunks)

# delete chroma when deleting pdf as well
def delete_pdf_from_chroma(persist_directory: str | Path, pdf_id: str) -> None:
    vector_store = get_vector_store(persist_directory)
    vector_store._collection.delete(where={"pdf_id": pdf_id})

# RAG operation, get context from question
def search_pdf_context(
    question: str,
    persist_directory: str | Path,
    pdf_ids: list[str],
    k: int = 5,) -> list[Document]:
    if not pdf_ids:
        return []

    vector_store = get_vector_store(persist_directory)
    filter_query = {"pdf_id": {"$in": pdf_ids}}

    return vector_store.similarity_search(
        query=question,
        k=k,
        filter=filter_query,
    )

# answer given context from question (non-streamed)
def answer_question_with_context(question: str, context_documents: list[Document]) -> str:
    context = "\n\n".join(
        f"Source: {document.metadata.get('filename', 'unknown')}, "
        f"page {document.metadata.get('page', 'unknown')}\n"
        f"{document.page_content}"
        for document in context_documents
    )

    prompt = f"""
You are a helpful assistant answering questions about uploaded PDFs.
Use only the context below. If the answer is not in the context, say you do not know.

Use proper markdown formatting:
- Use bullet points
- Use spacing between sections
- Bold important move names
- Make the answer readable
- Be concise
- Always format as bullet points with proper line breaks between items. Add another line break if needed for readability.
- Never use long paragraphs for multiple items.
- Format output in clean Markdown. Use blank lines between bullet sections and paragraphs. Do not rely on single line breaks.

Context:
{context}

Question:
{question}
""".strip()

    model = ChatGoogleGenerativeAI(model=CHAT_MODEL)
    response = model.invoke([HumanMessage(content=prompt)])
    message = response.content

    if isinstance(message, list):
        message = " ".join(
            part.get("text", "")
            for part in message
            if isinstance(part, dict)
        )

    return str(message)

# streaming gemini response
# chunks answer as they are generated, rather then send single blob of text
def stream_answer_with_context(question: str, context_documents: list[Document]):
    context = "\n\n".join(
        f"Source: {document.metadata.get('filename', 'unknown')}, "
        f"page {document.metadata.get('page', 'unknown')}\n"
        f"{document.page_content}"
        for document in context_documents
    )

    prompt = f"""
You are a helpful assistant answering questions about uploaded PDFs.
Use only the context below. If the answer is not in the context, say you do not know.

Use proper markdown formatting:
- Use bullet points
- Use spacing between sections
- Bold important move names
- Make the answer readable
- Be concise
- Always format as bullet points with proper line breaks between items. Add another line break if needed for readability.
- Never use long paragraphs for multiple items.
- Format output in clean Markdown. Use blank lines between bullet sections and paragraphs. Do not rely on single line breaks.

Context:
{context}

Question:
{question}
""".strip()

    model = ChatGoogleGenerativeAI(model=CHAT_MODEL)
    # chunnks are sent in
    for chunk in model.stream([HumanMessage(content=prompt)]):
        content = chunk.content
        if isinstance(content, str) and content:
            yield content
        elif isinstance(content, list):
            for part in content:
                if isinstance(part, dict):
                    text = part.get("text", "")
                    if text:
                        yield text
