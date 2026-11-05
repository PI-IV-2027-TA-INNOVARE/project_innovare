"""
Liga os eventos antigos a conta de quem agiu, pelo e-mail gravado no texto.

So os eventos a partir da criacao da conta: o e-mail pode ter sido de outra
conta antes, e a atividade dela nao e desta. A conta anonimizada nao liga nada,
porque os eventos dela ja dizem "pessoa removida".

Fica separada da 0009 para rodar na sua propria transacao. Tem `RunPython`: no
Neon vai por `manage.py migrate`, nunca pelo `scripts/neon_migrate.py`.

Um UPDATE so, e nao um por conta: cada evento acha a conta pelo indice unico do
e-mail, e a trilha e percorrida uma vez.

A volta nao desfaz nada aqui: a 0009, ao voltar, tira a coluna inteira. Zerar a
coluna apagaria tambem as ligacoes que a aplicacao fez depois.
"""
from django.db import migrations
from django.db.models import Exists, OuterRef, Subquery


def ligar_eventos_as_contas(apps, schema_editor):
    Usuario = apps.get_model('accounts', 'Usuario')
    EventoAuditoria = apps.get_model('audit', 'EventoAuditoria')

    conta = Usuario.objects.filter(
        email=OuterRef('ator'), criado_em__lte=OuterRef('ocorrido_em')
    )
    EventoAuditoria.objects.filter(conta_do_ator__isnull=True).filter(Exists(conta)).update(
        conta_do_ator_id=Subquery(conta.values('pk')[:1])
    )


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0006_rotulos_com_acento'),
        ('audit', '0009_conta_do_ator'),
    ]

    operations = [
        migrations.RunPython(ligar_eventos_as_contas, migrations.RunPython.noop),
    ]
