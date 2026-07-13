from backend.routers import auth, friends, matches, profile, websockets

routers = [
    auth.router,
    friends.router,
    matches.router,
    profile.router,
    websockets.router,
]
