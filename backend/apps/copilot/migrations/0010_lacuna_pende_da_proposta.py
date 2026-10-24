"""
A lacuna passa a pender da proposta, nao da oportunidade (caso 16).

A lacuna e calculada sobre a proposta - um elemento vazio ou fraco -, e a
proposta ja existe quando ela nasce: o Copiloto cria a proposta antes de
abrir lacuna, e a pre-analise so roda sobre proposta. E o mesmo passo que
`Competencia_Necessaria` e `Pre_Analise_Maturidade` ja deram.

A conversao e de ida e volta: na ida cada lacuna recebe a proposta da sua
oportunidade (a proposta e 1:1 com ela); na volta, a oportunidade da sua
proposta. Lacuna de oportunidade sem proposta nao tem para onde ir - a guarda
recusa a migration antes de escrever qualquer coisa e diz quantas sao.
"""
import django.db.models.deletion
from django.db import migrations, models
from django.db.models import OuterRef, Subquery

from core.migracoes import MigrationExigeTabelaVazia


def ligar_a_proposta(apps, schema_editor):
    Lacuna = apps.get_model('copilot', 'Lacuna')
    PropostaEstruturada = apps.get_model('copilot', 'PropostaEstruturada')

    com_proposta = PropostaEstruturada.objects.values('oportunidade_id')
    orfas = Lacuna.objects.exclude(oportunidade_id__in=com_proposta).count()

    if orfas:
        raise MigrationExigeTabelaVazia(
            f'copilot.Lacuna tem {orfas} registro(s) de oportunidade sem '
            f'proposta, e esta migration nao tem para qual proposta move-los.\n'
            f'Nada foi alterado. Decida o destino dessas lacunas antes de '
            f'repetir o migrate.'
        )

    Lacuna.objects.update(
        proposta_id=Subquery(
            PropostaEstruturada.objects.filter(
                oportunidade_id=OuterRef('oportunidade_id')
            ).values('pk')[:1]
        )
    )


def ligar_a_oportunidade(apps, schema_editor):
    Lacuna = apps.get_model('copilot', 'Lacuna')
    PropostaEstruturada = apps.get_model('copilot', 'PropostaEstruturada')

    Lacuna.objects.update(
        oportunidade_id=Subquery(
            PropostaEstruturada.objects.filter(pk=OuterRef('proposta_id')).values(
                'oportunidade_id'
            )[:1]
        )
    )


class Migration(migrations.Migration):

    dependencies = [
        ('copilot', '0009_objetivo_especifico'),
        ('opportunities', '0004_tabelas_e_colunas_do_diagrama'),
    ]

    operations = [
        migrations.AddField(
            model_name='lacuna',
            name='proposta',
            field=models.ForeignKey(db_column='id_proposta', null=True, on_delete=django.db.models.deletion.CASCADE, related_name='lacunas', to='copilot.propostaestruturada'),
        ),
        migrations.AlterField(
            model_name='lacuna',
            name='oportunidade',
            field=models.ForeignKey(db_column='id_oportunidade', null=True, on_delete=django.db.models.deletion.CASCADE, related_name='lacunas', to='opportunities.oportunidade'),
        ),
        migrations.RunPython(ligar_a_proposta, ligar_a_oportunidade),
        migrations.RemoveIndex(
            model_name='lacuna',
            name='idx_lacuna_oport_tipo',
        ),
        migrations.RemoveField(
            model_name='lacuna',
            name='oportunidade',
        ),
        migrations.AlterField(
            model_name='lacuna',
            name='proposta',
            field=models.ForeignKey(db_column='id_proposta', on_delete=django.db.models.deletion.CASCADE, related_name='lacunas', to='copilot.propostaestruturada'),
        ),
        migrations.AddIndex(
            model_name='lacuna',
            index=models.Index(fields=['proposta', 'tipo', 'resolvida'], name='idx_lacuna_proposta_tipo'),
        ),
    ]
