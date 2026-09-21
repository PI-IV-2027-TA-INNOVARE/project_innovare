import apps.accounts.managers
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('auth', '0012_alter_user_first_name_max_length'),
        ('organizations', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Usuario',
            fields=[
                ('last_login', models.DateTimeField(blank=True, null=True, verbose_name='last login')),
                ('is_superuser', models.BooleanField(default=False, help_text='Designates that this user has all permissions without explicitly assigning them.', verbose_name='superuser status')),
                ('criado_em', models.DateTimeField(auto_now_add=True, db_column='criado_em')),
                ('atualizado_em', models.DateTimeField(auto_now=True, db_column='atualizado_em')),
                ('id_usuario', models.BigAutoField(db_column='id_usuario', primary_key=True, serialize=False)),
                ('nome', models.CharField(db_column='nome', max_length=160)),
                ('email', models.EmailField(db_column='email', max_length=254, unique=True)),
                ('password', models.CharField(db_column='senha', max_length=128)),
                ('papel', models.CharField(choices=[('demandante', 'Demandante Externo'), ('pesquisador', 'Pesquisador'), ('supervisor', 'Supervisor'), ('administrador', 'Administrador')], db_column='papel', max_length=20)),
                ('situacao', models.CharField(choices=[('ativo', 'Ativo'), ('inativo', 'Inativo'), ('suspenso', 'Suspenso')], db_column='situacao', default='ativo', max_length=10)),
                ('ultimo_acesso', models.DateTimeField(blank=True, db_column='ultimo_acesso', null=True)),
                ('is_staff', models.BooleanField(db_column='acesso_admin_django', default=False)),
                ('groups', models.ManyToManyField(blank=True, help_text='The groups this user belongs to. A user will get all permissions granted to each of their groups.', related_name='user_set', related_query_name='user', to='auth.group', verbose_name='groups')),
                ('organizacao', models.ForeignKey(blank=True, db_column='id_organizacao', null=True, on_delete=django.db.models.deletion.PROTECT, related_name='usuarios', to='organizations.organizacao')),
                ('user_permissions', models.ManyToManyField(blank=True, help_text='Specific permissions for this user.', related_name='user_set', related_query_name='user', to='auth.permission', verbose_name='user permissions')),
            ],
            options={
                'verbose_name': 'usuario',
                'verbose_name_plural': 'usuarios',
                'db_table': 'usuario',
            },
            managers=[
                ('objects', apps.accounts.managers.UsuarioManager()),
            ],
        ),
        migrations.CreateModel(
            name='TokenAcesso',
            fields=[
                ('id_token', models.BigAutoField(db_column='id_token', primary_key=True, serialize=False)),
                ('token', models.CharField(db_column='token', max_length=255, unique=True)),
                ('finalidade', models.CharField(choices=[('recuperacao', 'Recuperacao de senha'), ('convite', 'Primeiro acesso')], db_column='finalidade', default='recuperacao', max_length=12)),
                ('expira_em', models.DateTimeField(db_column='expira_em')),
                ('usado_em', models.DateTimeField(blank=True, db_column='usado_em', null=True)),
                ('criado_em', models.DateTimeField(auto_now_add=True, db_column='criado_em')),
                ('usuario', models.ForeignKey(db_column='id_usuario', on_delete=django.db.models.deletion.CASCADE, related_name='tokens_acesso', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'token_acesso',
            },
        ),
        migrations.AddIndex(
            model_name='usuario',
            index=models.Index(fields=['papel', 'situacao'], name='idx_usuario_papel_situacao'),
        ),
        migrations.AddIndex(
            model_name='tokenacesso',
            index=models.Index(fields=['usuario', 'finalidade'], name='idx_token_usuario_final'),
        ),
    ]
