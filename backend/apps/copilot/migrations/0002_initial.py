import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('ai', '0001_initial'),
        ('copilot', '0001_initial'),
        ('maturity', '0001_initial'),
        ('opportunities', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='lacuna',
            name='pre_analise',
            field=models.ForeignKey(blank=True, db_column='id_pre_analise', null=True, on_delete=django.db.models.deletion.CASCADE, related_name='lacunas', to='maturity.preanalise'),
        ),
        migrations.AddField(
            model_name='mensagemcopiloto',
            name='execucao_ia',
            field=models.ForeignKey(blank=True, db_column='id_execucao_ia', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='mensagens_copiloto', to='ai.execucaoia'),
        ),
        migrations.AddField(
            model_name='propostaestruturada',
            name='execucao_ia',
            field=models.ForeignKey(blank=True, db_column='id_execucao_ia', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='propostas', to='ai.execucaoia'),
        ),
        migrations.AddField(
            model_name='propostaestruturada',
            name='oportunidade',
            field=models.OneToOneField(db_column='id_oportunidade', on_delete=django.db.models.deletion.CASCADE, related_name='proposta', to='opportunities.oportunidade'),
        ),
        migrations.AddField(
            model_name='propostaestruturada',
            name='revisor',
            field=models.ForeignKey(blank=True, db_column='id_revisor', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='propostas_revisadas', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='sessaocopiloto',
            name='iniciada_por',
            field=models.ForeignKey(db_column='iniciada_por', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='sessoes_copiloto', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='sessaocopiloto',
            name='oportunidade',
            field=models.ForeignKey(db_column='id_oportunidade', on_delete=django.db.models.deletion.CASCADE, related_name='sessoes_copiloto', to='opportunities.oportunidade'),
        ),
        migrations.AddField(
            model_name='mensagemcopiloto',
            name='sessao',
            field=models.ForeignKey(db_column='id_sessao', on_delete=django.db.models.deletion.CASCADE, related_name='mensagens', to='copilot.sessaocopiloto'),
        ),
        migrations.AddIndex(
            model_name='lacuna',
            index=models.Index(fields=['oportunidade', 'tipo', 'resolvida'], name='idx_lacuna_oport_tipo'),
        ),
        migrations.AddConstraint(
            model_name='mensagemcopiloto',
            constraint=models.UniqueConstraint(fields=('sessao', 'ordem'), name='uq_mensagem_sessao_ordem'),
        ),
    ]
