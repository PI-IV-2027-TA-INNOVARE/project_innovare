"""
Nome e e-mail do membro da rede ficam num lugar so (desvio 2 da 3FN).

Com conta, `Membro_Rede.nome` e `email` copiavam `Usuario.nome` e `email`, e
dois servicos sincronizavam as copias a mao. Agora eles moram no membro so
enquanto nao ha conta; liberado o acesso, moram na conta e as colunas daqui
ficam nulas. Um CHECK impede os dois lugares preenchidos - ou nenhum.

A conversao e de ida e volta: na ida, quem tem conta perde a copia (a conta e
a fonte, porque o e-mail dela e o login); na volta, a copia e refeita a partir
da conta.

`id_usuario` passa de SET_NULL para PROTECT: apagar a conta deixaria o membro
sem nome nem e-mail, o que o CHECK recusa. Nenhum caminho da aplicacao apaga
conta - a saida e inativar.
"""
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def esvaziar_copia_de_quem_tem_conta(apps, schema_editor):
    MembroRede = apps.get_model('network', 'MembroRede')
    MembroRede.objects.filter(usuario__isnull=False).update(
        nome_sem_conta=None, email_sem_conta=None
    )


def refazer_copia_a_partir_da_conta(apps, schema_editor):
    MembroRede = apps.get_model('network', 'MembroRede')

    for membro in MembroRede.objects.filter(usuario__isnull=False).select_related(
        'usuario'
    ):
        membro.nome_sem_conta = membro.usuario.nome
        membro.email_sem_conta = membro.usuario.email
        membro.save(update_fields=['nome_sem_conta', 'email_sem_conta'])


class Migration(migrations.Migration):

    dependencies = [
        ('network', '0006_tabelas_e_colunas_do_diagrama'),
        ('accounts', '0005_tabelas_com_inicial_maiuscula'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RenameField(
            model_name='membrorede',
            old_name='nome',
            new_name='nome_sem_conta',
        ),
        migrations.RenameField(
            model_name='membrorede',
            old_name='email',
            new_name='email_sem_conta',
        ),
        migrations.AlterField(
            model_name='membrorede',
            name='nome_sem_conta',
            field=models.CharField(blank=True, db_column='nome', max_length=160, null=True),
        ),
        migrations.AlterField(
            model_name='membrorede',
            name='email_sem_conta',
            field=models.EmailField(blank=True, db_column='email', max_length=254, null=True, unique=True),
        ),
        migrations.RunPython(
            esvaziar_copia_de_quem_tem_conta,
            refazer_copia_a_partir_da_conta,
        ),
        migrations.AlterField(
            model_name='membrorede',
            name='usuario',
            field=models.OneToOneField(blank=True, db_column='id_usuario', null=True, on_delete=django.db.models.deletion.PROTECT, related_name='membro_rede', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddConstraint(
            model_name='membrorede',
            constraint=models.CheckConstraint(condition=models.Q(models.Q(('email_sem_conta__isnull', False), ('nome_sem_conta__isnull', False), ('usuario__isnull', True)), models.Q(('email_sem_conta__isnull', True), ('nome_sem_conta__isnull', True), ('usuario__isnull', False)), _connector='OR'), name='ck_membro_rede_nome_email_sem_conta'),
        ),
    ]
