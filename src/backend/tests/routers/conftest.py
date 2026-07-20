import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from backend.database import get_session
from backend.main import app
from backend.models.player import Player
from backend.models.match import Match


@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    SQLModel.metadata.drop_all(engine)


@pytest.fixture
def test_player(session: Session):
    player = Player(
        username="some_name",
        password="some_password",
        password_confirmation="some_password",
        display_name="Super Cool Player",
        status="online",
    )
    session.add(player)
    session.commit()
    session.refresh(player)
    return player


@pytest.fixture
def test_public_match(session: Session, test_player):
    match = Match(
        lobby_name="some_name",
        max_players=4,
        gamemode="classic",
        visibility="public",
        bot_fill="none",
    )
    match.players.append(test_player)
    session.add(match)
    session.commit()
    session.refresh(match)
    return match


@pytest.fixture
def test_private_match(session: Session, test_player):
    match = Match(
        lobby_name="some_name",
        max_players=4,
        gamemode="classic",
        visibility="private",
        password="some_password",
        bot_fill="none",
    )
    match.players.append(test_player)
    session.add(match)
    session.commit()
    session.refresh(match)
    return match


@pytest.fixture(name="client")
def client_fixture(session: Session):
    def get_session_override():
        return session

    app.dependency_overrides[get_session] = get_session_override

    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()
