from backend.routers.auth import router as auth_router
from backend.routers.friends import router as friends_router
from backend.routers.matches import router as matches_router
from backend.routers.profile import router as profile_router

routers = [auth_router, friends_router, matches_router, profile_router]
