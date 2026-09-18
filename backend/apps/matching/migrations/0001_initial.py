import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('ai', '0001_initial'),
        ('network', '0001_initial'),
        ('opportunities', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ExecucaoMatching',
            fields=[
                ('id_execucao', models.UUIDField(db_column='id_execucao', default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('estrategia', models.CharField(db_column='estrategia', max_length=60)),
                ('pesos', models.JSONField(db_column='pesos', default=dict)),
                ('versao_modelo', models.CharField(blank=True, db_column='versao_modelo', default='', max_length=120)),
                ('usou_rerank', models.BooleanField(db_column='usou_rerank', default=False)),
                ('fallback_usado', models.BooleanField(db_column='fallback_usado', default=False)),
                ('executado_por', models.CharField(db_column='executado_por', default='__sistema__', max_length=160)),
                ('status', models.CharField(choices=[('pendente', 'Pendente'), ('executando', 'Executando'), ('ok', 'Concluida'), ('erro', 'Erro')], db_column='status', default='pendente', max_length=12)),
                ('erro', models.TextField(blank=True, db_column='erro', default='')),
                ('iniciado_em', models.DateTimeField(auto_now_add=True, db_column='iniciado_em')),
                ('concluido_em', models.DateTimeField(blank=True, db_column='concluido_em', null=True)),
                ('execucao_ia', models.ForeignKey(blank=True, db_column='id_execucao_ia', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='execucoes_matching', to='ai.execucaoia')),
                ('oportunidade', models.ForeignKey(db_column='id_oportunidade', on_delete=django.db.models.deletion.CASCADE, related_name='execucoes_matching', to='opportunities.oportunidade')),
            ],
            options={
                'verbose_name': 'execucao de matching',
                'verbose_name_plural': 'execucoes de matching',
                'db_table': 'execucao_matching',
                'ordering': ['-iniciado_em'],
            },
        ),
        migrations.CreateModel(
            name='EquipePotencial',
            fields=[
                ('id_equipe_potencial', models.BigAutoField(db_column='id_equipe_potencial', primary_key=True, serialize=False)),
                ('papel_sugerido', models.CharField(choices=[('supervisor', 'Supervisor'), ('pesquisador', 'Pesquisador'), ('colaborador', 'Colaborador'), ('graduando', 'Graduando / bolsista')], db_column='papel_sugerido', max_length=16)),
                ('score_match', models.DecimalField(blank=True, db_column='score_match', decimal_places=4, max_digits=5, null=True)),
                ('match_reasons', models.JSONField(db_column='match_reasons', default=list)),
                ('score_features', models.JSONField(db_column='score_features', default=dict)),
                ('origem', models.CharField(choices=[('ia', 'Sugerida pelo matching'), ('manual', 'Adicionada pelo Supervisor')], db_column='origem', default='ia', max_length=8)),
                ('validada', models.BooleanField(db_column='validada', default=False)),
                ('criado_em', models.DateTimeField(auto_now_add=True, db_column='criado_em')),
                ('atualizado_em', models.DateTimeField(auto_now=True, db_column='atualizado_em')),
                ('ajustado_por', models.ForeignKey(blank=True, db_column='ajustado_por', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='equipes_ajustadas', to=settings.AUTH_USER_MODEL)),
                ('membro', models.ForeignKey(db_column='id_membro', on_delete=django.db.models.deletion.PROTECT, related_name='indicacoes', to='network.membrorede')),
                ('oportunidade', models.ForeignKey(db_column='id_oportunidade', on_delete=django.db.models.deletion.CASCADE, related_name='equipe_potencial', to='opportunities.oportunidade')),
                ('execucao', models.ForeignKey(blank=True, db_column='id_execucao', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='indicacoes', to='matching.execucaomatching')),
            ],
            options={
                'verbose_name': 'indicacao de equipe potencial',
                'verbose_name_plural': 'equipe potencial',
                'db_table': 'equipe_potencial',
                'ordering': ['-score_match'],
                'indexes': [models.Index(fields=['membro', 'validada'], name='idx_equipe_membro_validada')],
                'constraints': [models.UniqueConstraint(fields=('oportunidade', 'membro'), name='uq_equipe_oportunidade_membro')],
            },
        ),
    ]
