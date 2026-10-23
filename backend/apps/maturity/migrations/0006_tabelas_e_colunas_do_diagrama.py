"""
Tabelas com inicial maiuscula em cada palavra e colunas com o nome do diagrama.

Caso 5 do relatorio "Diagrama de Classes x Banco de Dados": `executada_em`,
`dimensao`, `nivel`, `avaliacao` e `texto` passam a `data_execucao`,
`nome_dimensao`, `nivel_maturidade`, `observacoes` e `descricao`. Renomear
coluna nao apaga dado e volta atras; o campo do Django continua com o nome de
hoje.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('maturity', '0005_rotulos_acentuados'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='preanalisedimensao',
            name='ck_dimensao_analise_dimensao',
        ),
        migrations.RemoveConstraint(
            model_name='preanalisedimensao',
            name='ck_dimensao_analise_nivel',
        ),
        migrations.AlterField(
            model_name='preanalise',
            name='executada_em',
            field=models.DateTimeField(auto_now_add=True, db_column='data_execucao'),
        ),
        migrations.AlterField(
            model_name='preanalisedimensao',
            name='avaliacao',
            field=models.TextField(db_column='observacoes'),
        ),
        migrations.AlterField(
            model_name='preanalisedimensao',
            name='dimensao',
            field=models.CharField(choices=[('desafio_tecnologico', 'Desafio tecnológico'), ('inovacao', 'Inovação'), ('plano_pesquisa', 'Plano de pesquisa'), ('equipe_supervisao', 'Equipe e supervisão'), ('infraestrutura', 'Infraestrutura'), ('viabilidade', 'Viabilidade')], db_column='nome_dimensao', max_length=24),
        ),
        migrations.AlterField(
            model_name='preanalisedimensao',
            name='nivel',
            field=models.CharField(choices=[('consolidada', 'Consolidada'), ('em_desenvolvimento', 'Em desenvolvimento'), ('fragil', 'Frágil')], db_column='nivel_maturidade', max_length=20),
        ),
        migrations.AlterField(
            model_name='recomendacao',
            name='texto',
            field=models.TextField(db_column='descricao'),
        ),
        migrations.AddConstraint(
            model_name='preanalisedimensao',
            constraint=models.CheckConstraint(condition=models.Q(('dimensao__in', ['desafio_tecnologico', 'inovacao', 'plano_pesquisa', 'equipe_supervisao', 'infraestrutura', 'viabilidade'])), name='ck_dimensao_analise_nome_dimensao'),
        ),
        migrations.AddConstraint(
            model_name='preanalisedimensao',
            constraint=models.CheckConstraint(condition=models.Q(('nivel__in', ['consolidada', 'em_desenvolvimento', 'fragil'])), name='ck_dimensao_analise_nivel_maturidade'),
        ),
        migrations.AlterModelTable(
            name='criteriopreanalise',
            table='Criterio_Referencia_Pipe',
        ),
        migrations.AlterModelTable(
            name='preanalise',
            table='Pre_Analise_Maturidade',
        ),
        migrations.AlterModelTable(
            name='preanalisedimensao',
            table='Dimensao_Analise',
        ),
        migrations.AlterModelTable(
            name='recomendacao',
            table='Recomendacao_Adequacao',
        ),
    ]
