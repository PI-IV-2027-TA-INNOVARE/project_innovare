"""
A trilha passa a guardar a conta de quem agiu (`id_ator`), ao lado do texto.

O texto continua: e o que a tela mostra, e o unico que existe para o sistema e
para o e-mail digitado numa entrada recusada. A coluna nasce vazia; a 0010 liga
os eventos antigos as contas. Apagar a conta deixa o evento sem a ligacao.
"""
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ai', '0006_rotulos_com_acento'),
        ('audit', '0008_tabelas_e_colunas_do_diagrama'),
        ('opportunities', '0006_anexo_com_codigo_aleatorio'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='eventoauditoria',
            name='conta_do_ator',
            field=models.ForeignKey(blank=True, db_column='id_ator', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='eventos_como_ator', to=settings.AUTH_USER_MODEL),
        ),
    ]
