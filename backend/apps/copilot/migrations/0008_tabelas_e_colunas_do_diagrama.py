"""
Tabelas com inicial maiuscula em cada palavra e colunas com o nome do diagrama.

Caso 5 do relatorio "Diagrama de Classes x Banco de Dados":
`problema_pesquisa`, `caracterizacao_inovacao` e `infraestrutura_recursos`
passam a `problema`, `inovacao` e `infraestrutura`. Renomear coluna nao apaga
dado e volta atras; o campo do Django continua com o nome de hoje.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('copilot', '0007_trava_listas_fixas_no_banco'),
    ]

    operations = [
        migrations.AlterField(
            model_name='propostaestruturada',
            name='caracterizacao_inovacao',
            field=models.TextField(blank=True, db_column='inovacao', default=''),
        ),
        migrations.AlterField(
            model_name='propostaestruturada',
            name='infraestrutura_recursos',
            field=models.TextField(blank=True, db_column='infraestrutura', default=''),
        ),
        migrations.AlterField(
            model_name='propostaestruturada',
            name='problema_pesquisa',
            field=models.TextField(blank=True, db_column='problema', default=''),
        ),
        migrations.AlterModelTable(
            name='lacuna',
            table='Lacuna_Proposta',
        ),
        migrations.AlterModelTable(
            name='mensagemcopiloto',
            table='Mensagem_Copiloto',
        ),
        migrations.AlterModelTable(
            name='propostaestruturada',
            table='Proposta_Estruturada',
        ),
        migrations.AlterModelTable(
            name='sessaocopiloto',
            table='Sessao_Copiloto',
        ),
    ]
