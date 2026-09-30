"""
A competencia necessaria passa a pender da proposta, nao da oportunidade.

O diagrama do Arquiteto escreve `criar(propostaId, competenciaId,
nivelImportancia)`. Como `proposta_estruturada` e OneToOne com a oportunidade,
as duas FKs identificam a mesma linha - o que muda e de qual *versao* da
proposta a competencia foi derivada, e so a proposta tem `versao`.

E RemoveField + AddField, e nao uma conversao, porque nao ha de onde tirar o
`id_proposta` de uma linha antiga: nem toda oportunidade tem proposta. A tabela
esta vazia nos ambientes em que esta migration roda pela primeira vez, e a
guarda no topo recusa a execucao onde isso nao for verdade.
"""
import django.db.models.deletion
from django.db import migrations, models

from core.migracoes import exigir_tabela_vazia


class Migration(migrations.Migration):

    dependencies = [
        ('competencies', '0001_initial'),
        ('copilot', '0004_remove_lacuna_competencia_necessaria_and_more'),
    ]

    operations = [
        migrations.RunPython(
            exigir_tabela_vazia(
                'competencies',
                'CompetenciaNecessaria',
                'tem de onde tirar o id_proposta das linhas ja gravadas',
            ),
            migrations.RunPython.noop,
        ),
        migrations.RemoveConstraint(
            model_name='competencianecessaria',
            name='uq_competencia_necessaria_oport_desc',
        ),
        migrations.RemoveField(
            model_name='competencianecessaria',
            name='oportunidade',
        ),
        migrations.AddField(
            model_name='competencianecessaria',
            name='proposta',
            field=models.ForeignKey(
                db_column='id_proposta',
                default=None,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='competencias_necessarias',
                to='copilot.propostaestruturada',
            ),
            preserve_default=False,
        ),
        migrations.AddConstraint(
            model_name='competencianecessaria',
            constraint=models.UniqueConstraint(
                fields=('proposta', 'descricao'),
                name='uq_competencia_necessaria_prop_desc',
            ),
        ),
    ]
