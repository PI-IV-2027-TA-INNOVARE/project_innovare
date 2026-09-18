import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('ai', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='EventoAuditoria',
            fields=[
                ('id_evento', models.BigAutoField(db_column='id_evento', primary_key=True, serialize=False)),
                ('ocorrido_em', models.DateTimeField(db_column='ocorrido_em')),
                ('categoria', models.CharField(choices=[('oportunidade', 'Oportunidade'), ('copiloto', 'Copiloto'), ('competencia', 'Competencia'), ('matching', 'Matching'), ('preanalise', 'Pre-analise'), ('decisao', 'Decisao'), ('rede', 'Rede interna'), ('conta', 'Conta e acesso'), ('config', 'Configuracao')], db_column='categoria', max_length=16)),
                ('tipo', models.CharField(db_column='tipo', max_length=60)),
                ('ator', models.CharField(db_column='ator', max_length=160)),
                ('entidade', models.CharField(db_column='entidade', max_length=60)),
                ('entidade_id', models.CharField(db_column='entidade_id', max_length=60)),
                ('status', models.CharField(choices=[('ok', 'Concluido'), ('erro', 'Erro'), ('negado', 'Negado')], db_column='status', default='ok', max_length=8)),
                ('motivo', models.TextField(blank=True, db_column='motivo', default='')),
                ('correlation_id', models.UUIDField(db_column='correlation_id', default=uuid.uuid4)),
                ('detalhe', models.JSONField(db_column='detalhe', default=dict)),
                ('registrado_em', models.DateTimeField(auto_now_add=True, db_column='registrado_em')),
                ('execucao_ia', models.ForeignKey(blank=True, db_column='id_execucao_ia', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='eventos', to='ai.execucaoia')),
            ],
            options={
                'verbose_name': 'evento de auditoria',
                'verbose_name_plural': 'eventos de auditoria',
                'db_table': 'evento_auditoria',
                'ordering': ['-ocorrido_em'],
                'indexes': [models.Index(fields=['entidade', 'entidade_id', '-ocorrido_em'], name='idx_evento_entidade'), models.Index(fields=['correlation_id'], name='idx_evento_correlation'), models.Index(fields=['categoria', '-ocorrido_em'], name='idx_evento_categoria')],
            },
        ),
    ]
