"""
Os direitos do titular dos dados (LGPD, art. 18): copia e exclusao.

A pessoa baixa a copia do que o sistema guarda sobre ela e pede a exclusao pelo
proprio perfil. Quem atende e o Administrador, anonimizando a conta: o nome, o
e-mail, o telefone e o perfil da rede deixam de identificar a pessoa, e a
trilha passa a dizer "pessoa removida" onde dizia o nome ou o e-mail.

A trilha e append-only (RF12). A anonimizacao e uma das excecoes - a outra e a
retencao programada (`apps/audit/services/retencao.py`) - e troca quem agiu,
nunca o que aconteceu, quando nem em qual oportunidade. Apagar os eventos
apagaria a historia das oportunidades de outras pessoas e empresas.
"""
from __future__ import annotations

import json
import re
from typing import Any

from django.db import transaction
from django.db.models import Q, TextField
from django.db.models.functions import Cast
from django.utils import timezone

from apps.accounts.models import DemandanteExterno, SituacaoConta, TokenAcesso, Usuario
from apps.accounts.services.acesso import encerrar_sessoes
from apps.ai.models import ExecucaoIA
from apps.audit.models import CategoriaEvento, EventoAuditoria
from apps.audit.rotulos import rotulo_do_tipo
from apps.audit.services import registrar_evento
from apps.copilot.models import Lacuna
from apps.matching.models import ExecucaoMatching, MembroEquipe, VetorMembro
from apps.maturity.models import PreAnalise, PreAnaliseDimensao, Recomendacao
from apps.network.models import MembroRede, SituacaoMembro
from apps.notifications.models import Notificacao
from core.exceptions import AcaoNaoPermitida, ConflitoDeEstado

PESSOA_REMOVIDA = 'pessoa removida'
NOME_ANONIMO = 'Pessoa removida'
DOMINIO_ANONIMO = 'anonimizado.invalid'
"""
`.invalid` e reservado (RFC 2606): nenhum e-mail para la e entregue, e o
endereco continua unico, como a coluna exige.
"""

CAMPOS_DE_PESSOA = frozenset({'email', 'emails', 'autor_nome'})
"""As chaves do `detalhe` que guardam quem e a pessoa, em qualquer evento."""

CAMPOS_DA_PROPRIA_CONTA = CAMPOS_DE_PESSOA | {'nome', 'de', 'para'}
"""
Nos eventos sobre a conta ou o perfil da propria pessoa, tambem o nome e o
de/para de uma edicao antiga. Fora deles, `nome` pode ser o de um arquivo, e o
valor igual ao nome da pessoa e coincidencia, nao ela.
"""

TEXTOS_DA_IA = (
    (MembroEquipe, ('justificativa', 'match_reasons')),
    (PreAnalise, ('sintese',)),
    (PreAnaliseDimensao, ('avaliacao', 'evidencias')),
    (Recomendacao, ('texto',)),
    (Lacuna, ('descricao', 'recomendacao')),
)
"""
Onde a resposta da IA e gravada com o nome no lugar do apelido
(`apps.ai.services.apelidos`).
"""


def anonimizada(usuario: Usuario) -> bool:
    return usuario.email.endswith(f'@{DOMINIO_ANONIMO}')


def _data(valor) -> str | None:
    return valor.isoformat() if valor else None


def _perfil_na_rede(membro: MembroRede | None) -> dict[str, Any] | None:
    if membro is None:
        return None

    return {
        'papel_na_rede': membro.get_papel_rede_display(),
        'situacao_na_rede': membro.get_situacao_display(),
        'instituicao': getattr(membro.organizacao, 'nome', None),
        'titulacao': getattr(membro.titulacao, 'rotulo', None),
        'disponibilidade': membro.get_disponibilidade_display(),
        'experiencia': membro.experiencia,
        'competencias': sorted(competencia.nome for competencia in membro.competencias.all()),
        'formacao': [
            {
                'curso': formacao.curso,
                'instituicao': formacao.instituicao,
                'ano_conclusao': formacao.ano_conclusao,
            }
            for formacao in membro.formacoes.all()
        ],
    }


