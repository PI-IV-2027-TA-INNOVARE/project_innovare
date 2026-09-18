"""
Builders de dados para os testes.

Um teste deve declarar *so o que importa para ele*. `UsuarioBuilder().demandante()
.na_organizacao(org).build()` diz que o caso precisa de um Demandante vinculado;
o resto - nome, e-mail unico, senha, situacao - o builder resolve com padrao
valido. Quando um campo obrigatorio nascer no model, muda-se o builder, nao os
testes que nao falam daquele campo.

Os padroes respeitam as invariantes de banco: organizacao demandante nasce com
CNPJ (`ck_organizacao_demandante_tem_cnpj`) e oportunidade externa nasce com
demandante (`ck_oportunidade_origem_demandante`).

Nada aqui toca rede, SMTP ou provedor externo (AGENTS.md 0.1): e tudo ORM
contra o banco de teste.
"""
from __future__ import annotations

from itertools import count

from django.utils import timezone

from apps.accounts.models import Papel, SituacaoConta, Usuario
from apps.network.models import (
    Competencia,
    DeclaradoPor,
    Disponibilidade,
    MembroCompetencia,
    MembroRede,
    PapelNaRede,
    SituacaoMembro,
    TipoCompetencia,
    Titulacao,
)
from apps.opportunities.models import (
    Oportunidade,
    OrigemOportunidade,
    SequenciaCodigo,
    SituacaoOportunidade,
)
from apps.organizations.models import Organizacao, TipoOrganizacao

SENHA_PADRAO = 'Bioinsumo!2026'

_contador = count(1)

TITULACOES_PADRAO = {
    'graduacao': ('Graduacao', 1),
    'especializacao': ('Especializacao', 2),
    'mestrado': ('Mestrado', 3),
    'doutorado': ('Doutorado', 4),
    'pos_doutorado': ('Pos-doutorado', 5),
}


def _sufixo() -> int:
    """Torna unico o que o banco exige unico: e-mail, CNPJ, codigo."""
    return next(_contador)


def titulacao(codigo: str = 'doutorado') -> Titulacao:
    """A titulacao do vocabulario controlado, criada sob demanda (RF07 / P12)."""
    rotulo, nivel = TITULACOES_PADRAO.get(codigo, (codigo.capitalize(), 1))
    registro, _ = Titulacao.objects.get_or_create(
        codigo=codigo, defaults={'rotulo': rotulo, 'nivel': nivel}
    )
    return registro


class UsuarioBuilder:
    """Conta de acesso. O padrao e um Supervisor ativo com senha utilizavel."""

    def __init__(self) -> None:
        self._papel: str = Papel.SUPERVISOR
        self._nome = 'Pessoa de teste'
        self._email: str | None = None
        self._senha: str | None = SENHA_PADRAO
        self._organizacao: Organizacao | None = None
        self._situacao: str = SituacaoConta.ATIVO
        self._opera_o_django = False

    def administrador(self) -> UsuarioBuilder:
        self._papel = Papel.ADMINISTRADOR
        return self

    def supervisor(self) -> UsuarioBuilder:
        self._papel = Papel.SUPERVISOR
        return self

    def pesquisador(self) -> UsuarioBuilder:
        self._papel = Papel.PESQUISADOR
        return self

    def demandante(self) -> UsuarioBuilder:
        self._papel = Papel.DEMANDANTE
        return self

    def chamado(self, nome: str) -> UsuarioBuilder:
        self._nome = nome
        return self

    def com_email(self, email: str) -> UsuarioBuilder:
        self._email = email
        return self

    def com_senha(self, senha: str) -> UsuarioBuilder:
        self._senha = senha
        return self

    def sem_senha_utilizavel(self) -> UsuarioBuilder:
        """Como a conta nasce no provisionamento: so o convite define a senha."""
        self._senha = None
        return self

    def na_organizacao(self, organizacao: Organizacao) -> UsuarioBuilder:
        self._organizacao = organizacao
        return self

    def inativo(self) -> UsuarioBuilder:
        self._situacao = SituacaoConta.INATIVO
        return self

    def suspenso(self) -> UsuarioBuilder:
        self._situacao = SituacaoConta.SUSPENSO
        return self

    def operador_do_django(self) -> UsuarioBuilder:
        """`acesso_admin_django` ligado - quem entra no `/admin/`."""
        self._opera_o_django = True
        self._papel = Papel.ADMINISTRADOR
        return self

    def build(self) -> Usuario:
        email = self._email or f'{self._papel}.{_sufixo()}@ac2microbiologia.com.br'
        criar = (
            Usuario.objects.create_superuser
            if self._opera_o_django
            else Usuario.objects.create_user
        )

        usuario = criar(
            email=email,
            nome=self._nome,
            papel=self._papel,
            password=self._senha,
            organizacao=self._organizacao,
        )

        if usuario.situacao != self._situacao:
            usuario.situacao = self._situacao
            usuario.save(update_fields=['situacao', 'atualizado_em'])

        return usuario


