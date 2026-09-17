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
            name='Notificacao',
            fields=[
                ('id_notificacao', models.BigAutoField(db_column='id_notificacao', primary_key=True, serialize=False)),
                ('tipo', models.CharField(db_column='tipo', max_length=60)),
                ('titulo', models.CharField(db_column='titulo', max_length=200)),
                ('mensagem', models.TextField(db_column='mensagem')),
                ('entidade', models.CharField(blank=True, db_column='entidade', default='', max_length=60)),
                ('entidade_id', models.CharField(blank=True, db_column='entidade_id', default='', max_length=60)),
                ('lida_em', models.DateTimeField(blank=True, db_column='lida_em', null=True)),
                ('criado_em', models.DateTimeField(auto_now_add=True, db_column='criado_em')),
                ('usuario', models.ForeignKey(db_column='id_usuario', on_delete=django.db.models.deletion.CASCADE, related_name='notificacoes', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name_plural': 'notificacoes',
                'db_table': 'notificacao',
                'ordering': ['-criado_em'],
                'indexes': [models.Index(fields=['usuario', 'lida_em'], name='idx_notif_usuario_lida')],
            },
        ),
    ]
