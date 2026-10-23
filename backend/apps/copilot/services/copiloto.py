"""
Casos de uso do Copiloto de Estruturacao (RF04 / EP04 / PB38, PB39).

O Copiloto interpreta a entrada, pergunta o que falta e preenche os oito
elementos da proposta. Tres regras governam tudo aqui:

1. **Nunca sobrescreve texto humano.** A estruturacao escreve apenas nos
   elementos que estao vazios. Quem revisou um paragrafo nao o perde para a
   proxima rodada da IA.
2. **A saida nasce nao revisada.** Toda rodada que escreve deixa
   `revisada_por_humano = False`: o conteudo passa a existir, mas nao vale como
   revisado ate alguem gravar pela aba Proposta (AGENTS.md 0.2).
3. **Pergunta nao e inventada.** As perguntas orientadoras saem do banco de
   perguntas da Base de Conhecimento PIPE (`IA/README.md`), filtrado pelos
   campos logicos dos elementos ainda vazios.

O que este modulo deliberadamente NAO faz: mexer na `situacao` da oportunidade.
Quais transicoes valem e quem as dispara e a pendencia P13 do plano.
"""
from __future__ import annotations

import uuid
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Usuario
from apps.ai.services.base_conhecimento import base_conhecimento
from apps.ai.services.protocolos import ProvedorDeIA
from apps.audit.models import CategoriaEvento
from apps.audit.services import registrar_evento
from apps.copilot.models import (
    AutorMensagem,
    EstadoSessao,
    Lacuna,
    MensagemCopiloto,
    PropostaEstruturada,
    Severidade,
    SessaoCopiloto,
    TipoLacuna,
)
from apps.opportunities.models import Oportunidade
from core.exceptions import ConflitoDeEstado, RecursoNaoEncontrado

ELEMENTOS = (
    'problema_pesquisa',
    'hipotese',
    'objetivo_geral',
    'objetivos_especificos',
    'metodologia',
    'resultados_esperados',
    'caracterizacao_inovacao',
    'infraestrutura_recursos',
)

ROTULOS = {
    'problema_pesquisa': 'o problema de pesquisa',
    'hipotese': 'a hipótese',
    'objetivo_geral': 'o objetivo geral',
    'objetivos_especificos': 'os objetivos específicos',
    'metodologia': 'a metodologia',
    'resultados_esperados': 'os resultados esperados',
    'caracterizacao_inovacao': 'a caracterização da inovação',
    'infraestrutura_recursos': 'a infraestrutura e os recursos',
}

CAMPOS_DA_BASE = {
    'problema_pesquisa': ('problema_mercado', 'evidencia_problema', 'impacto'),
    'hipotese': ('incerteza_tecnica', 'hipoteses'),
    'objetivo_geral': ('objetivo_geral',),
    'objetivos_especificos': ('objetivos_especificos', 'entregavel'),
    'metodologia': ('metodologia', 'metodos', 'controles', 'validacao'),
    'resultados_esperados': ('criterios_sucesso', 'resultados_previos'),
    'caracterizacao_inovacao': ('diferencial', 'estado_arte', 'solucoes_atuais'),
    'infraestrutura_recursos': ('infraestrutura', 'equipe', 'material_consumo'),
}
"""
De cada elemento do RF04 para os campos logicos da Base de Conhecimento.

E a unica cola entre o nosso modelo e a baseline de IA. Fica num lugar so, e e
material de ratificacao do PO (P4): o que muda aqui muda qual pergunta o
Supervisor ve, nao como o sistema funciona.
"""

SEVERIDADE_DO_ELEMENTO = {elemento: Severidade.ALTA for elemento in ELEMENTOS}
SEVERIDADE_DO_ELEMENTO['hipotese'] = Severidade.MEDIA
"""
A hipotese e "quando aplicavel" no RF04; os outros sete nao tem ressalva. Por
isso a lacuna da hipotese nasce media e as demais altas.
"""

PERGUNTAS_POR_ELEMENTO = 3


def proposta_para_estruturar(oportunidade: Oportunidade) -> PropostaEstruturada:
    """
    A proposta da oportunidade, criada se ainda nao existir.

    Diferente de `IniciarPropostaService`, que recusa duplicata: aqui a
    proposta e meio, nao fim - quem chama o Copiloto quer estruturar, e exigir
    um clique anterior em outra aba seria cerimonia sem funcao.
    """
    proposta, _ = PropostaEstruturada.objects.get_or_create(oportunidade=oportunidade)
    return proposta


