"""
O script do Neon so sabe aplicar SQL.

`sqlmigrate` escreve a operacao `RunPython` como comentario, e o script descarta
comentario: a conversao de dados sumiria em silencio e a migration pararia no
meio, com o banco entre dois estados. Ele precisa recusar antes de escrever.
"""
from django.db.migrations.loader import MigrationLoader
from django.test import SimpleTestCase

from scripts.neon_migrate import convertem_dados_em_python


class ConversaoEmPythonTests(SimpleTestCase):
    def setUp(self):
        self.loader = MigrationLoader(None, ignore_no_migrations=True)

    def test_aponta_a_migration_que_converte_dados(self):
        nos = [
            ('maturity', '0005_rotulos_acentuados'),
            ('competencies', '0003_nivel_importancia'),
            ('matching', '0002_desmembra_equipe_potencial'),
        ]

        self.assertEqual(
            convertem_dados_em_python(self.loader, nos),
            [
                ('competencies', '0003_nivel_importancia'),
                ('matching', '0002_desmembra_equipe_potencial'),
            ],
        )

    def test_migration_so_de_schema_passa(self):
        self.assertEqual(
            convertem_dados_em_python(self.loader, [('maturity', '0005_rotulos_acentuados')]),
            [],
        )
