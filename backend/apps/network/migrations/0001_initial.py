import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('organizations', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Titulacao',
            fields=[
                ('id_titulacao', models.BigAutoField(db_column='id_titulacao', primary_key=True, serialize=False)),
                ('codigo', models.CharField(db_column='codigo', max_length=40, unique=True)),
                ('rotulo', models.CharField(db_column='rotulo', max_length=80)),
                ('nivel', models.PositiveSmallIntegerField(db_column='nivel')),
            ],
            options={
                'db_table': 'titulacao',
                'ordering': ['nivel'],
            },
        ),
        migrations.CreateModel(
            name='Competencia',
            fields=[
                ('criado_em', models.DateTimeField(auto_now_add=True, db_column='criado_em')),
                ('atualizado_em', models.DateTimeField(auto_now=True, db_column='atualizado_em')),
                ('id_competencia', models.BigAutoField(db_column='id_competencia', primary_key=True, serialize=False)),
                ('nome', models.CharField(db_column='nome', max_length=160)),
                ('tipo', models.CharField(choices=[('competencia', 'Competencia'), ('tecnica', 'Tecnica'), ('linha_pesquisa', 'Linha de pesquisa')], db_column='tipo', max_length=16)),
                ('canonica', models.BooleanField(db_column='canonica', default=False)),
                ('ativo', models.BooleanField(db_column='ativo', default=True)),
                ('sinonimo_de', models.ForeignKey(blank=True, db_column='id_sinonimo_de', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='sinonimos', to='network.competencia')),
            ],
            options={
                'verbose_name_plural': 'competencias',
                'db_table': 'competencia',
            },
        ),
        migrations.CreateModel(
            name='MembroCompetencia',
            fields=[
                ('id_membro_competencia', models.BigAutoField(db_column='id_membro_competencia', primary_key=True, serialize=False)),
                ('nivel', models.PositiveSmallIntegerField(blank=True, db_column='nivel', null=True)),
                ('declarado_por', models.CharField(choices=[('membro', 'O proprio membro'), ('supervisor', 'Supervisor')], db_column='declarado_por', default='supervisor', max_length=12)),
                ('criado_em', models.DateTimeField(auto_now_add=True, db_column='criado_em')),
                ('competencia', models.ForeignKey(db_column='id_competencia', on_delete=django.db.models.deletion.PROTECT, related_name='vinculos_membro', to='network.competencia')),
            ],
            options={
                'db_table': 'membro_competencia',
            },
        ),
        migrations.CreateModel(
            name='MembroRede',
            fields=[
                ('criado_em', models.DateTimeField(auto_now_add=True, db_column='criado_em')),
                ('atualizado_em', models.DateTimeField(auto_now=True, db_column='atualizado_em')),
                ('id_membro', models.BigAutoField(db_column='id_membro', primary_key=True, serialize=False)),
                ('nome', models.CharField(db_column='nome', max_length=160)),
                ('email', models.EmailField(db_column='email', max_length=254, unique=True)),
                ('papel_rede', models.CharField(choices=[('supervisor', 'Supervisor'), ('pesquisador', 'Pesquisador'), ('colaborador', 'Colaborador'), ('graduando', 'Graduando / bolsista')], db_column='papel_rede', max_length=16)),
                ('disponibilidade', models.CharField(choices=[('integral', 'Integral'), ('parcial', 'Parcial'), ('pontual', 'Pontual / consultiva'), ('indisponivel', 'Indisponivel no momento')], db_column='disponibilidade', default='parcial', max_length=14)),
                ('experiencia', models.TextField(blank=True, db_column='experiencia', default='')),
                ('situacao', models.CharField(choices=[('ativo', 'Ativo'), ('sem_acesso', 'Sem acesso'), ('inativo', 'Inativo')], db_column='situacao', default='sem_acesso', max_length=12)),
                ('cadastrado_por', models.ForeignKey(db_column='cadastrado_por', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='membros_cadastrados', to=settings.AUTH_USER_MODEL)),
                ('competencias', models.ManyToManyField(related_name='membros', through='network.MembroCompetencia', to='network.competencia')),
                ('organizacao', models.ForeignKey(blank=True, db_column='id_organizacao', null=True, on_delete=django.db.models.deletion.PROTECT, related_name='membros_rede', to='organizations.organizacao')),
                ('usuario', models.OneToOneField(blank=True, db_column='id_usuario', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='membro_rede', to=settings.AUTH_USER_MODEL)),
                ('titulacao', models.ForeignKey(blank=True, db_column='id_titulacao', null=True, on_delete=django.db.models.deletion.PROTECT, related_name='membros', to='network.titulacao')),
            ],
            options={
                'verbose_name': 'membro da rede',
                'verbose_name_plural': 'membros da rede',
                'db_table': 'membro_rede',
            },
        ),
        migrations.AddField(
            model_name='membrocompetencia',
            name='membro',
            field=models.ForeignKey(db_column='id_membro', on_delete=django.db.models.deletion.CASCADE, related_name='vinculos_competencia', to='network.membrorede'),
        ),
        migrations.CreateModel(
            name='Formacao',
            fields=[
                ('criado_em', models.DateTimeField(auto_now_add=True, db_column='criado_em')),
                ('atualizado_em', models.DateTimeField(auto_now=True, db_column='atualizado_em')),
                ('id_formacao', models.BigAutoField(db_column='id_formacao', primary_key=True, serialize=False)),
                ('curso', models.CharField(db_column='curso', max_length=180)),
                ('instituicao', models.CharField(db_column='instituicao', max_length=180)),
                ('ano_conclusao', models.PositiveSmallIntegerField(blank=True, db_column='ano_conclusao', null=True)),
                ('membro', models.ForeignKey(db_column='id_membro', on_delete=django.db.models.deletion.CASCADE, related_name='formacoes', to='network.membrorede')),
                ('titulacao', models.ForeignKey(blank=True, db_column='id_titulacao', null=True, on_delete=django.db.models.deletion.PROTECT, related_name='formacoes', to='network.titulacao')),
            ],
            options={
                'verbose_name_plural': 'formacoes',
                'db_table': 'formacao',
                'ordering': ['-ano_conclusao'],
            },
        ),
        migrations.AddConstraint(
            model_name='competencia',
            constraint=models.UniqueConstraint(fields=('nome', 'tipo'), name='uq_competencia_nome_tipo'),
        ),
        migrations.AddConstraint(
            model_name='membrocompetencia',
            constraint=models.UniqueConstraint(fields=('membro', 'competencia'), name='uq_membro_competencia'),
        ),
        migrations.AddIndex(
            model_name='membrorede',
            index=models.Index(fields=['situacao', 'disponibilidade'], name='idx_membro_situacao_disp'),
        ),
    ]
