"""
`tipo`, `justificativa` e `autor` recebem os nomes do diagrama.

E `RenameField`, nao `RemoveField` + `AddField`: a decisao registrada e o
desfecho que a RF12 exige reconstituir seis meses depois. Recriar a coluna
apagaria exatamente o que a tabela existe para guardar.

O contrato da API nao muda: `DecisaoResumoSerializer` mapeia com `source=`, e
o front continua enviando e lendo `tipo` e `justificativa`.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('decisions', '0002_alter_decisao_table'),
    ]

    operations = [
        migrations.RenameField(
            model_name='decisao',
            old_name='tipo',
            new_name='tipo_decisao',
        ),
        migrations.RenameField(
            model_name='decisao',
            old_name='justificativa',
            new_name='observacoes',
        ),
        migrations.RenameField(
            model_name='decisao',
            old_name='autor',
            new_name='responsavel',
        ),
    ]
