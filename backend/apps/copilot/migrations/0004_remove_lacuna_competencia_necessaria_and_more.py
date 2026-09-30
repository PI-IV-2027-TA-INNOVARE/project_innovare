"""
A lacuna de competencia sai de `lacuna_proposta`.

Dos tres usos de "lacuna" do glossario, o de competencia e o unico que nao e da
proposta: e da equipe gerada, e o diagrama do Arquiteto lhe da tabela propria
(`matching.LacunaCompetenciaEquipe`). Aqui saem a FK e o valor do enum.

Nao ha conversao automatica possivel: a tabela nova pendura em `EquipePotencial`
e a linha antiga nao tem equipe nenhuma para apontar - ela nasceu quando a
lacuna era da oportunidade. A guarda no topo recusa a execucao se houver linha
desse tipo, porque sem ela a linha sobrevive com um `tipo` que nao mapeia mais
para rotulo algum: presente no banco, invisivel para todo filtro por
`TipoLacuna`. O matching regera essas lacunas na forma nova.
"""
from django.db import migrations, models

from core.migracoes import exigir_tabela_vazia


class Migration(migrations.Migration):

    dependencies = [
        ('copilot', '0003_alter_lacuna_table'),
    ]

    operations = [
        migrations.RunPython(
            exigir_tabela_vazia(
                'copilot',
                'Lacuna',
                'converte lacuna de competencia em LacunaCompetenciaEquipe, '
                'que exige uma equipe gerada para apontar',
                filtro={'tipo': 'competencia'},
            ),
            migrations.RunPython.noop,
        ),
        migrations.RemoveField(
            model_name='lacuna',
            name='competencia_necessaria',
        ),
        migrations.AlterField(
            model_name='lacuna',
            name='tipo',
            field=models.CharField(choices=[('proposta', 'Lacuna da proposta'), ('pre_analise', 'Lacuna da pre-analise')], db_column='tipo', max_length=12),
        ),
    ]
