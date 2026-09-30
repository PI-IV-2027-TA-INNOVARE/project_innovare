"""
Desmembra a equipe potencial conforme o Diagrama de Classes do Arquiteto.

Antes: `equipe_potencial` guardava uma linha por pessoa indicada.
Depois: `equipe_potencial` e o cabecalho de uma geracao e `membro_equipe`
guarda as pessoas - as duas classes que o diagrama desenha, mais
`lacuna_competencia_equipe`, o que a composicao nao cobre.

E DeleteModel + CreateModel, e nao uma sequencia de AlterField, porque as
linhas antigas nao se convertem em cabecalho: cada uma era uma pessoa. A
tabela esta vazia nos ambientes em que esta migration roda pela primeira vez,
e a guarda no topo recusa a execucao onde isso nao for verdade - o `DeleteModel`
sozinho levaria as indicacoes embora sem dizer nada.
"""
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

from core.migracoes import exigir_tabela_vazia


class Migration(migrations.Migration):

    dependencies = [
        ('matching', '0001_initial'),
        ('competencies', '0001_initial'),
        ('network', '0002_alter_membrocompetencia_table'),
        ('opportunities', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(
            exigir_tabela_vazia(
                'matching',
                'EquipePotencial',
                'converte indicacao em cabecalho de geracao',
            ),
            migrations.RunPython.noop,
        ),
        migrations.DeleteModel(name='EquipePotencial'),
        migrations.CreateModel(
            name='EquipePotencial',
            fields=[
                ('id_equipe', models.BigAutoField(db_column='id_equipe', primary_key=True, serialize=False)),
                ('data_geracao', models.DateTimeField(auto_now_add=True, db_column='data_geracao')),
                ('execucao', models.ForeignKey(blank=True, db_column='id_execucao', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='equipes', to='matching.execucaomatching')),
                ('oportunidade', models.ForeignKey(db_column='id_oportunidade', on_delete=django.db.models.deletion.CASCADE, related_name='equipes_potenciais', to='opportunities.oportunidade')),
            ],
            options={
                'verbose_name': 'equipe potencial',
                'verbose_name_plural': 'equipes potenciais',
                'db_table': 'equipe_potencial',
                'ordering': ['-data_geracao'],
            },
        ),
        migrations.CreateModel(
            name='MembroEquipe',
            fields=[
                ('id_membro_equipe', models.BigAutoField(db_column='id_membro_equipe', primary_key=True, serialize=False)),
                ('papel', models.CharField(choices=[('supervisor', 'Supervisor'), ('pesquisador', 'Pesquisador'), ('colaborador', 'Colaborador'), ('graduando', 'Graduando / bolsista')], db_column='papel', max_length=16)),
                ('score_compatibilidade', models.DecimalField(blank=True, db_column='score_compatibilidade', decimal_places=4, max_digits=5, null=True)),
                ('justificativa', models.TextField(blank=True, db_column='justificativa', default='')),
                ('match_reasons', models.JSONField(db_column='match_reasons', default=list)),
                ('score_features', models.JSONField(db_column='score_features', default=dict)),
                ('incluido', models.BooleanField(db_column='incluido', default=True)),
                ('origem', models.CharField(choices=[('ia', 'Sugerida pelo matching'), ('manual', 'Adicionada pelo Supervisor')], db_column='origem', default='ia', max_length=8)),
                ('validada', models.BooleanField(db_column='validada', default=False)),
                ('criado_em', models.DateTimeField(auto_now_add=True, db_column='criado_em')),
                ('atualizado_em', models.DateTimeField(auto_now=True, db_column='atualizado_em')),
                ('ajustado_por', models.ForeignKey(blank=True, db_column='ajustado_por', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='equipes_ajustadas', to=settings.AUTH_USER_MODEL)),
                ('equipe', models.ForeignKey(db_column='id_equipe', on_delete=django.db.models.deletion.CASCADE, related_name='membros', to='matching.equipepotencial')),
                ('membro', models.ForeignKey(db_column='id_membro', on_delete=django.db.models.deletion.PROTECT, related_name='indicacoes', to='network.membrorede')),
            ],
            options={
                'verbose_name': 'membro da equipe potencial',
                'verbose_name_plural': 'membros da equipe potencial',
                'db_table': 'membro_equipe',
                'ordering': ['-score_compatibilidade'],
            },
        ),
        migrations.CreateModel(
            name='LacunaCompetenciaEquipe',
            fields=[
                ('id_lacuna_equipe', models.BigAutoField(db_column='id_lacuna_equipe', primary_key=True, serialize=False)),
                ('descricao', models.TextField(db_column='descricao')),
                ('criado_em', models.DateTimeField(auto_now_add=True, db_column='criado_em')),
                ('competencia_necessaria', models.ForeignKey(blank=True, db_column='id_competencia_necessaria', null=True, on_delete=django.db.models.deletion.CASCADE, related_name='lacunas_equipe', to='competencies.competencianecessaria')),
                ('equipe', models.ForeignKey(db_column='id_equipe', on_delete=django.db.models.deletion.CASCADE, related_name='lacunas', to='matching.equipepotencial')),
            ],
            options={
                'verbose_name': 'lacuna de competencia da equipe',
                'verbose_name_plural': 'lacunas de competencia da equipe',
                'db_table': 'lacuna_competencia_equipe',
            },
        ),
        migrations.AddIndex(
            model_name='membroequipe',
            index=models.Index(fields=['membro', 'validada'], name='idx_membro_equipe_validada'),
        ),
        migrations.AddConstraint(
            model_name='membroequipe',
            constraint=models.UniqueConstraint(fields=('equipe', 'membro'), name='uq_membro_equipe'),
        ),
    ]
