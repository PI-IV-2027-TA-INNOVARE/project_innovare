"""
A criacao de conta por papel, como Factory Method (Padroes de Projeto §4.1).

Cada papel que o Administrador provisiona tem um criador: o que ele prepara
antes de a conta existir e o que completa depois dela. O Pesquisador nao tem
criador aqui, porque nasce do cadastro na rede interna, feito pelo Supervisor
(RN-A04). Pedir a fabrica um papel sem criador e recusado num lugar so.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from apps.accounts.models import DemandanteExterno, Papel, Usuario
from apps.audit.models import CategoriaEvento
from apps.audit.services import registrar_evento
from apps.network.models import MembroRede, PapelNaRede, SituacaoMembro
from apps.organizations.services.empresas import empresa_demandante
from core.exceptions import ErroDeDominio

if TYPE_CHECKING:
    from apps.organizations.models import Organizacao


class CriadorDeConta:
    """O que todo papel faz: nada antes e nada depois. Cada criador muda so o que precisa."""

    papel: str = ''

    def preparar(
        self,
        *,
        nome: str,
        organizacao: Organizacao | None,
        cnpj: str | None,
        nome_empresa: str,
    ) -> tuple[str, Organizacao | None]:
        return nome, organizacao

    def completar(
        self,
        *,
        usuario: Usuario,
        organizacao: Organizacao | None,
        ator: Usuario,
    ) -> None:
        return None


class CriadorDeDemandante(CriadorDeConta):
    """O Demandante e a empresa: entra ligado a ela, com o nome dela, e ganha o perfil."""

    papel = Papel.DEMANDANTE

    def preparar(
        self,
        *,
        nome: str,
        organizacao: Organizacao | None,
        cnpj: str | None,
        nome_empresa: str,
    ) -> tuple[str, Organizacao | None]:
        if not cnpj:
            raise ErroDeDominio('Informe o CNPJ da empresa.', codigo='demandante_sem_empresa')

        empresa = empresa_demandante(cnpj=cnpj, nome=nome_empresa)
        return empresa.nome, empresa

    def completar(
        self,
        *,
        usuario: Usuario,
        organizacao: Organizacao | None,
        ator: Usuario,
    ) -> None:
        DemandanteExterno.objects.create(usuario=usuario)


class CriadorDeSupervisor(CriadorDeConta):
    """O Supervisor tambem integra a rede interna, porque o matching o sugere para a supervisao."""

    papel = Papel.SUPERVISOR

    def completar(
        self,
        *,
        usuario: Usuario,
        organizacao: Organizacao | None,
        ator: Usuario,
    ) -> None:
        if MembroRede.objects.com_email(usuario.email).exists():
            return None

        membro = MembroRede.objects.create(
            usuario=usuario,
            papel_rede=PapelNaRede.SUPERVISOR,
            organizacao=organizacao,
            experiencia='',
            situacao=SituacaoMembro.ATIVO,
            cadastrado_por=ator,
        )

        registrar_evento(
            categoria=CategoriaEvento.REDE,
            tipo='membro_cadastrado',
            entidade='membro_rede',
            entidade_id=membro.id_membro,
            ator=getattr(ator, 'email', str(ator)),
            detalhe={'papel_rede': membro.papel_rede, 'origem': 'provisionamento_admin'},
        )
        return None


class CriadorDeAdministrador(CriadorDeConta):
    """O Administrador opera a plataforma e nao tem perfil nem lugar na rede."""

    papel = Papel.ADMINISTRADOR


CRIADORES: dict[str, CriadorDeConta] = {
    criador.papel: criador
    for criador in (CriadorDeDemandante(), CriadorDeSupervisor(), CriadorDeAdministrador())
}

PAPEIS_PROVISIONAVEIS = tuple(CRIADORES)


def criador_de_conta(papel: str) -> CriadorDeConta:
    criador = CRIADORES.get(papel)

    if criador is None:
        raise ErroDeDominio(
            'Conta de Pesquisador nasce do cadastro na rede interna, feito '
            'pelo Supervisor. Use a rede interna.',
            codigo='papel_nao_provisionavel',
        )

    return criador
