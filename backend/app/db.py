# SQLite database to manage pdf records (seperate from embeddings/vectors)
# Vectors are stored in Chroma, not this database

import sqlite3
from pathlib import Path

# Initialize db connection
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

        
        connection.execute( # create table for users/accounts
            """
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                hashed_password TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

# add new pdf records into db, return as dict to confirm result
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

# list pdf records for a specific user
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

# retrieve pdf record from id, return as dict to confirm result
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

# delete pdf record by id, only if owned by the given user
def delete_pdf_record(db_path: Path, pdf_id: str, username: str) -> dict[str, str] | None:
    pdf = get_pdf_record(db_path, pdf_id)
    if pdf is None:
        return None

    if pdf.get("username") != username:
        return None

    with get_connection(db_path) as connection:
        connection.execute("DELETE FROM pdfs WHERE id = ? AND username = ?", (pdf_id, username))

    return pdf


# create a new user, return the user dict
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


# look up a user by username, return None if not found
def get_user_by_username(db_path: Path, username: str) -> dict[str, str] | None:
    with get_connection(db_path) as connection:
        row = connection.execute(
            "SELECT username, hashed_password, created_at FROM users WHERE username = ?",
            (username,),
        ).fetchone()

    return dict(row) if row else None
