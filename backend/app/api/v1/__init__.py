from fastapi import APIRouter

from app.api.v1.account import router as account_router
from app.api.v1.action_items import router as action_items_router
from app.api.v1.ai import ai_router
from app.api.v1.auth import router as auth_router
from app.api.v1.dev_storage import router as dev_storage_router
from app.api.v1.folders import router as folders_router
from app.api.v1.meetings import router as meetings_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.share import router as share_router
from app.api.v1.tags import router as tags_router
from app.api.v1.trash import router as trash_router
from app.api.v1.webhooks import router as webhooks_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router)
api_router.include_router(meetings_router)
api_router.include_router(folders_router)
api_router.include_router(tags_router)
api_router.include_router(trash_router)
api_router.include_router(action_items_router)
api_router.include_router(dev_storage_router)
api_router.include_router(ai_router)
api_router.include_router(share_router)
api_router.include_router(webhooks_router)
api_router.include_router(notifications_router)
api_router.include_router(account_router)
