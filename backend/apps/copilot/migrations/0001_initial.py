import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('ai', '0001_initial'),
        ('competencies', '0001_initial'),
        ('opportunities', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='MensagemCopiloto',
            fields=[
                ('id_mensagem', models.BigAutoField(db_column='id_mensagem', primary_key=True, serialize=False)),
                ('autor', models.CharField(choices=[('copiloto', 'Copiloto'), ('humano', 'Humano')], db_column='autor', max_length=10)),
                ('conteudo', models.TextField(db_column='conteudo')),
                ('ordem', models.PositiveIntegerField(db_column='ordem')),
                ('criado_em', models.DateTimeField(auto_now_add=True, db_column='criado_em')),
            ],
            options={
                'verbose_name': 'mensagem do copiloto',
                'verbose_name_plural': 'mensagens do copiloto',
                'db_table': 'mensagem_copiloto',
                'ordering': ['sessao', 'ordem'],
            },
        ),
        migrations.CreateModel(
            name='PropostaEstruturada',
            fields=[
                ('criado_em', models.DateTimeField(auto_now_add=True, db_column='criado_em')),
                ('atualizado_em', models.DateTimeField(auto_now=True, db_column='atualizado_em')),
                ('id_proposta', models.BigAutoField(db_column='id_proposta', primary_key=True, serialize=False)),
                ('problema_pesquisa', models.TextField(blank=True, db_column='problema_pesquisa', default='')),
                ('hipotese', models.TextField(blank=True, db_column='hipotese', null=True)),
                ('objetivo_geral', models.TextField(blank=True, db_column='objetivo_geral', default='')),
                ('objetivos_especificos', models.JSONField(db_column='objetivos_especificos', default=list)),
                ('metodologia', models.TextField(blank=True, db_column='metodologia', default='')),
                ('resultados_esperados', models.TextField(blank=True, db_column='resultados_esperados', default='')),
                ('caracterizacao_inovacao', models.TextField(blank=True, db_column='caracterizacao_inovacao', default='')),
                ('infraestrutura_recursos', models.TextField(blank=True, db_column='infraestrutura_recursos', default='')),
                ('versao', models.PositiveIntegerField(db_column='versao', default=1)),
                ('revisada_por_humano', models.BooleanField(db_column='revisada_por_humano', default=False)),
            ],
            options={
                'verbose_name': 'proposta estruturada',
                'verbose_name_plural': 'propostas estruturadas',
                'db_table': 'proposta_estruturada',
            },
        ),
        migrations.CreateModel(
            name='SessaoCopiloto',
            fields=[
                ('id_sessao', models.UUIDField(db_column='id_sessao', default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('estado', models.CharField(choices=[('aberta', 'Aberta'), ('concluida', 'Concluida'), ('abandonada', 'Abandonada')], db_column='estado', default='aberta', max_length=12)),
                ('criado_em', models.DateTimeField(auto_now_add=True, db_column='criado_em')),
                ('encerrado_em', models.DateTimeField(blank=True, db_column='encerrado_em', null=True)),
            ],
            options={
                'verbose_name': 'sessao do copiloto',
                'verbose_name_plural': 'sessoes do copiloto',
                'db_table': 'sessao_copiloto',
                'ordering': ['-criado_em'],
            },
        ),
        migrations.CreateModel(
            name='Lacuna',
            fields=[
                ('id_lacuna', models.BigAutoField(db_column='id_lacuna', primary_key=True, serialize=False)),
                ('tipo', models.CharField(choices=[('proposta', 'Lacuna da proposta'), ('competencia', 'Lacuna de competencia'), ('pre_analise', 'Lacuna da pre-analise')], db_column='tipo', max_length=12)),
                ('descricao', models.TextField(db_column='descricao')),
                ('severidade', models.CharField(blank=True, choices=[('alta', 'Alta'), ('media', 'Media'), ('baixa', 'Baixa')], db_column='severidade', max_length=6, null=True)),
                ('resolvida', models.BooleanField(db_column='resolvida', default=False)),
                ('resolvida_em', models.DateTimeField(blank=True, db_column='resolvida_em', null=True)),
                ('criado_em', models.DateTimeField(auto_now_add=True, db_column='criado_em')),
                ('competencia_necessaria', models.ForeignKey(blank=True, db_column='id_competencia_necessaria', null=True, on_delete=django.db.models.deletion.CASCADE, related_name='lacunas', to='competencies.competencianecessaria')),
                ('execucao_ia', models.ForeignKey(blank=True, db_column='id_execucao_ia', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='lacunas', to='ai.execucaoia')),
                ('oportunidade', models.ForeignKey(db_column='id_oportunidade', on_delete=django.db.models.deletion.CASCADE, related_name='lacunas', to='opportunities.oportunidade')),
            ],
            options={
                'verbose_name_plural': 'lacunas',
                'db_table': 'lacuna',
            },
        ),
    ]
