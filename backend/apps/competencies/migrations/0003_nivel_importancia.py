"""
`essencial: bool` vira `nivel_importancia: enum`, como o diagrama define.

Nao e so renomear: o tipo muda. Por isso a conversao passa por `RunPython` em
vez de dropar a coluna - `essencial=False` significa 'desejavel', e essa
informacao nao se recupera depois que a coluna sai.

A conversao e reversivel nos dois sentidos, porque o dominio so tem dois
valores. Se o diagrama ganhar um terceiro nivel, a volta deixa de ser exata e
esta migration precisa ser revista.
"""
from django.db import migrations, models


def booleano_para_nivel(apps, schema_editor):
    CompetenciaNecessaria = apps.get_model('competencies', 'CompetenciaNecessaria')
    CompetenciaNecessaria.objects.filter(essencial=False).update(
        nivel_importancia='desejavel'
    )


def nivel_para_booleano(apps, schema_editor):
    CompetenciaNecessaria = apps.get_model('competencies', 'CompetenciaNecessaria')
    CompetenciaNecessaria.objects.filter(nivel_importancia='desejavel').update(
        essencial=False
    )


class Migration(migrations.Migration):

    dependencies = [
        ('competencies', '0002_competencia_necessaria_pende_da_proposta'),
    ]

    operations = [
        migrations.AddField(
            model_name='competencianecessaria',
            name='nivel_importancia',
            field=models.CharField(
                choices=[('essencial', 'Essencial'), ('desejavel', 'Desejavel')],
                db_column='nivel_importancia',
                default='essencial',
                max_length=10,
            ),
        ),
        migrations.RunPython(booleano_para_nivel, nivel_para_booleano),
        migrations.RemoveField(
            model_name='competencianecessaria',
            name='essencial',
        ),
    ]