def _sobre_a_pessoa(usuario: Usuario, membro: MembroRede | None) -> Q:
    alvo = Q(entidade='usuario', entidade_id=str(usuario.pk))

    if membro is not None:
        alvo |= Q(entidade='membro_rede', entidade_id=str(membro.pk))

    return alvo


def _indicacoes(usuario: Usuario) -> list[dict[str, Any]]:
    indicacoes = (
        MembroEquipe.objects.filter(membro__usuario=usuario)
        .select_related('equipe__oportunidade')
        .order_by('criado_em')
    )

    return [
        {
            'oportunidade': indicacao.equipe.oportunidade.codigo,
            'papel': indicacao.get_papel_display(),
            'nota': (
                str(indicacao.score_compatibilidade)
                if indicacao.score_compatibilidade is not None
                else None
            ),
            'motivos': indicacao.match_reasons,
            'incluida': indicacao.incluido,
            'indicada_em': _data(indicacao.criado_em),
        }
        for indicacao in indicacoes
    ]


def copia_dos_dados(usuario: Usuario) -> dict[str, Any]:
    """
    Tudo o que o sistema guarda sobre a pessoa, em formato que ela le.

    A atividade e a que a trilha liga a conta, e nao a que tem o e-mail no
    texto: o e-mail pode ter sido de outra conta antes, ou ter mudado depois.
    Nos registros que outras pessoas fizeram sobre ela, sai o que aconteceu,
    nao quem fez.
    """
    perfil = DemandanteExterno.objects.filter(usuario=usuario).first()
    membro = (
        MembroRede.objects.filter(usuario=usuario)
        .select_related('titulacao')
        .prefetch_related('competencias', 'formacoes')
        .first()
    )
    atividade = EventoAuditoria.objects.filter(conta_do_ator=usuario).order_by('ocorrido_em')
    sobre = (
        EventoAuditoria.objects.filter(_sobre_a_pessoa(usuario, membro))
        .exclude(conta_do_ator=usuario)
        .order_by('ocorrido_em')
    )

    return {
        'gerado_em': _data(timezone.now()),
        'conta': {
            'nome': usuario.nome,
            'email': usuario.email,
            'perfil': usuario.get_papel_display(),
            'situacao': usuario.get_situacao_display(),
            'organizacao': getattr(usuario.organizacao, 'nome', None),
            'cnpj_da_organizacao': getattr(usuario.organizacao, 'cnpj', None),
            'telefone': perfil.telefone if perfil else None,
            'criada_em': _data(usuario.criado_em),
            'ultimo_acesso': _data(usuario.ultimo_acesso),
        },
        'perfil_na_rede': _perfil_na_rede(membro),
        'indicacoes_em_equipes': _indicacoes(usuario),
        'oportunidades_criadas': [
            {'codigo': oportunidade.codigo, 'titulo': oportunidade.titulo, 'criada_em': _data(oportunidade.criada_em)}
            for oportunidade in usuario.oportunidades_criadas.order_by('criada_em')
        ],
        'anexos_enviados': [
            {
                'oportunidade': anexo.oportunidade.codigo,
                'nome': anexo.nome_original,
                'enviado_em': _data(anexo.criado_em),
            }
            for anexo in usuario.anexos_enviados.select_related('oportunidade').order_by('criado_em')
        ],
        'avisos_recebidos': [
            {
                'quando': _data(aviso.criado_em),
                'titulo': aviso.titulo,
                'mensagem': aviso.mensagem,
                'lido': aviso.lida_em is not None,
            }
            for aviso in Notificacao.objects.filter(usuario=usuario).order_by('criado_em')
        ],
        'atividade_registrada': [
            {
                'quando': _data(evento.ocorrido_em),
                'acao': rotulo_do_tipo(evento.tipo, evento.entidade),
                'sobre': f'{evento.entidade} {evento.entidade_id}',
            }
            for evento in atividade
        ],
        'registros_sobre_voce': [
            {
                'quando': _data(evento.ocorrido_em),
                'acao': rotulo_do_tipo(evento.tipo, evento.entidade),
            }
            for evento in sobre
        ],
    }