class OrganizacaoBuilder:
    """Vinculo institucional. O padrao e instituicao, que dispensa CNPJ."""

    def __init__(self) -> None:
        self._tipo: str = TipoOrganizacao.INSTITUICAO
        self._nome = 'Instituicao de teste'
        self._cnpj: str | None = None
        self._municipio: str | None = None
        self._uf: str | None = None
        self._ativa = True

    def demandante(self) -> OrganizacaoBuilder:
        self._tipo = TipoOrganizacao.DEMANDANTE
        return self

    def instituicao(self) -> OrganizacaoBuilder:
        self._tipo = TipoOrganizacao.INSTITUICAO
        return self

    def chamada(self, nome: str) -> OrganizacaoBuilder:
        self._nome = nome
        return self

    def com_cnpj(self, cnpj: str) -> OrganizacaoBuilder:
        self._cnpj = cnpj
        return self

    def em(self, municipio: str, uf: str) -> OrganizacaoBuilder:
        self._municipio = municipio
        self._uf = uf
        return self

    def inativa(self) -> OrganizacaoBuilder:
        self._ativa = False
        return self

    def build(self) -> Organizacao:
        cnpj = self._cnpj

        if cnpj is None and self._tipo == TipoOrganizacao.DEMANDANTE:
            cnpj = f'{_sufixo():014d}'

        return Organizacao.objects.create(
            tipo=self._tipo,
            nome=self._nome,
            cnpj=cnpj,
            municipio=self._municipio,
            uf=self._uf,
            ativo=self._ativa,
        )


class MembroRedeBuilder:
    """
    Pessoa da rede interna. O padrao e um Pesquisador `sem_acesso`, que e como
    o cadastro do Supervisor nasce antes da liberacao (RN-A04).
    """

    def __init__(self) -> None:
        self._papel_rede: str = PapelNaRede.PESQUISADOR
        self._nome = 'Membro de teste'
        self._email: str | None = None
        self._titulacao: Titulacao | None = None
        self._organizacao: Organizacao | None = None
        self._disponibilidade: str = Disponibilidade.PARCIAL
        self._experiencia = ''
        self._usuario: Usuario | None = None
        self._liberar_acesso = False
        self._competencias: list[tuple[str, str]] = []

    def supervisor(self) -> MembroRedeBuilder:
        self._papel_rede = PapelNaRede.SUPERVISOR
        return self

    def pesquisador(self) -> MembroRedeBuilder:
        self._papel_rede = PapelNaRede.PESQUISADOR
        return self

    def colaborador(self) -> MembroRedeBuilder:
        self._papel_rede = PapelNaRede.COLABORADOR
        return self

    def graduando(self) -> MembroRedeBuilder:
        self._papel_rede = PapelNaRede.GRADUANDO
        return self

    def chamado(self, nome: str) -> MembroRedeBuilder:
        self._nome = nome
        return self

    def com_email(self, email: str) -> MembroRedeBuilder:
        self._email = email
        return self

    def com_titulacao(self, codigo: str = 'doutorado') -> MembroRedeBuilder:
        self._titulacao = titulacao(codigo)
        return self

    def na_organizacao(self, organizacao: Organizacao) -> MembroRedeBuilder:
        self._organizacao = organizacao
        return self

    def integral(self) -> MembroRedeBuilder:
        self._disponibilidade = Disponibilidade.INTEGRAL
        return self

    def indisponivel(self) -> MembroRedeBuilder:
        self._disponibilidade = Disponibilidade.INDISPONIVEL
        return self

    def com_experiencia(self, texto: str) -> MembroRedeBuilder:
        self._experiencia = texto
        return self

    def com_competencia(self, nome: str) -> MembroRedeBuilder:
        self._competencias.append((nome, TipoCompetencia.COMPETENCIA))
        return self

    def com_tecnica(self, nome: str) -> MembroRedeBuilder:
        self._competencias.append((nome, TipoCompetencia.TECNICA))
        return self

    def com_linha_de_pesquisa(self, nome: str) -> MembroRedeBuilder:
        self._competencias.append((nome, TipoCompetencia.LINHA_PESQUISA))
        return self

    def com_acesso(self, usuario: Usuario | None = None) -> MembroRedeBuilder:
        """Liga o membro a uma conta - o efeito de `liberar-acesso/` (PB08)."""
        self._usuario = usuario
        self._liberar_acesso = True
        return self

    def build(self) -> MembroRede:
        email = self._email or f'membro.{_sufixo()}@ac2microbiologia.com.br'
        usuario = self._usuario

        if self._liberar_acesso and usuario is None:
            conta = UsuarioBuilder().chamado(self._nome).com_email(email)

            if self._papel_rede == PapelNaRede.SUPERVISOR:
                conta.supervisor()
            else:
                conta.pesquisador()

            if self._organizacao is not None:
                conta.na_organizacao(self._organizacao)

            usuario = conta.build()

        membro = MembroRede.objects.create(
            nome=self._nome,
            email=email,
            papel_rede=self._papel_rede,
            titulacao=self._titulacao,
            organizacao=self._organizacao,
            disponibilidade=self._disponibilidade,
            experiencia=self._experiencia,
            usuario=usuario,
            situacao=(
                SituacaoMembro.ATIVO if usuario else SituacaoMembro.SEM_ACESSO
            ),
        )

        for nome, tipo in self._competencias:
            competencia, _ = Competencia.objects.get_or_create(nome=nome, tipo=tipo)
            MembroCompetencia.objects.get_or_create(
                membro=membro,
                competencia=competencia,
                defaults={'declarado_por': DeclaradoPor.SUPERVISOR},
            )

        return membro


