"""
A pre-analise passa a pender da proposta, nao da oportunidade.

O diagrama do Arquiteto escreve `criar(propostaId)`. A pre-analise avalia a
proposta - nao a oportunidade - e pendurada na oportunidade ela nao diz o que
avaliou.

`versao_proposta` permanece: enquanto D-04 nao for decidido, a proposta e
sobrescrita com `versao + 1` na mesma linha, entao apontar para ela ainda nao
congela qual versao foi analisada. A coluna sai no dia em que houver uma linha
por versao.
"""
import django.db.models.deletion
from django.db import migrations, models

from core.migracoes import exigir_tabela_vazia


class Migration(migrations.Migration):

    dependencies = [
        ('maturity', '0002_alter_criteriopreanalise_table_and_more'),
        ('copilot', '0004_remove_lacuna_competencia_necessaria_and_more'),
    ]

    operations = [
        migrations.RunPython(
            exigir_tabela_vazia(
                'maturity',
                'PreAnalise',
                'tem de onde tirar o id_proposta das linhas ja gravadas',
            ),
            migrations.RunPython.noop,
        ),
        migrations.RemoveField(
            model_name='preanalise',
            name='oportunidade',
        ),
        migrations.AddField(
            model_name='preanalise',
            name='proposta',
            field=models.ForeignKey(
                db_column='id_proposta',
                default=None,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='pre_analises',
                to='copilot.propostaestruturada',
            ),
            preserve_default=False,
        ),
    ]
