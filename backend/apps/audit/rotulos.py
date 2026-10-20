"""
O nome legivel de cada tipo de evento da trilha.

O `tipo` gravado e identificador estavel - filtro, busca e teste dependem dele
e ele nao muda. O rotulo e o que o Administrador le, e pode ser reescrito sem
tocar um registro sequer.

`apps/audit/tests/test_leitura_da_trilha.py` le as chamadas de
`registrar_evento` no fonte e cobra um rotulo para cada tipo gravado.
"""
from __future__ import annotations

from apps.decisions.models import TipoDecisao

ROTULOS_DO_TIPO = {
    'login': 'Entrou na plataforma',
    'login_recusado': 'Entrada recusada',
    'logout': 'Saiu da plataforma',
    'recuperacao_solicitada': 'Recuperação de senha solicitada',
    'senha_redefinida': 'Senha redefinida',
    'senha_alterada': 'Senha alterada',
    'primeiro_acesso_concluido': 'Primeiro acesso concluído',
    'conta_criada': 'Conta criada',
    'conta_atualizada': 'Conta atualizada',
    'situacao_alterada': 'Situação da conta alterada',
    'convite_reenviado': 'Convite reenviado',
    'membro_cadastrado': 'Pessoa cadastrada na rede',
    'membro_atualizado': 'Cadastro na rede atualizado',
    'perfil_atualizado': 'Perfil profissional atualizado',
    'acesso_liberado': 'Acesso liberado',
    'oportunidade_cadastrada': 'Oportunidade cadastrada',
    'contexto_atualizado': 'Contexto atualizado',
    'anexo_enviado': 'Anexo enviado',
    'complemento_solicitado': 'Complementação solicitada',
    'complementacao_enviada': 'Complementação enviada',
    'observacao_registrada': 'Observação registrada',
    'proposta_iniciada': 'Proposta iniciada',
    'proposta_atualizada': 'Proposta atualizada',
    'sessao_iniciada': 'Sessão do Copiloto iniciada',
    'sessao_concluida': 'Sessão do Copiloto concluída',
    'resposta_registrada': 'Resposta ao Copiloto registrada',
    'estruturacao_executada': 'Estruturação pelo Copiloto',
    'derivacao_executada': 'Competências derivadas pela IA',
    'competencia_adicionada': 'Competência adicionada',
    'competencia_revisada': 'Competência revisada',
    'competencia_removida': 'Competência removida',
    'membro_adicionado': 'Pessoa incluída na equipe',
    'membro_ajustado': 'Equipe ajustada',
    'equipe_validada': 'Equipe validada',
    'recomendacao_acatada': 'Recomendação acatada',
    'recomendacao_reaberta': 'Recomendação reaberta',
    'criterios_importados': 'Critérios PIPE importados',
    'teto_de_custo_excedido': 'Teto mensal de IA atingido',
    'teto_por_oportunidade_excedido': 'Limite de IA da oportunidade atingido',
    'configuracao_alterada': 'Configuração alterada',
    **{
        f'decisao_{valor}': f'Decisão: {rotulo}'
        for valor, rotulo in TipoDecisao.choices
    },
}

ROTULOS_POR_ENTIDADE = {
    ('execucao', 'equipe_potencial'): 'Matching executado',
    ('execucao', 'pre_analise_maturidade'): 'Pré-análise executada',
}
"""O mesmo `tipo` em entidades diferentes, quando ele sozinho nao diz o que foi."""

TIPOS_DINAMICOS = [
    (f'decisao_{valor}', 'oportunidade') for valor in TipoDecisao.values
]
"""Tipos montados em tempo de execucao, que a leitura do fonte nao alcanca."""

ROTINA_OCULTA = ('login', 'logout')
"""
Entrada e saida bem-sucedidas: a maior parte da trilha e nenhuma informacao
sobre o fluxo. Aparecem so quando o filtro e "Conta e acesso".
"""


def rotulo_do_tipo(tipo: str, entidade: str = '') -> str:
    """O rotulo do evento, ou o proprio `tipo` quando ainda nao ha rotulo."""
    return ROTULOS_POR_ENTIDADE.get((tipo, entidade)) or ROTULOS_DO_TIPO.get(tipo, tipo)
