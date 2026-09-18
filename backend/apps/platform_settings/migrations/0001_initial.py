import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ContatoSuporte',
            fields=[
                ('id_contato', models.BigAutoField(db_column='id_contato', primary_key=True, serialize=False)),
                ('nome', models.CharField(db_column='nome', max_length=160)),
                ('papel', models.CharField(db_column='papel', max_length=120)),
                ('email', models.EmailField(db_column='email', max_length=254)),
                ('telefone', models.CharField(blank=True, db_column='telefone', max_length=40, null=True)),
                ('ordem', models.PositiveSmallIntegerField(db_column='ordem', default=0)),
                ('ativo', models.BooleanField(db_column='ativo', default=True)),
            ],
            options={
                'db_table': 'contato_suporte',
                'ordering': ['ordem', 'nome'],
            },
        ),
        migrations.CreateModel(
            name='ConfiguracaoPlataforma',
            fields=[
                ('id_configuracao', models.BigAutoField(db_column='id_configuracao', primary_key=True, serialize=False)),
                ('secao', models.CharField(db_column='secao', max_length=40, unique=True)),
                ('payload', models.JSONField(db_column='payload', default=dict)),
                ('revisao', models.PositiveIntegerField(db_column='revisao', default=0)),
                ('atualizado_em', models.DateTimeField(auto_now=True, db_column='atualizado_em')),
                ('atualizado_por', models.ForeignKey(db_column='atualizado_por', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='configuracoes_atualizadas', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'configuracao da plataforma',
                'verbose_name_plural': 'configuracoes da plataforma',
                'db_table': 'configuracao_plataforma',
            },
        ),
    ]