def pedido_de_exclusao(usuario: Usuario) -> EventoAuditoria | None:
    return (
        EventoAuditoria.objects.filter(
            tipo='exclusao_solicitada', entidade='usuario', entidade_id=str(usuario.pk)
        )
        .order_by('-ocorrido_em')
        .first()
    )


class SolicitarExclusaoService:
    """
    O titular pede a exclusao, e o pedido fica na trilha.

    O Administrador ve o pedido na lista de Usuarios ("Pediu exclusao em"). Nao
    ha aviso: a caixa de avisos e do Demandante Externo (PB26), e mandar o nome
    da pessoa para a caixa de outra seria dar dado de terceiro a quem nao le.
    """

    @transaction.atomic
    def execute(self, *, usuario: Usuario) -> EventoAuditoria:
        Usuario.objects.select_for_update().filter(pk=usuario.pk).first()

        if pedido_de_exclusao(usuario) is not None:
            raise ConflitoDeEstado(
                'Você já pediu a exclusão da sua conta. O Administrador vai atender.',
                'exclusao_ja_solicitada',
            )

        return registrar_evento(
            categoria=CategoriaEvento.CONTA,
            tipo='exclusao_solicitada',
            entidade='usuario',
            entidade_id=usuario.pk,
            ator=usuario.email,
        )


def _trocar_valores(valor, alvos: set[str], chaves: frozenset[str], chave: str | None = None):
    if isinstance(valor, dict):
        return {nome: _trocar_valores(item, alvos, chaves, nome) for nome, item in valor.items()}

    if isinstance(valor, list):
        return [_trocar_valores(item, alvos, chaves, chave) for item in valor]

    if chave in chaves and isinstance(valor, str) and valor.strip().lower() in alvos:
        return PESSOA_REMOVIDA

    return valor


def _formas_no_json(texto: str) -> list[str]:
    return list({texto, json.dumps(texto)[1:-1]})


def _contem(campos: tuple[str, ...], texto: str) -> Q:
    busca = Q()

    for campo in campos:
        for forma in _formas_no_json(texto):
            busca |= Q(**{f'{campo}__icontains': forma})

    return busca


