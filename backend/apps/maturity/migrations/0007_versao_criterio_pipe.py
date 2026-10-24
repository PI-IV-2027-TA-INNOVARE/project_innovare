"""
A versao dos criterios PIPE ganha tabela propria (caso 14 e desvio 1 da 3FN).

`vigente_de` e `vigente_ate` dependiam da versao, nao do criterio, e se
repetiam nas 23 linhas de cada versao. E a pre-analise citava a versao pelo
rotulo em texto, sem chave: nada impedia citar uma versao que nao existe.
Agora `Versao_Criterio_Pipe` guarda rotulo, baseline e vigencia; criterio e
pre-analise apontam para ela.

A conversao e de ida e volta. Na ida, cada rotulo vira uma versao: a vigencia
sai dos criterios dela, e a de um rotulo que so a pre-analise cita sai das
datas das analises. O `baseline` sai do ultimo evento de importacao daquela
versao, quando houver. Na volta, rotulo e vigencia voltam para cada linha.
"""
import django.db.models.deletion
from django.db import migrations, models
from django.db.models import Max, Min


def _baseline_importado(apps, rotulo):
    EventoAuditoria = apps.get_model('audit', 'EventoAuditoria')
    evento = (
        EventoAuditoria.objects.filter(
            tipo='criterios_importados', entidade_id=rotulo
        )
        .order_by('-ocorrido_em')
        .first()
    )

    if evento is None or not isinstance(evento.detalhe, dict):
        return ''

    return str(evento.detalhe.get('baseline_id') or '')[:60]


def criar_versoes_e_ligar(apps, schema_editor):
    VersaoCriterio = apps.get_model('maturity', 'VersaoCriterio')
    CriterioPreAnalise = apps.get_model('maturity', 'CriterioPreAnalise')
    PreAnalise = apps.get_model('maturity', 'PreAnalise')

    rotulos = set(CriterioPreAnalise.objects.values_list('versao', flat=True)) | set(
        PreAnalise.objects.values_list('versao_criterios', flat=True)
    )

    for rotulo in sorted(rotulos):
        criterios = CriterioPreAnalise.objects.filter(versao=rotulo)
        analises = PreAnalise.objects.filter(versao_criterios=rotulo)

        if criterios.exists():
            vigencia = criterios.aggregate(de=Min('vigente_de'), ate=Max('vigente_ate'))
            de = vigencia['de']
            aberta = criterios.filter(vigente_ate__isnull=True).exists()
            ate = None if aberta else max(vigencia['ate'], de)
        else:
            datas = analises.aggregate(de=Min('executada_em'), ate=Max('executada_em'))
            de = datas['de'].date()
            ate = datas['ate'].date()

        versao = VersaoCriterio.objects.create(
            versao=rotulo,
            baseline=_baseline_importado(apps, rotulo),
            vigente_de=de,
            vigente_ate=ate,
        )
        criterios.update(versao_criterio=versao)
        analises.update(versao_criterio=versao)


def devolver_rotulo_e_vigencia(apps, schema_editor):
    CriterioPreAnalise = apps.get_model('maturity', 'CriterioPreAnalise')
    PreAnalise = apps.get_model('maturity', 'PreAnalise')

    for criterio in CriterioPreAnalise.objects.select_related('versao_criterio'):
        criterio.versao = criterio.versao_criterio.versao
        criterio.vigente_de = criterio.versao_criterio.vigente_de
        criterio.vigente_ate = criterio.versao_criterio.vigente_ate
        criterio.save(update_fields=['versao', 'vigente_de', 'vigente_ate'])

    for analise in PreAnalise.objects.select_related('versao_criterio'):
        analise.versao_criterios = analise.versao_criterio.versao
        analise.save(update_fields=['versao_criterios'])


