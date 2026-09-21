import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('ai', '0001_initial'),
        ('copilot', '0001_initial'),
        ('opportunities', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='CriterioPreAnalise',
            fields=[
                ('id_criterio', models.BigAutoField(db_column='id_criterio', primary_key=True, serialize=False)),
                ('versao', models.CharField(db_column='versao', max_length=12)),
                ('dimensao', models.CharField(choices=[('desafio_tecnologico', 'Desafio tecnologico'), ('inovacao', 'Inovacao'), ('plano_pesquisa', 'Plano de pesquisa'), ('equipe_supervisao', 'Equipe e supervisao'), ('infraestrutura', 'Infraestrutura'), ('viabilidade', 'Viabilidade')], db_column='dimensao', max_length=24)),
                ('codigo', models.CharField(db_column='codigo', max_length=40)),
                ('descricao', models.TextField(db_column='descricao')),
                ('peso', models.DecimalField(blank=True, db_column='peso', decimal_places=2, max_digits=5, null=True)),
                ('vigente_de', models.DateField(db_column='vigente_de')),
                ('vigente_ate', models.DateField(blank=True, db_column='vigente_ate', null=True)),
            ],
            options={
                'verbose_name': 'criterio de pre-analise',
                'verbose_name_plural': 'criterios de pre-analise',
                'db_table': 'criterio_pre_analise',
                'ordering': ['versao', 'dimensao', 'codigo'],
                'constraints': [models.UniqueConstraint(fields=('versao', 'codigo'), name='uq_criterio_versao_codigo')],
            },
        ),
        migrations.CreateModel(
            name='PreAnalise',
            fields=[
                ('id_pre_analise', models.UUIDField(db_column='id_pre_analise', default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('versao_criterios', models.CharField(db_column='versao_criterios', max_length=12)),
                ('versao_proposta', models.PositiveIntegerField(db_column='versao_proposta')),
                ('sintese', models.TextField(blank=True, db_column='sintese', default='')),
                ('executada_em', models.DateTimeField(auto_now_add=True, db_column='executada_em')),
                ('executada_por', models.CharField(db_column='executada_por', default='__sistema__', max_length=160)),
                ('status', models.CharField(choices=[('pendente', 'Pendente'), ('executando', 'Executando'), ('ok', 'Concluida'), ('erro', 'Erro')], db_column='status', default='pendente', max_length=12)),
                ('erro', models.TextField(blank=True, db_column='erro', default='')),
                ('execucao_ia', models.ForeignKey(blank=True, db_column='id_execucao_ia', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='pre_analises', to='ai.execucaoia')),
                ('oportunidade', models.ForeignKey(db_column='id_oportunidade', on_delete=django.db.models.deletion.CASCADE, related_name='pre_analises', to='opportunities.oportunidade')),
            ],
            options={
                'verbose_name': 'pre-analise',
                'verbose_name_plural': 'pre-analises',
                'db_table': 'pre_analise',
                'ordering': ['-executada_em'],
            },
        ),
        migrations.CreateModel(
            name='Recomendacao',
            fields=[
                ('id_recomendacao', models.BigAutoField(db_column='id_recomendacao', primary_key=True, serialize=False)),
                ('origem', models.CharField(choices=[('copiloto', 'Copiloto'), ('pre_analise', 'Pre-analise'), ('manual', 'Manual')], db_column='origem', max_length=12)),
                ('texto', models.TextField(db_column='texto')),
                ('acatada', models.BooleanField(db_column='acatada', default=False)),
                ('acatada_em', models.DateTimeField(blank=True, db_column='acatada_em', null=True)),
                ('criado_em', models.DateTimeField(auto_now_add=True, db_column='criado_em')),
                ('execucao_ia', models.ForeignKey(blank=True, db_column='id_execucao_ia', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='recomendacoes', to='ai.execucaoia')),
                ('lacuna', models.ForeignKey(blank=True, db_column='id_lacuna', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='recomendacoes', to='copilot.lacuna')),
                ('oportunidade', models.ForeignKey(db_column='id_oportunidade', on_delete=django.db.models.deletion.CASCADE, related_name='recomendacoes', to='opportunities.oportunidade')),
                ('pre_analise', models.ForeignKey(blank=True, db_column='id_pre_analise', null=True, on_delete=django.db.models.deletion.CASCADE, related_name='recomendacoes', to='maturity.preanalise')),
            ],
            options={
                'verbose_name_plural': 'recomendacoes',
                'db_table': 'recomendacao',
                'ordering': ['-criado_em'],
            },
        ),
        migrations.CreateModel(
            name='PreAnaliseDimensao',
            fields=[
                ('id_dimensao', models.BigAutoField(db_column='id_dimensao', primary_key=True, serialize=False)),
                ('dimensao', models.CharField(choices=[('desafio_tecnologico', 'Desafio tecnologico'), ('inovacao', 'Inovacao'), ('plano_pesquisa', 'Plano de pesquisa'), ('equipe_supervisao', 'Equipe e supervisao'), ('infraestrutura', 'Infraestrutura'), ('viabilidade', 'Viabilidade')], db_column='dimensao', max_length=24)),
                ('avaliacao', models.TextField(db_column='avaliacao')),
                ('nivel', models.CharField(choices=[('consolidada', 'Consolidada'), ('em_desenvolvimento', 'Em desenvolvimento'), ('fragil', 'Fragil')], db_column='nivel', max_length=20)),
                ('evidencias', models.JSONField(db_column='evidencias', default=list)),
                ('ordem', models.PositiveSmallIntegerField(db_column='ordem', default=0)),
                ('pre_analise', models.ForeignKey(db_column='id_pre_analise', on_delete=django.db.models.deletion.CASCADE, related_name='dimensoes', to='maturity.preanalise')),
            ],
            options={
                'verbose_name': 'dimensao da pre-analise',
                'verbose_name_plural': 'dimensoes da pre-analise',
                'db_table': 'pre_analise_dimensao',
                'ordering': ['pre_analise', 'ordem'],
                'constraints': [models.UniqueConstraint(fields=('pre_analise', 'dimensao'), name='uq_pre_analise_dimensao')],
            },
        ),
    ]
