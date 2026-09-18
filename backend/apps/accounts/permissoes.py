"""
Catalogo de permissoes efetivas por papel.

Fonte unica: a matriz de `CONTEXT.md` secao 3. O front consome isto em
`/auth/profile/` e em `/permissoes/catalogo/` em vez de espelhar a matriz a
mao - assim uma mudanca de escopo nao exige editar duas listas em repositorios
diferentes.

Granularidade fina (grupos, chaves por recurso) e a pendencia P8 e mexeria na
baseline v1.2: enquanto ela nao fecha, permissao = papel.
"""
from apps.accounts.models import Papel

MATRIZ = {
    'oportunidade.cadastrar_problema_externo': [Papel.DEMANDANTE],
    'oportunidade.cadastrar_ideia_interna': [Papel.SUPERVISOR],
    'oportunidade.ver_fila': [Papel.SUPERVISOR],
    'oportunidade.ver_proprias': [Papel.DEMANDANTE],
    'oportunidade.ver_da_equipe': [Papel.PESQUISADOR],
    'oportunidade.editar_contexto': [Papel.SUPERVISOR],
    'rede.cadastrar_membro': [Papel.SUPERVISOR],
    'rede.liberar_acesso': [Papel.SUPERVISOR],
    'rede.consultar': [Papel.SUPERVISOR, Papel.PESQUISADOR],
    'perfil.editar_proprio': [Papel.PESQUISADOR],
    'copiloto.executar': [Papel.SUPERVISOR],
    'competencia.derivar': [Papel.SUPERVISOR],
    'matching.executar': [Papel.SUPERVISOR],
    'equipe.ajustar': [Papel.SUPERVISOR],
    'preanalise.executar': [Papel.SUPERVISOR],
    'decisao.registrar': [Papel.SUPERVISOR],
    'painel.ver': [
        Papel.DEMANDANTE,
        Papel.PESQUISADOR,
        Papel.SUPERVISOR,
        Papel.ADMINISTRADOR,
    ],
    'conta.gerenciar': [Papel.ADMINISTRADOR],
    'configuracao.gerenciar': [Papel.ADMINISTRADOR],
    'auditoria.consultar': [Papel.ADMINISTRADOR],
}


def permissoes_do_papel(papel):
    """Lista ordenada das chaves que o papel exerce."""
    return sorted(chave for chave, papeis in MATRIZ.items() if papel in papeis)


def catalogo():
    """Catalogo completo, para a UI montar telas sem duplicar a matriz."""
    return [
        {'chave': chave, 'papeis': [str(p) for p in papeis]}
        for chave, papeis in sorted(MATRIZ.items())
    ]
