"""API v1 router aggregator. Sub-routers (auth, meetings, action_items) mount here."""

from fastapi import APIRouter

api_router = APIRouter()