class OportunidadeBuilder:
    """
    O registro central. O padrao e ideia interna em `entrada`.

    O codigo sai de `SequenciaCodigo.proximo_codigo`, o mesmo caminho da
    producao: o teste nao inventa `OP-2026-001` na mao e nao esbarra no unique.
    """

    def __init__(self) -> None:
        self._titulo = 'Oportunidade de teste'
        self._origem: str = OrigemOportunidade.INTERNA
        self._demandante: Organizacao | None = None
        self._criado_por: Usuario | None = None
        self._responsavel: MembroRede | None = None
        self._situacao: str = SituacaoOportunidade.ENTRADA
        self._resumo = ''
        self._contexto = ''

    def interna(self) -> OportunidadeBuilder:
        """Ideia interna: nasce do Supervisor e nao tem demandante (RN-A03)."""
        self._origem = OrigemOportunidade.INTERNA
        self._demandante = None
        return self

    def externa(self, demandante: Organizacao | None = None) -> OportunidadeBuilder:
        """Problema externo: exige organizacao demandante (D01)."""
        self._origem = OrigemOportunidade.EXTERNO
        self._demandante = demandante
        return self

    def intitulada(self, titulo: str) -> OportunidadeBuilder:
        self._titulo = titulo
        return self

    def criada_por(self, usuario: Usuario) -> OportunidadeBuilder:
        self._criado_por = usuario
        return self

    def conduzida_por(self, membro: MembroRede) -> OportunidadeBuilder:
        self._responsavel = membro
        return self

    def com_contexto(self, contexto: str, resumo: str = '') -> OportunidadeBuilder:
        self._contexto = contexto
        self._resumo = resumo
        return self

    def na_situacao(self, situacao: str) -> OportunidadeBuilder:
        self._situacao = situacao
        return self

    def aguardando_decisao(self) -> OportunidadeBuilder:
        self._situacao = SituacaoOportunidade.AGUARDANDO_DECISAO
        return self

    def em_revisao(self) -> OportunidadeBuilder:
        self._situacao = SituacaoOportunidade.REVISAR
        return self

    def arquivada(self) -> OportunidadeBuilder:
        self._situacao = SituacaoOportunidade.ARQUIVADA
        return self

    def build(self) -> Oportunidade:
        demandante = self._demandante

        if self._origem == OrigemOportunidade.EXTERNO and demandante is None:
            demandante = OrganizacaoBuilder().demandante().build()

        return Oportunidade.objects.create(
            codigo=SequenciaCodigo.proximo_codigo(timezone.now().year),
            titulo=self._titulo,
            origem=self._origem,
            resumo=self._resumo,
            contexto=self._contexto,
            demandante=demandante,
            criado_por=self._criado_por,
            responsavel=self._responsavel,
            situacao=self._situacao,
        )
