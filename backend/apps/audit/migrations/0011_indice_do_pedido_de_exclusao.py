"""
Indice parcial para o pedido de exclusao da conta.

A lista de Usuarios procura, para cada conta, o pedido na trilha. O indice
guarda so as linhas desse pedido, que sao poucas, e a consulta segue leve com a
trilha crescendo. O filtro do indice e o mesmo da consulta
(`apps/accounts/services/titular.py` e a lista de Usuarios).
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('audit', '0010_liga_eventos_as_contas'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='eventoauditoria',
            index=models.Index(condition=models.Q(('entidade', 'usuario'), ('tipo', 'exclusao_solicitada')), fields=['entidade_id', '-ocorrido_em'], name='idx_evento_pedido_exclusao'),
        ),
    ]
