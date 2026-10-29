from fastapi import APIRouter

from app.api.v1.action_items import router as action_items_router
from app.api.v1.auth import router as auth_router
from app.api.v1.dev_storage import router as dev_storage_router
from app.api.v1.meetings import router as meetings_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router)
api_router.include_router(meetings_router)
api_router.include_router(action_items_router)
api_router.include_router(dev_storage_router)
