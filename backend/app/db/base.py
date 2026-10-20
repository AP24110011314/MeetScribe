"""SQLAlchemy declarative base. Models subclass this in `app.db.models`."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Common base for all ORM models."""

    pass