class AnonimizarContaService:
    """
    O Administrador atende o pedido de exclusao.

    O que identifica a pessoa sai: nome, e-mail, telefone, senha, sessoes,
    avisos, experiencia e formacao da rede. O perfil da rede fica inativo e
    sai do matching. A trilha troca o nome e o e-mail por "pessoa removida" e
    perde a ligacao com a conta - so nos campos que guardam pessoa e onde o
    valor e exatamente o nome ou o e-mail, para nao mexer no que aconteceu nem
    em texto escrito por outra pessoa. As execucoes de IA deixam de guardar o e-mail de quem pediu, e o
    texto que a IA escreveu deixa de ter o nome.
    """

    @transaction.atomic
    def execute(self, *, usuario: Usuario, ator: Usuario) -> Usuario:
        if usuario.pk == ator.pk:
            raise AcaoNaoPermitida(
                'A própria conta não pode ser anonimizada por quem está nela.',
                'anonimizar_a_si',
            )

        if anonimizada(usuario):
            raise ConflitoDeEstado('Esta conta já foi anonimizada.', 'conta_ja_anonimizada')

        email, nome = usuario.email, usuario.nome
        membro = MembroRede.objects.filter(usuario=usuario).first()
        sobre_a_pessoa = _sobre_a_pessoa(usuario, membro)

        usuario.nome = NOME_ANONIMO
        usuario.email = f'removido-{usuario.pk}@{DOMINIO_ANONIMO}'
        usuario.situacao = SituacaoConta.INATIVO
        usuario.set_unusable_password()
        usuario.save()

        DemandanteExterno.objects.filter(usuario=usuario).update(telefone='')
        TokenAcesso.objects.filter(usuario=usuario).delete()
        Notificacao.objects.filter(
            Q(usuario=usuario) | Q(entidade='usuario', entidade_id=str(usuario.pk))
        ).delete()
        encerrar_sessoes(usuario)

        if membro is not None:
            membro.experiencia = ''
            membro.situacao = SituacaoMembro.INATIVO
            membro.save(update_fields=['experiencia', 'situacao', 'atualizado_em'])
            membro.formacoes.all().delete()
            VetorMembro.objects.filter(membro=membro).delete()

        ajustados = self._limpar_trilha(
            usuario=usuario, email=email, nome=nome, sobre_a_pessoa=sobre_a_pessoa
        )
        self._limpar_execucoes(email)
        self._tirar_o_nome_do_texto_da_ia(nome)

        registrar_evento(
            categoria=CategoriaEvento.CONTA,
            tipo='conta_anonimizada',
            entidade='usuario',
            entidade_id=usuario.pk,
            ator=ator.email,
            detalhe={'eventos_ajustados': ajustados},
        )
        return usuario

    def _limpar_trilha(
        self, *, usuario: Usuario, email: str, nome: str, sobre_a_pessoa: Q
    ) -> int:
        sem_ligacao = Q(
            ator=email, conta_do_ator__isnull=True, ocorrido_em__gte=usuario.criado_em
        )
        EventoAuditoria.objects.filter(Q(conta_do_ator=usuario) | sem_ligacao).update(
            ator=PESSOA_REMOVIDA, conta_do_ator=None
        )

        alvos = {email.strip().lower(), nome.strip().lower()} - {''}
        busca = _contem(('texto',), email) | _contem(('texto',), nome)
        candidatos = EventoAuditoria.objects.annotate(
            texto=Cast('detalhe', TextField())
        ).filter(busca)
        da_pessoa = set(
            EventoAuditoria.objects.filter(sobre_a_pessoa).values_list('pk', flat=True)
        )

        ajustados = 0

        for evento in candidatos:
            chaves = CAMPOS_DA_PROPRIA_CONTA if evento.pk in da_pessoa else CAMPOS_DE_PESSOA
            limpo = _trocar_valores(evento.detalhe, alvos, chaves)

            if limpo != evento.detalhe:
                EventoAuditoria.objects.filter(pk=evento.pk).update(detalhe=limpo)
                ajustados += 1

        return ajustados

    def _limpar_execucoes(self, email: str) -> None:
        ExecucaoIA.objects.filter(executado_por=email).update(executado_por=PESSOA_REMOVIDA)
        ExecucaoMatching.objects.filter(executado_por=email).update(executado_por=PESSOA_REMOVIDA)
        PreAnalise.objects.filter(executada_por=email).update(executada_por=PESSOA_REMOVIDA)

    def _tirar_o_nome_do_texto_da_ia(self, nome: str) -> None:
        """
        Aqui o texto e da IA, nao de outra pessoa: o nome sai onde aparecer,
        como palavra inteira.
        """
        if not nome.strip():
            return

        padrao = re.compile(rf'\b{re.escape(nome.strip())}\b', re.IGNORECASE)

        def trocar(valor):
            if isinstance(valor, str):
                return padrao.sub(NOME_ANONIMO, valor)
            if isinstance(valor, list):
                return [trocar(item) for item in valor]
            return valor

        for modelo, campos in TEXTOS_DA_IA:
            for registro in modelo.objects.filter(_contem(campos, nome.strip())):
                novos = {campo: trocar(getattr(registro, campo)) for campo in campos}
                mudou = {
                    campo: valor for campo, valor in novos.items()
                    if valor != getattr(registro, campo)
                }

                if mudou:
                    modelo.objects.filter(pk=registro.pk).update(**mudou)
