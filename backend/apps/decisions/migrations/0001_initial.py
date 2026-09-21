import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('maturity', '0001_initial'),
        ('opportunities', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Decisao',
            fields=[
                ('id_decisao', models.BigAutoField(db_column='id_decisao', primary_key=True, serialize=False)),
                ('tipo', models.CharField(choices=[('continuar', 'Continuar'), ('revisar', 'Revisar'), ('arquivar', 'Arquivar')], db_column='tipo', max_length=10)),
                ('justificativa', models.TextField(db_column='justificativa')),
                ('registrada_em', models.DateTimeField(auto_now_add=True, db_column='registrada_em')),
                ('autor', models.ForeignKey(db_column='id_autor', on_delete=django.db.models.deletion.PROTECT, related_name='decisoes', to=settings.AUTH_USER_MODEL)),
                ('oportunidade', models.ForeignKey(db_column='id_oportunidade', on_delete=django.db.models.deletion.CASCADE, related_name='decisoes', to='opportunities.oportunidade')),
                ('pre_analise', models.ForeignKey(blank=True, db_column='id_pre_analise', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='decisoes', to='maturity.preanalise')),
            ],
            options={
                'verbose_name_plural': 'decisoes',
                'db_table': 'decisao',
                'ordering': ['-registrada_em'],
                'indexes': [models.Index(fields=['oportunidade', '-registrada_em'], name='idx_decisao_oportunidade')],
            },
        ),
    ]
