# SQLite database to manage pdf records (seperate from embeddings/vectors)
# Vectors are stored in Chroma, not this database

import sqlite3
from pathlib import Path
from uuid import uuid4

def get_connection(db_path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    return connection

def initialize_database(db_path: Path) -> None:
    db_path.parent.mkdir(exist_ok=True)

    with get_connection(db_path) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS pdfs (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                filename TEXT NOT NULL,
                file_path TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

        try:
            connection.execute("ALTER TABLE pdfs ADD COLUMN username TEXT NOT NULL DEFAULT ''")
        except sqlite3.OperationalError:
            pass

        
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                hashed_password TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )


        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_history (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                sources TEXT NOT NULL,
                pdf_ids TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

def create_pdf_record(db_path: Path, pdf_id: str, username: str, filename: str, file_path: Path) -> dict[str, str]:
    with get_connection(db_path) as connection:
        connection.execute(
            """
            INSERT INTO pdfs (id, username, filename, file_path)
            VALUES (?, ?, ?, ?)
            """,
            (pdf_id, username, filename, str(file_path)),
        )

    pdf = get_pdf_record(db_path, pdf_id)
    if pdf is None:
        raise RuntimeError("PDF record was not created")

    return pdf


def list_pdf_records(db_path: Path, username: str) -> list[dict[str, str]]:
    with get_connection(db_path) as connection:
        rows = connection.execute(
            """
            SELECT id, username, filename, file_path, created_at
            FROM pdfs
            WHERE username = ?
            ORDER BY created_at DESC
            """,
            (username,),
        ).fetchall()

    return [dict(row) for row in rows]


def get_pdf_record(db_path: Path, pdf_id: str) -> dict[str, str] | None:
    with get_connection(db_path) as connection:
        row = connection.execute(
            """
            SELECT id, username, filename, file_path, created_at
            FROM pdfs
            WHERE id = ?
            """,
            (pdf_id,),
        ).fetchone()

    return dict(row) if row else None


def delete_pdf_record(db_path: Path, pdf_id: str, username: str) -> dict[str, str] | None:
    pdf = get_pdf_record(db_path, pdf_id)
    if pdf is None:
        return None

    if pdf.get("username") != username:
        return None

    with get_connection(db_path) as connection:
        connection.execute("DELETE FROM pdfs WHERE id = ? AND username = ?", (pdf_id, username))

    return pdf


def create_user(db_path: Path, username: str, hashed_password: str) -> dict[str, str]:
    with get_connection(db_path) as connection:
        connection.execute(
            "INSERT INTO users (username, hashed_password) VALUES (?, ?)",
            (username, hashed_password),
        )

    user = get_user_by_username(db_path, username)
    if user is None:
        raise RuntimeError("User was not created")

    return user


def get_user_by_username(db_path: Path, username: str) -> dict[str, str] | None:
    with get_connection(db_path) as connection:
        row = connection.execute(
            "SELECT username, hashed_password, created_at FROM users WHERE username = ?",
            (username,),
        ).fetchone()

    return dict(row) if row else None


def create_chat_history_entry(db_path: Path, username: str, question: str, answer: str, sources: str, pdf_ids: str) -> dict[str, str]:
    chat_id = str(uuid4())

    with get_connection(db_path) as connection:
        connection.execute(
            """
            INSERT INTO chat_history (id, username, question, answer, sources, pdf_ids)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (chat_id, username, question, answer, sources, pdf_ids),
        )

    entry = get_chat_history_entry(db_path, chat_id)

    return entry


def get_chat_history_entry(db_path: Path, entry_id: str) -> dict[str, str] | None:
    with get_connection(db_path) as connection:
        row = connection.execute(
            """
            SELECT id, username, question, answer, sources, pdf_ids, created_at
            FROM chat_history
            WHERE id = ?
            """,
            (entry_id,),
        ).fetchone()

    return dict(row) if row else None


def list_chat_history(db_path: Path, username: str) -> list[dict[str, str]]:
    with get_connection(db_path) as connection:
        rows = connection.execute(
            """
            SELECT id, username, question, answer, sources, pdf_ids, created_at
            FROM chat_history
            WHERE username = ?
            ORDER BY created_at DESC
            """,
            (username,),
        ).fetchall()

    return [dict(row) for row in rows]


def delete_chat_history_entry(db_path: Path, entry_id: str, username: str) -> dict[str, str] | None:
    entry = get_chat_history_entry(db_path, entry_id)
    if entry is None:
        return None

    if entry.get("username") != username:
        return None

    with get_connection(db_path) as connection:
        connection.execute("DELETE FROM chat_history WHERE id = ? AND username = ?", (entry_id, username))

    return entry
