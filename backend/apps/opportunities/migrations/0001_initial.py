import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('network', '0001_initial'),
        ('organizations', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='SequenciaCodigo',
            fields=[
                ('id_sequencia', models.BigAutoField(db_column='id_sequencia', primary_key=True, serialize=False)),
                ('ano', models.PositiveSmallIntegerField(db_column='ano', unique=True)),
                ('ultimo_numero', models.PositiveIntegerField(db_column='ultimo_numero', default=0)),
            ],
            options={
                'verbose_name': 'sequencia de codigo',
                'verbose_name_plural': 'sequencias de codigo',
                'db_table': 'sequencia_codigo',
            },
        ),
        migrations.CreateModel(
            name='Oportunidade',
            fields=[
                ('id_oportunidade', models.BigAutoField(db_column='id_oportunidade', primary_key=True, serialize=False)),
                ('codigo', models.CharField(db_column='codigo', max_length=14, unique=True)),
                ('titulo', models.CharField(db_column='titulo', max_length=200)),
                ('origem', models.CharField(choices=[('externo', 'Problema externo'), ('interna', 'Ideia interna')], db_column='origem', max_length=8)),
                ('resumo', models.TextField(blank=True, db_column='resumo', default='')),
                ('contexto', models.TextField(blank=True, db_column='contexto', default='')),
                ('situacao', models.CharField(choices=[('entrada', 'Entrada'), ('estruturacao', 'Em estruturacao'), ('competencias', 'Competencias'), ('matching', 'Matching'), ('pre_analise', 'Pre-analise'), ('aguardando_decisao', 'Aguardando decisao'), ('continuar', 'Continuar'), ('revisar', 'Revisar'), ('arquivada', 'Arquivada')], db_column='situacao', default='entrada', max_length=20)),
                ('criada_em', models.DateTimeField(auto_now_add=True, db_column='criada_em')),
                ('atualizada_em', models.DateTimeField(auto_now=True, db_column='atualizada_em')),
                ('criado_por', models.ForeignKey(db_column='id_criado_por', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='oportunidades_criadas', to=settings.AUTH_USER_MODEL)),
                ('demandante', models.ForeignKey(blank=True, db_column='id_demandante', null=True, on_delete=django.db.models.deletion.PROTECT, related_name='oportunidades', to='organizations.organizacao')),
                ('responsavel', models.ForeignKey(blank=True, db_column='id_responsavel', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='oportunidades_conduzidas', to='network.membrorede')),
            ],
            options={
                'verbose_name_plural': 'oportunidades',
                'db_table': 'oportunidade',
                'ordering': ['-atualizada_em'],
            },
        ),
        migrations.CreateModel(
            name='AnexoOportunidade',
            fields=[
                ('id_anexo', models.BigAutoField(db_column='id_anexo', primary_key=True, serialize=False)),
                ('arquivo', models.FileField(db_column='arquivo', upload_to='anexos/%Y/%m/')),
                ('nome_original', models.CharField(db_column='nome_original', max_length=255)),
                ('mime', models.CharField(db_column='mime', max_length=120)),
                ('tamanho_bytes', models.BigIntegerField(db_column='tamanho_bytes')),
                ('criado_em', models.DateTimeField(auto_now_add=True, db_column='criado_em')),
                ('enviado_por', models.ForeignKey(db_column='enviado_por', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='anexos_enviados', to=settings.AUTH_USER_MODEL)),
                ('oportunidade', models.ForeignKey(db_column='id_oportunidade', on_delete=django.db.models.deletion.CASCADE, related_name='anexos', to='opportunities.oportunidade')),
            ],
            options={
                'verbose_name': 'anexo da oportunidade',
                'verbose_name_plural': 'anexos da oportunidade',
                'db_table': 'anexo_oportunidade',
            },
        ),
        migrations.AddIndex(
            model_name='oportunidade',
            index=models.Index(fields=['situacao', '-atualizada_em'], name='idx_oport_fila_supervisor'),
        ),
        migrations.AddConstraint(
            model_name='oportunidade',
            constraint=models.CheckConstraint(condition=models.Q(models.Q(('demandante__isnull', True), ('origem', 'interna')), models.Q(('demandante__isnull', False), ('origem', 'externo')), _connector='OR'), name='ck_oportunidade_origem_demandante'),
        ),
    ]
