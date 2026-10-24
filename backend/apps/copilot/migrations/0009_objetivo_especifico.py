"""
Os objetivos especificos saem da lista JSON e viram uma linha cada (caso 6).

A lista dentro da proposta feria a 1FN: um atributo com varios valores, que o
Supervisor edita item a item. `Objetivo_Especifico` guarda um por linha, com a
ordem em que aparecem.

A conversao e de ida e volta: na ida cada item da lista vira uma linha, na
ordem da lista; na volta as linhas voltam a ser a lista, na mesma ordem.
"""
import django.db.models.deletion
from django.db import migrations, models


def lista_para_linhas(apps, schema_editor):
    PropostaEstruturada = apps.get_model('copilot', 'PropostaEstruturada')
    ObjetivoEspecifico = apps.get_model('copilot', 'ObjetivoEspecifico')

    linhas = [
        ObjetivoEspecifico(proposta=proposta, ordem=ordem, descricao=str(item))
        for proposta in PropostaEstruturada.objects.all()
        for ordem, item in enumerate(proposta.objetivos_especificos or [], start=1)
    ]
    ObjetivoEspecifico.objects.bulk_create(linhas)


def linhas_para_lista(apps, schema_editor):
    PropostaEstruturada = apps.get_model('copilot', 'PropostaEstruturada')
    ObjetivoEspecifico = apps.get_model('copilot', 'ObjetivoEspecifico')

    for proposta in PropostaEstruturada.objects.all():
        proposta.objetivos_especificos = list(
            ObjetivoEspecifico.objects.filter(proposta=proposta)
            .order_by('ordem')
            .values_list('descricao', flat=True)
        )
        proposta.save(update_fields=['objetivos_especificos'])


class Migration(migrations.Migration):

    dependencies = [
        ('copilot', '0008_tabelas_e_colunas_do_diagrama'),
    ]

    operations = [
        migrations.CreateModel(
            name='ObjetivoEspecifico',
            fields=[
                ('id_objetivo', models.BigAutoField(db_column='id_objetivo', primary_key=True, serialize=False)),
                ('ordem', models.PositiveSmallIntegerField(db_column='ordem')),
                ('descricao', models.TextField(db_column='descricao')),
                ('proposta', models.ForeignKey(db_column='id_proposta', on_delete=django.db.models.deletion.CASCADE, related_name='objetivos', to='copilot.propostaestruturada')),
            ],
            options={
                'verbose_name': 'objetivo especifico',
                'verbose_name_plural': 'objetivos especificos',
                'db_table': 'Objetivo_Especifico',
                'ordering': ['ordem'],
                'constraints': [models.UniqueConstraint(fields=('proposta', 'ordem'), name='uq_objetivo_proposta_ordem')],
            },
        ),
        migrations.RunPython(lista_para_linhas, linhas_para_lista),
        migrations.RemoveField(
            model_name='propostaestruturada',
            name='objetivos_especificos',
        ),
    ]
