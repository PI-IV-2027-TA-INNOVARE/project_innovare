"""
Tabelas com inicial maiuscula em cada palavra e colunas com o nome do diagrama.

Caso 5 do relatorio "Diagrama de Classes x Banco de Dados": `experiencia`,
`tipo` e `nivel` passam a `experiencia_profissional`, `categoria` e
`nivel_dominio`. Renomear coluna nao apaga dado e volta atras; o campo do
Django continua com o nome de hoje.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('network', '0005_trava_listas_fixas_no_banco'),
        ('organizations', '0003_tabelas_com_inicial_maiuscula'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='competencia',
            name='ck_competencia_tipo',
        ),
        migrations.RemoveConstraint(
            model_name='competencia',
            name='uq_competencia_nome_tipo',
        ),
        migrations.AlterField(
            model_name='competencia',
            name='tipo',
            field=models.CharField(choices=[('competencia', 'Competencia'), ('tecnica', 'Tecnica'), ('linha_pesquisa', 'Linha de pesquisa')], db_column='categoria', max_length=16),
        ),
        migrations.AlterField(
            model_name='membrocompetencia',
            name='nivel',
            field=models.PositiveSmallIntegerField(blank=True, db_column='nivel_dominio', null=True),
        ),
        migrations.AlterField(
            model_name='membrorede',
            name='experiencia',
            field=models.TextField(blank=True, db_column='experiencia_profissional', default=''),
        ),
        migrations.AddConstraint(
            model_name='competencia',
            constraint=models.CheckConstraint(condition=models.Q(('tipo__in', ['competencia', 'tecnica', 'linha_pesquisa'])), name='ck_competencia_categoria'),
        ),
        migrations.AddConstraint(
            model_name='competencia',
            constraint=models.UniqueConstraint(fields=('nome', 'tipo'), name='uq_competencia_nome_categoria'),
        ),
        migrations.AlterModelTable(
            name='competencia',
            table='Competencia',
        ),
        migrations.AlterModelTable(
            name='formacao',
            table='Formacao',
        ),
        migrations.AlterModelTable(
            name='membrocompetencia',
            table='Competencia_Perfil',
        ),
        migrations.AlterModelTable(
            name='membrorede',
            table='Membro_Rede',
        ),
        migrations.AlterModelTable(
            name='titulacao',
            table='Titulacao',
        ),
    ]
