"""
A empresa demandante por tras de cada conta de Demandante Externo.

Dois contatos da mesma empresa ficam ligados a mesma organizacao: o CNPJ e a
chave, e o nome da empresa so e usado quando ela ainda nao existe.
"""
from apps.organizations.models import Organizacao, TipoOrganizacao
from core.exceptions import ConflitoDeEstado, ErroDeDominio, RecursoNaoEncontrado


def buscar_empresa_demandante(cnpj: str) -> Organizacao:
    empresa = Organizacao.objects.filter(
        cnpj=cnpj, tipo=TipoOrganizacao.DEMANDANTE
    ).first()

    if empresa is None:
        raise RecursoNaoEncontrado(
            'Nenhuma empresa cadastrada com este CNPJ.', codigo='empresa_inexistente'
        )

    return empresa


def empresa_demandante(*, cnpj: str, nome: str = '') -> Organizacao:
    """Devolve a empresa do CNPJ, criando-a quando ainda nao existe."""
    existente = Organizacao.objects.filter(cnpj=cnpj).first()

    if existente is not None:
        if existente.tipo != TipoOrganizacao.DEMANDANTE:
            raise ConflitoDeEstado(
                'Este CNPJ pertence a uma instituição da rede interna, e não a '
                'uma empresa demandante.',
                codigo='cnpj_de_instituicao',
            )
        return existente

    nome = (nome or '').strip()

    if not nome:
        raise ErroDeDominio('Informe o nome da empresa.', codigo='empresa_sem_nome')

    return Organizacao.objects.create(
        tipo=TipoOrganizacao.DEMANDANTE,
        nome=nome,
        razao_social=nome,
        cnpj=cnpj,
    )
