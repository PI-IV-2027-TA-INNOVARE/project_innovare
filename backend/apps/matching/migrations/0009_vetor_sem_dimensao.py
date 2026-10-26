"""
`dimensao` sai de `Vetor_Membro` e de `Vetor_Competencia_Necessaria` (3FN).

O tamanho do vetor sai do proprio vetor. Guardado numa coluna a parte, ele
repetia o vetor e podia divergir dele.

A volta recria a coluna e a preenche com o tamanho de cada vetor gravado: a
coluna volta vazia, recebe o tamanho e so entao fica obrigatoria de novo.
"""
from django.db import migrations, models

TABELAS = ('VetorMembro', 'VetorCompetenciaNecessaria')


def preencher_dimensao(apps, schema_editor):
    for nome in TABELAS:
        modelo = apps.get_model('matching', nome)

        for chave, vetor in modelo.objects.values_list('pk', 'vetor'):
            modelo.objects.filter(pk=chave).update(dimensao=len(vetor))


class Migration(migrations.Migration):

    dependencies = [
        ('matching', '0008_vetores_da_afinidade'),
    ]

    operations = [
        migrations.AlterField(
            model_name='vetorcompetencianecessaria',
            name='dimensao',
            field=models.PositiveSmallIntegerField(db_column='dimensao', null=True),
        ),
        migrations.AlterField(
            model_name='vetormembro',
            name='dimensao',
            field=models.PositiveSmallIntegerField(db_column='dimensao', null=True),
        ),
        migrations.RunPython(migrations.RunPython.noop, preencher_dimensao),
        migrations.RemoveField(
            model_name='vetorcompetencianecessaria',
            name='dimensao',
        ),
        migrations.RemoveField(
            model_name='vetormembro',
            name='dimensao',
        ),
    ]
