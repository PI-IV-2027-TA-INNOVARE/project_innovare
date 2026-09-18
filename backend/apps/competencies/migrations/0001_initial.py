import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('ai', '0001_initial'),
        ('network', '0001_initial'),
        ('opportunities', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='CompetenciaNecessaria',
            fields=[
                ('id_competencia_necessaria', models.BigAutoField(db_column='id_competencia_necessaria', primary_key=True, serialize=False)),
                ('descricao', models.CharField(db_column='descricao', max_length=200)),
                ('essencial', models.BooleanField(db_column='essencial', default=True)),
                ('derivada_de', models.CharField(choices=[('copiloto', 'Derivada pelo Copiloto'), ('manual', 'Informada manualmente')], db_column='derivada_de', default='copiloto', max_length=10)),
                ('criado_em', models.DateTimeField(auto_now_add=True, db_column='criado_em')),
                ('atualizado_em', models.DateTimeField(auto_now=True, db_column='atualizado_em')),
                ('competencia', models.ForeignKey(blank=True, db_column='id_competencia', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='exigida_em', to='network.competencia')),
                ('execucao_ia', models.ForeignKey(blank=True, db_column='id_execucao_ia', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='competencias_derivadas', to='ai.execucaoia')),
                ('oportunidade', models.ForeignKey(db_column='id_oportunidade', on_delete=django.db.models.deletion.CASCADE, related_name='competencias_necessarias', to='opportunities.oportunidade')),
            ],
            options={
                'verbose_name': 'competencia necessaria',
                'verbose_name_plural': 'competencias necessarias',
                'db_table': 'competencia_necessaria',
                'constraints': [models.UniqueConstraint(fields=('oportunidade', 'descricao'), name='uq_competencia_necessaria_oport_desc')],
            },
        ),
    ]