def elementos_vazios(proposta: PropostaEstruturada) -> list[str]:
    """Os elementos do RF04 que seguem sem conteudo."""
    vazios = []

    for elemento in ELEMENTOS:
        valor = getattr(proposta, elemento)

        if isinstance(valor, list):
            if not valor:
                vazios.append(elemento)
        elif not (valor or '').strip():
            vazios.append(elemento)

    return vazios


def perguntas_orientadoras(proposta: PropostaEstruturada) -> list[dict[str, Any]]:
    """
    As perguntas da baseline para os elementos ainda vazios (RF04).

    Base indisponivel devolve lista vazia - a tela diz que nao ha pergunta
    carregada, em vez de exibir pergunta escrita por nos.
    """
    base = base_conhecimento()

    if not base.disponivel:
        return []

    perguntas = []

    for elemento in elementos_vazios(proposta):
        encontradas = base.perguntas(
            campos=CAMPOS_DA_BASE.get(elemento, ()), apenas_obrigatorias=False
        )

        for pergunta in encontradas[:PERGUNTAS_POR_ELEMENTO]:
            perguntas.append(
                {
                    'id': pergunta.get('id', ''),
                    'elemento': elemento,
                    'pergunta': pergunta.get('question', ''),
                    'motivo': pergunta.get('reason', ''),
                    'campo': pergunta.get('field', ''),
                }
            )

    return perguntas


def sessao_aberta_de(oportunidade: Oportunidade) -> SessaoCopiloto | None:
    """A conversa em andamento, se houver."""
    return (
        oportunidade.sessoes_copiloto.filter(estado=EstadoSessao.ABERTA)
        .order_by('-criado_em')
        .first()
    )


def sessao_atual_de(oportunidade: Oportunidade) -> SessaoCopiloto:
    """A conversa em andamento, ou o 404 que a tela usa para oferecer o inicio."""
    sessao = sessao_aberta_de(oportunidade)

    if sessao is None:
        raise RecursoNaoEncontrado(
            'Esta oportunidade não tem sessão do Copiloto em andamento.',
            'sessao_inexistente',
        )

    return sessao


def _proxima_ordem(sessao: SessaoCopiloto) -> int:
    return sessao.mensagens.count() + 1


def _texto_de_entrada(oportunidade: Oportunidade) -> str:
    partes = [oportunidade.titulo, oportunidade.resumo, oportunidade.contexto]
    return '\n\n'.join(parte for parte in partes if (parte or '').strip())


def _respostas_humanas(sessao: SessaoCopiloto | None) -> str:
    if sessao is None:
        return ''

    return '\n'.join(
        mensagem.conteudo
        for mensagem in sessao.mensagens.filter(autor=AutorMensagem.HUMANO)
    )


class IniciarSessaoService:
    """Abre a conversa de estruturacao (PB38)."""

    @transaction.atomic
    def execute(self, *, oportunidade: Oportunidade, ator: Usuario) -> SessaoCopiloto:
        if sessao_aberta_de(oportunidade) is not None:
            raise ConflitoDeEstado(
                'Esta oportunidade já tem uma sessão do Copiloto em andamento.',
                'sessao_duplicada',
            )

        proposta = proposta_para_estruturar(oportunidade)
        sessao = SessaoCopiloto.objects.create(
            oportunidade=oportunidade, iniciada_por=ator
        )

        pendentes = elementos_vazios(proposta)
        MensagemCopiloto.objects.create(
            sessao=sessao,
            autor=AutorMensagem.COPILOTO,
            ordem=1,
            conteudo=(
                'Sessão aberta. Elementos da proposta ainda sem conteúdo: '
                f'{len(pendentes)} de {len(ELEMENTOS)}.'
            ),
        )

        registrar_evento(
            categoria=CategoriaEvento.COPILOTO,
            tipo='sessao_iniciada',
            entidade='sessao_copiloto',
            entidade_id=sessao.id_sessao,
            oportunidade=oportunidade,
            ator=ator.email,
            detalhe={'elementos_pendentes': pendentes},
        )
        return sessao


