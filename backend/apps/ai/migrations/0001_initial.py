import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='ExecucaoIA',
            fields=[
                ('id_execucao_ia', models.UUIDField(db_column='id_execucao_ia', default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('tipo', models.CharField(choices=[('copiloto', 'Copiloto de estruturacao'), ('competencias', 'Derivacao de competencias'), ('matching', 'Matching'), ('preanalise', 'Pre-analise de maturidade'), ('embedding', 'Geracao de embedding')], db_column='tipo', max_length=16)),
                ('provedor', models.CharField(db_column='provedor', max_length=40)),
                ('modelo', models.CharField(db_column='modelo', max_length=80)),
                ('versao_prompt', models.CharField(blank=True, db_column='versao_prompt', default='', max_length=40)),
                ('tokens_entrada', models.IntegerField(blank=True, db_column='tokens_entrada', null=True)),
                ('tokens_saida', models.IntegerField(blank=True, db_column='tokens_saida', null=True)),
                ('custo_estimado', models.DecimalField(blank=True, db_column='custo_estimado', decimal_places=6, max_digits=10, null=True)),
                ('latencia_ms', models.IntegerField(blank=True, db_column='latencia_ms', null=True)),
                ('status', models.CharField(choices=[('pendente', 'Pendente'), ('executando', 'Executando'), ('ok', 'Concluida'), ('erro', 'Erro')], db_column='status', default='pendente', max_length=12)),
                ('fallback_usado', models.BooleanField(db_column='fallback_usado', default=False)),
                ('erro', models.TextField(blank=True, db_column='erro', default='')),
                ('correlation_id', models.UUIDField(db_column='correlation_id', default=uuid.uuid4)),
                ('executado_por', models.CharField(db_column='executado_por', default='__sistema__', max_length=160)),
                ('criado_em', models.DateTimeField(auto_now_add=True, db_column='criado_em')),
                ('concluido_em', models.DateTimeField(blank=True, db_column='concluido_em', null=True)),
            ],
            options={
                'verbose_name': 'execucao de IA',
                'verbose_name_plural': 'execucoes de IA',
                'db_table': 'execucao_ia',
                'indexes': [models.Index(fields=['correlation_id'], name='idx_execia_correlation'), models.Index(condition=models.Q(('status', 'ok')), fields=['criado_em'], name='idx_execia_consumo_ok')],
            },
        ),
    ]
