"""
A lacuna guarda so os campos do seu tipo.

A `natureza` e da lacuna que o Copiloto aponta na proposta; o `criterio` e da
lacuna da pre-analise. Os dois CHECKs recusam a combinacao trocada. As colunas
nasceram na 0012, e o codigo so as preenche no tipo certo: nenhuma linha
gravada fica fora da regra.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ai', '0006_rotulos_com_acento'),
        ('copilot', '0012_lacuna_natureza_criterio_e_sintese'),
        ('maturity', '0008_rotulos_com_acento'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='lacuna',
            constraint=models.CheckConstraint(condition=models.Q(('natureza__isnull', True), ('tipo', 'proposta'), _connector='OR'), name='ck_lacuna_proposta_natureza_do_copiloto'),
        ),
        migrations.AddConstraint(
            model_name='lacuna',
            constraint=models.CheckConstraint(condition=models.Q(('criterio__isnull', True), ('tipo', 'pre_analise'), _connector='OR'), name='ck_lacuna_proposta_criterio_da_pre_analise'),
        ),
    ]