class ResponderService:
    """
    A resposta humana as perguntas orientadoras (PB39).

    O texto nao vai para a proposta: ele entra na conversa e vira contexto da
    proxima estruturacao. Quem escreve na proposta e o Copiloto (com revisao
    pendente) ou o Supervisor, pela aba Proposta.
    """

    @transaction.atomic
    def execute(
        self, *, sessao: SessaoCopiloto, texto: str, ator: Usuario
    ) -> MensagemCopiloto:
        if sessao.estado != EstadoSessao.ABERTA:
            raise ConflitoDeEstado(
                'Esta sessão do Copiloto já foi encerrada.', 'sessao_encerrada'
            )

        mensagem = MensagemCopiloto.objects.create(
            sessao=sessao,
            autor=AutorMensagem.HUMANO,
            ordem=_proxima_ordem(sessao),
            conteudo=texto,
        )

        registrar_evento(
            categoria=CategoriaEvento.COPILOTO,
            tipo='resposta_registrada',
            entidade='mensagem_copiloto',
            entidade_id=mensagem.id_mensagem,
            oportunidade=sessao.oportunidade,
            ator=ator.email,
            detalhe={'caracteres': len(texto)},
        )
        return mensagem


class EstruturarPropostaService:
    """
    Uma rodada do Copiloto sobre a proposta (RF04).

    Recebe o provedor por construtor: e o que permite o duble no teste e o que
    mantem a suite longe do Gemini real (AGENTS.md 0.1).
    """

    def __init__(self, provedor: ProvedorDeIA | None = None) -> None:
        self._provedor = provedor

    def _resolver_provedor(self):
        if self._provedor is not None:
            return self._provedor

        from apps.ai.services.gemini_service import ProvedorGemini

        return ProvedorGemini()

    def execute(self, *, oportunidade: Oportunidade, ator: Usuario) -> dict[str, Any]:
        """
        A chamada ao provedor fica fora da transacao: ela leva segundos, e
        dentro de `atomic` prenderia a conexao e os bloqueios do banco durante
        toda a espera. O preco e que a proposta pode mudar enquanto a IA
        responde - por isso ela e relida, com bloqueio, antes de gravar.
        """
        from apps.copilot.serializers import SaidaCopilotoSerializer

        proposta = proposta_para_estruturar(oportunidade)
        sessao = sessao_aberta_de(oportunidade)
        correlation_id = uuid.uuid4()

        resultado = self._resolver_provedor().estruturar_proposta(
            oportunidade_id=oportunidade.id_oportunidade,
            entrada_bruta=_texto_de_entrada(oportunidade),
            contexto=_respostas_humanas(sessao),
            correlation_id=correlation_id,
            executado_por=ator.email,
        )

        execucao_ia = resultado.get('execucao_ia')
        fallback_usado = bool(resultado.get('fallback_usado'))
        saida = SaidaCopilotoSerializer(data=resultado.get('dados') or {})
        aceita = saida.is_valid()
        dados = dict(saida.validated_data) if aceita else {}

        with transaction.atomic():
            return self._gravar_rodada(
                proposta=PropostaEstruturada.objects.select_for_update().get(
                    pk=proposta.pk
                ),
                oportunidade=oportunidade,
                sessao=sessao,
                dados=dados,
                aceita=aceita,
                execucao_ia=execucao_ia,
                fallback_usado=fallback_usado,
                correlation_id=correlation_id,
                ator=ator,
            )

    def _gravar_rodada(
        self,
        *,
        proposta: PropostaEstruturada,
        oportunidade: Oportunidade,
        sessao: SessaoCopiloto | None,
        dados: dict[str, Any],
        aceita: bool,
        execucao_ia,
        fallback_usado: bool,
        correlation_id: uuid.UUID,
        ator: Usuario,
    ) -> dict[str, Any]:
        preenchidos = []

        for elemento in elementos_vazios(proposta):
            valor = dados.get(elemento)

            if valor in (None, '', []):
                continue

            setattr(proposta, elemento, valor)
            preenchidos.append(elemento)

        if preenchidos:
            proposta.revisada_por_humano = False
            proposta.execucao_ia = execucao_ia
            proposta.save()

        lacunas = self._sincronizar_lacunas(proposta=proposta, execucao_ia=execucao_ia)

        if sessao is not None:
            MensagemCopiloto.objects.create(
                sessao=sessao,
                autor=AutorMensagem.COPILOTO,
                ordem=_proxima_ordem(sessao),
                conteudo=self._relato(preenchidos, lacunas, fallback_usado),
                execucao_ia=execucao_ia,
            )

        registrar_evento(
            categoria=CategoriaEvento.COPILOTO,
            tipo='estruturacao_executada',
            entidade='proposta_estruturada',
            entidade_id=proposta.id_proposta,
            oportunidade=oportunidade,
            ator=ator.email,
            correlation_id=correlation_id,
            execucao_ia=execucao_ia,
            detalhe={
                'elementos_preenchidos': preenchidos,
                'lacunas': len(lacunas),
                'fallback_usado': fallback_usado,
                'saida_aceita': aceita,
            },
        )

        return {
            'proposta': proposta,
            'preenchidos': preenchidos,
            'lacunas': lacunas,
            'fallback_usado': fallback_usado,
            'execucao_ia': execucao_ia,
        }

    def _sincronizar_lacunas(
        self, *, proposta: PropostaEstruturada, execucao_ia
    ) -> list[Lacuna]:
        """
        Abre lacuna para elemento vazio e fecha a do que foi preenchido.

        Fechar importa tanto quanto abrir: lacuna resolvida que continua na tela
        ensina o Supervisor a ignorar a lista.
        """
        vazios = set(elementos_vazios(proposta))
        base = base_conhecimento()

        abertas = {
            lacuna.campo_afetado: lacuna
            for lacuna in proposta.lacunas.filter(
                tipo=TipoLacuna.PROPOSTA, resolvida=False
            )
        }

        for campo, lacuna in abertas.items():
            if campo not in vazios:
                lacuna.resolvida = True
                lacuna.resolvida_em = timezone.now()
                lacuna.save(update_fields=['resolvida', 'resolvida_em'])

        atuais = []

        for elemento in sorted(vazios):
            existente = abertas.get(elemento)

            if existente is not None:
                atuais.append(existente)
                continue

            recomendacao = ''

            if base.disponivel:
                perguntas = base.perguntas(
                    campos=CAMPOS_DA_BASE.get(elemento, ()),
                    apenas_obrigatorias=False,
                )
                if perguntas:
                    recomendacao = perguntas[0].get('question', '')

            atuais.append(
                Lacuna.objects.create(
                    proposta=proposta,
                    tipo=TipoLacuna.PROPOSTA,
                    campo_afetado=elemento,
                    descricao=f'A proposta não descreve {ROTULOS[elemento]}.',
                    recomendacao=recomendacao,
                    severidade=SEVERIDADE_DO_ELEMENTO[elemento],
                    execucao_ia=execucao_ia,
                )
            )

        return atuais

    def _relato(
        self, preenchidos: list[str], lacunas: list[Lacuna], fallback_usado: bool
    ) -> str:
        if fallback_usado and not preenchidos:
            return (
                'Não foi possível estruturar agora: o provedor de IA está '
                'indisponível. Os elementos seguem editáveis na aba Proposta '
                'estruturada.'
            )

        return (
            f'Rodada concluída: {len(preenchidos)} elemento(s) preenchido(s) e '
            f'{len(lacunas)} lacuna(s) em aberto. Todo conteúdo precisa de '
            'revisão humana antes de valer como proposta.'
        )


class ConcluirSessaoService:
    """Encerra a conversa. A proposta permanece editavel pela aba Proposta."""

    @transaction.atomic
    def execute(self, *, sessao: SessaoCopiloto, ator: Usuario) -> SessaoCopiloto:
        if sessao.estado != EstadoSessao.ABERTA:
            raise ConflitoDeEstado(
                'Esta sessão do Copiloto já foi encerrada.', 'sessao_encerrada'
            )

        sessao.estado = EstadoSessao.CONCLUIDA
        sessao.encerrado_em = timezone.now()
        sessao.save(update_fields=['estado', 'encerrado_em'])

        registrar_evento(
            categoria=CategoriaEvento.COPILOTO,
            tipo='sessao_concluida',
            entidade='sessao_copiloto',
            entidade_id=sessao.id_sessao,
            oportunidade=sessao.oportunidade,
            ator=ator.email,
        )
        return sessao
