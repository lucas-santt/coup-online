from backend.engine.player import Player

class TestPlayer:
    def test_init(self) -> None:
        # Testa a inicialização do Player validando atributos diretamente
        player1 = Player(id="ABCXYZ", displayname="João", avatar_url="avatar.png", coins=2)
        
        assert player1.id == "ABCXYZ"
        assert player1.displayname == "João"
        assert player1.avatar_url == "avatar.png"
        assert player1.coins == 2
        assert player1.alive is False
        assert player1.cards == []
        player1.cards = ["Duke", "Duke"]
        assert player1.alive is True