class Migration(migrations.Migration):

    dependencies = [
        ('maturity', '0006_tabelas_e_colunas_do_diagrama'),
        ('audit', '0008_tabelas_e_colunas_do_diagrama'),
    ]

    operations = [
        migrations.CreateModel(
            name='VersaoCriterio',
            fields=[
                ('id_versao_criterio', models.BigAutoField(db_column='id_versao_criterio', primary_key=True, serialize=False)),
                ('versao', models.CharField(db_column='versao', max_length=12, unique=True)),
                ('baseline', models.CharField(blank=True, db_column='baseline', default='', max_length=60)),
                ('vigente_de', models.DateField(db_column='vigente_de')),
                ('vigente_ate', models.DateField(blank=True, db_column='vigente_ate', null=True)),
            ],
            options={
                'verbose_name': 'versao dos criterios de pre-analise',
                'verbose_name_plural': 'versoes dos criterios de pre-analise',
                'db_table': 'Versao_Criterio_Pipe',
                'ordering': ['-vigente_de', 'versao'],
            },
        ),
        migrations.AddField(
            model_name='criteriopreanalise',
            name='versao_criterio',
            field=models.ForeignKey(db_column='id_versao_criterio', null=True, on_delete=django.db.models.deletion.PROTECT, related_name='criterios', to='maturity.versaocriterio'),
        ),
        migrations.AddField(
            model_name='preanalise',
            name='versao_criterio',
            field=models.ForeignKey(db_column='id_versao_criterio', null=True, on_delete=django.db.models.deletion.PROTECT, related_name='pre_analises', to='maturity.versaocriterio'),
        ),
        migrations.AlterField(
            model_name='criteriopreanalise',
            name='versao',
            field=models.CharField(db_column='versao', max_length=12, null=True),
        ),
        migrations.AlterField(
            model_name='criteriopreanalise',
            name='vigente_de',
            field=models.DateField(db_column='vigente_de', null=True),
        ),
        migrations.AlterField(
            model_name='preanalise',
            name='versao_criterios',
            field=models.CharField(db_column='versao_criterios', max_length=12, null=True),
        ),
        migrations.RunPython(criar_versoes_e_ligar, devolver_rotulo_e_vigencia),
        migrations.RemoveConstraint(
            model_name='criteriopreanalise',
            name='uq_criterio_versao_codigo',
        ),
        migrations.RemoveField(
            model_name='criteriopreanalise',
            name='versao',
        ),
        migrations.RemoveField(
            model_name='criteriopreanalise',
            name='vigente_de',
        ),
        migrations.RemoveField(
            model_name='criteriopreanalise',
            name='vigente_ate',
        ),
        migrations.RemoveField(
            model_name='preanalise',
            name='versao_criterios',
        ),
        migrations.AlterField(
            model_name='criteriopreanalise',
            name='versao_criterio',
            field=models.ForeignKey(db_column='id_versao_criterio', on_delete=django.db.models.deletion.PROTECT, related_name='criterios', to='maturity.versaocriterio'),
        ),
        migrations.AlterField(
            model_name='preanalise',
            name='versao_criterio',
            field=models.ForeignKey(db_column='id_versao_criterio', on_delete=django.db.models.deletion.PROTECT, related_name='pre_analises', to='maturity.versaocriterio'),
        ),
        migrations.AddConstraint(
            model_name='criteriopreanalise',
            constraint=models.UniqueConstraint(fields=('versao_criterio', 'codigo'), name='uq_criterio_versao_codigo'),
        ),
        migrations.AlterModelOptions(
            name='criteriopreanalise',
            options={'ordering': ['versao_criterio', 'dimensao', 'codigo'], 'verbose_name': 'criterio de pre-analise', 'verbose_name_plural': 'criterios de pre-analise'},
        ),
        migrations.AddConstraint(
            model_name='versaocriterio',
            constraint=models.CheckConstraint(condition=models.Q(('vigente_ate__isnull', True), ('vigente_ate__gte', models.F('vigente_de')), _connector='OR'), name='ck_versao_criterio_pipe_vigencia'),
        ),
    ]
