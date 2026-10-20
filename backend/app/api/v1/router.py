"""API v1 router aggregator. Sub-routers (auth, meetings, action_items) mount here."""

from fastapi import APIRouter

from app.api.v1 import auth

api_router = APIRouter()
api_router.include_router(auth.router)
