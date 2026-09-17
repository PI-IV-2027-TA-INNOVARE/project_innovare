from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='Organizacao',
            fields=[
                ('criado_em', models.DateTimeField(auto_now_add=True, db_column='criado_em')),
                ('atualizado_em', models.DateTimeField(auto_now=True, db_column='atualizado_em')),
                ('id_organizacao', models.BigAutoField(db_column='id_organizacao', primary_key=True, serialize=False)),
                ('tipo', models.CharField(choices=[('demandante', 'Organizacao demandante'), ('instituicao', 'Instituicao de vinculo')], db_column='tipo', max_length=12)),
                ('nome', models.CharField(db_column='nome', max_length=180)),
                ('razao_social', models.CharField(blank=True, db_column='razao_social', max_length=200, null=True)),
                ('cnpj', models.CharField(blank=True, db_column='cnpj', max_length=14, null=True, unique=True)),
                ('municipio', models.CharField(blank=True, db_column='municipio', max_length=120, null=True)),
                ('uf', models.CharField(blank=True, db_column='uf', max_length=2, null=True)),
                ('ativo', models.BooleanField(db_column='ativo', default=True)),
            ],
            options={
                'verbose_name': 'organizacao',
                'verbose_name_plural': 'organizacoes',
                'db_table': 'organizacao',
                'constraints': [models.CheckConstraint(condition=models.Q(models.Q(('cnpj__isnull', False), ('tipo', 'demandante')), ('tipo', 'instituicao'), _connector='OR'), name='ck_organizacao_demandante_tem_cnpj')],
            },
        ),
    ]
