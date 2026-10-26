"""
Casos de uso do Copiloto de Estruturacao (RF04 / EP04 / PB38, PB39).

O Copiloto interpreta a entrada, pergunta o que falta e preenche os oito
elementos da proposta. Quatro regras governam tudo aqui:

1. **Nunca sobrescreve texto humano.** A estruturacao escreve apenas nos
   elementos que estao vazios. O que a IA mudaria num elemento ja escrito volta
   como sugestao, e so entra na proposta se o Supervisor aceitar.
2. **A saida nasce nao revisada.** Toda rodada que escreve deixa
   `revisada_por_humano = False`: o conteudo passa a existir, mas nao vale como
   revisado ate alguem gravar pela aba Proposta (AGENTS.md 0.2).
3. **Pergunta de elemento vazio nao e inventada.** Ela sai do banco de
   perguntas da Base de Conhecimento PIPE (`IA/README.md`), filtrado pelos
   campos logicos dos elementos ainda vazios. A IA so pergunta sobre elemento
   escrito, mas fraco - e a pergunta vem da avaliacao dela.
4. **A sintese da entrada e do Supervisor.** A IA resume a entrada ao abrir a
   sessao; o resumo corrigido e o que orienta a estruturacao.

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
from apps.ai.services.custo import explicar_motivo
from apps.ai.services.protocolos import ProvedorDeIA
from apps.audit.models import CategoriaEvento
from apps.audit.services import registrar_evento
from apps.copilot.models import (
    AutorMensagem,
    EstadoSessao,
    Lacuna,
    MensagemCopiloto,
    NaturezaLacuna,
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

TITULOS = {
    'problema_pesquisa': 'Problema de pesquisa',
    'hipotese': 'Hipótese',
    'objetivo_geral': 'Objetivo geral',
    'objetivos_especificos': 'Objetivos específicos',
    'metodologia': 'Metodologia',
    'resultados_esperados': 'Resultados esperados',
    'caracterizacao_inovacao': 'Caracterização da inovação',
    'infraestrutura_recursos': 'Infraestrutura e recursos',
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

SEVERIDADE_DA_NATUREZA = {
    NaturezaLacuna.INCONSISTENTE: Severidade.ALTA,
    NaturezaLacuna.POUCO_DESENVOLVIDO: Severidade.MEDIA,
}
"""
Texto que contradiz outro elemento engana quem le; texto curto so deixa de
convencer. Por isso o inconsistente e alto e o pouco desenvolvido, medio.
"""

NATUREZAS_DO_ESCRITO = (NaturezaLacuna.INCONSISTENTE, NaturezaLacuna.POUCO_DESENVOLVIDO)

ORIGEM_BASE = 'base_pipe'
ORIGEM_COPILOTO = 'copiloto'

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


def _vazio(valor) -> bool:
    if isinstance(valor, list):
        return not any((item or '').strip() for item in valor)

    return not (valor or '').strip()


def elementos_vazios(proposta: PropostaEstruturada) -> list[str]:
    """Os elementos do RF04 que seguem sem conteudo."""
    return [elemento for elemento in ELEMENTOS if _vazio(getattr(proposta, elemento))]


def texto_do_elemento(proposta: PropostaEstruturada, elemento: str) -> str:
    """O elemento como texto: os objetivos especificos, um por linha."""
    valor = getattr(proposta, elemento)

    if isinstance(valor, list):
        return '\n'.join(item.strip() for item in valor if (item or '').strip())

    return (valor or '').strip()


def elementos_preenchidos(proposta: PropostaEstruturada) -> dict[str, str]:
    """Os elementos ja escritos, como a estruturacao os le."""
    vazios = set(elementos_vazios(proposta))

    return {
        elemento: texto_do_elemento(proposta, elemento).replace('\n', '; ')
        for elemento in ELEMENTOS
        if elemento not in vazios
    }


def _perguntas_da_base(elemento: str, base) -> list[dict[str, Any]]:
    return base.perguntas(campos=CAMPOS_DA_BASE.get(elemento, ()), apenas_obrigatorias=False)


def perguntas_orientadoras(proposta: PropostaEstruturada) -> list[dict[str, Any]]:
    """
    As perguntas que a aba mostra.

    Para elemento vazio, as da baseline PIPE (RF04): base indisponivel nao
    produz pergunta escrita por nos. Para elemento escrito que a IA avaliou
    como inconsistente ou pouco desenvolvido, a pergunta que ela formulou.
    """
    perguntas = []
    base = base_conhecimento()

    if base.disponivel:
        for elemento in elementos_vazios(proposta):
            for pergunta in _perguntas_da_base(elemento, base)[:PERGUNTAS_POR_ELEMENTO]:
                perguntas.append(
                    {
                        'id': pergunta.get('id', ''),
                        'elemento': elemento,
                        'pergunta': pergunta.get('question', ''),
                        'motivo': pergunta.get('reason', ''),
                        'campo': pergunta.get('field', ''),
                        'origem': ORIGEM_BASE,
                    }
                )

    if proposta.pk is None:
        return perguntas

    fracas = (
        proposta.lacunas.filter(
            tipo=TipoLacuna.PROPOSTA, resolvida=False, natureza__in=NATUREZAS_DO_ESCRITO
        )
        .exclude(pergunta='')
        .order_by('id_lacuna')
    )

    for lacuna in fracas:
        perguntas.append(
            {
                'id': f'lacuna-{lacuna.id_lacuna}',
                'elemento': lacuna.campo_afetado,
                'pergunta': lacuna.pergunta,
                'motivo': lacuna.descricao,
                'campo': '',
                'origem': ORIGEM_COPILOTO,
            }
        )

    return perguntas


def texto_da_sintese(dados: dict[str, Any]) -> str:
    """A sintese da IA como o Supervisor le e corrige: problema, contexto e o que falta."""
    partes = []
    problema = (dados.get('problema') or '').strip()
    contexto = (dados.get('contexto') or '').strip()
    faltas = [item.strip() for item in dados.get('o_que_falta') or [] if (item or '').strip()]

    if problema:
        partes.append(f'Problema: {problema}')
    if contexto:
        partes.append(f'Contexto: {contexto}')
    if faltas:
        partes.append('O que falta:\n' + '\n'.join(f'- {item}' for item in faltas))

    return '\n'.join(partes)


def texto_da_resposta(texto: str, *, elemento: str = '', pergunta: str = '') -> str:
    """A resposta com a pergunta que ela responde, para a estruturacao saber onde usar."""
    if not elemento:
        return texto

    cabeca = f'[{TITULOS[elemento]}] {pergunta}'.rstrip()
    return f'{cabeca}\nResposta: {texto}'


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


def _exigir_aberta(sessao: SessaoCopiloto) -> None:
    if sessao.estado != EstadoSessao.ABERTA:
        raise ConflitoDeEstado(
            'Esta sessão do Copiloto já foi encerrada.', 'sessao_encerrada'
        )


def _recusar_duplicada(oportunidade: Oportunidade) -> None:
    if sessao_aberta_de(oportunidade) is not None:
        raise ConflitoDeEstado(
            'Esta oportunidade já tem uma sessão do Copiloto em andamento.',
            'sessao_duplicada',
        )


def _proxima_ordem(sessao: SessaoCopiloto) -> int:
    return sessao.mensagens.count() + 1


def _texto_de_entrada(oportunidade: Oportunidade) -> str:
    partes = [oportunidade.titulo, oportunidade.resumo, oportunidade.contexto]
    return '\n\n'.join(parte for parte in partes if (parte or '').strip())


def _respostas_humanas(sessao: SessaoCopiloto | None) -> list[str]:
    if sessao is None:
        return []

    return [
        mensagem.conteudo
        for mensagem in sessao.mensagens.filter(autor=AutorMensagem.HUMANO).order_by('ordem')
    ]


def _contagem(total: int, singular: str, plural: str) -> str:
    return f'{total} {singular if total == 1 else plural}'


class ComProvedor:
    """
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


class IniciarSessaoService(ComProvedor):
    """
    Abre a conversa de estruturacao (PB38) com a sintese da entrada.

    A IA resume o problema, o contexto e o que falta; o Supervisor corrige o
    resumo antes de estruturar. Sem IA, a sessao abre com o resumo vazio e a
    primeira mensagem diz por que.
    """

    def execute(self, *, oportunidade: Oportunidade, ator: Usuario) -> SessaoCopiloto:
        """
        A chamada ao provedor fica fora da transacao, como na estruturacao: a
        espera nao prende a conexao. A duplicata e conferida antes, para nao
        gastar IA a toa, e de novo dentro da transacao.
        """
        from apps.copilot.serializers import SinteseIASerializer

        _recusar_duplicada(oportunidade)
        correlation_id = uuid.uuid4()

        resultado = self._resolver_provedor().sintetizar_entrada(
            oportunidade_id=oportunidade.id_oportunidade,
            entrada=_texto_de_entrada(oportunidade),
            correlation_id=correlation_id,
            executado_por=ator.email,
        )

        fallback_usado = bool(resultado.get('fallback_usado'))
        lida = SinteseIASerializer(data=resultado.get('dados') or {})
        sintese = ''

        if not fallback_usado and lida.is_valid():
            sintese = texto_da_sintese(lida.validated_data)

        with transaction.atomic():
            Oportunidade.objects.select_for_update().filter(pk=oportunidade.pk).first()
            _recusar_duplicada(oportunidade)

            return self._abrir(
                oportunidade=oportunidade,
                ator=ator,
                sintese=sintese,
                execucao_ia=resultado.get('execucao_ia'),
                motivo_fallback=resultado.get('motivo_fallback') if fallback_usado else None,
                fallback_usado=fallback_usado,
                correlation_id=correlation_id,
            )

    def _abrir(
        self,
        *,
        oportunidade: Oportunidade,
        ator: Usuario,
        sintese: str,
        execucao_ia,
        motivo_fallback: str | None,
        fallback_usado: bool,
        correlation_id: uuid.UUID,
    ) -> SessaoCopiloto:
        proposta = proposta_para_estruturar(oportunidade)
        sessao = SessaoCopiloto.objects.create(
            oportunidade=oportunidade, iniciada_por=ator, sintese=sintese
        )

        pendentes = elementos_vazios(proposta)
        MensagemCopiloto.objects.create(
            sessao=sessao,
            autor=AutorMensagem.COPILOTO,
            ordem=1,
            conteudo=self._abertura(
                sintese=sintese,
                fallback_usado=fallback_usado,
                motivo_fallback=motivo_fallback,
                pendentes=len(pendentes),
            ),
            execucao_ia=execucao_ia,
        )

        registrar_evento(
            categoria=CategoriaEvento.COPILOTO,
            tipo='sessao_iniciada',
            entidade='sessao_copiloto',
            entidade_id=sessao.id_sessao,
            oportunidade=oportunidade,
            ator=ator.email,
            correlation_id=correlation_id,
            execucao_ia=execucao_ia,
            detalhe={
                'elementos_pendentes': pendentes,
                'sintese_gerada': bool(sintese),
                'fallback_usado': fallback_usado,
            },
        )
        return sessao

    def _abertura(
        self,
        *,
        sintese: str,
        fallback_usado: bool,
        motivo_fallback: str | None,
        pendentes: int,
    ) -> str:
        situacao = (
            f'Elementos da proposta ainda sem conteúdo: {pendentes} de {len(ELEMENTOS)}.'
        )

        if sintese:
            return (
                'Sessão aberta. Li a entrada e resumi o problema, o contexto e o que '
                'falta: corrija o resumo se algo não estiver certo, porque ele orienta '
                f'a estruturação. {situacao}'
            )

        if fallback_usado:
            return (
                'Sessão aberta. Não foi possível resumir a entrada agora: '
                f'{explicar_motivo(motivo_fallback)}. Se quiser, escreva o resumo você '
                f'mesmo. {situacao}'
            )

        return (
            'Sessão aberta. A IA não conseguiu resumir a entrada; se quiser, escreva o '
            f'resumo você mesmo. {situacao}'
        )


class AtualizarSinteseService:
    """A correcao humana do resumo da entrada, que orienta a estruturacao."""

    @transaction.atomic
    def execute(
        self, *, sessao: SessaoCopiloto, sintese: str, ator: Usuario
    ) -> SessaoCopiloto:
        _exigir_aberta(sessao)

        sessao.sintese = sintese
        sessao.save(update_fields=['sintese'])

        registrar_evento(
            categoria=CategoriaEvento.COPILOTO,
            tipo='sintese_revisada',
            entidade='sessao_copiloto',
            entidade_id=sessao.id_sessao,
            oportunidade=sessao.oportunidade,
            ator=ator.email,
            detalhe={'caracteres': len(sintese)},
        )
        return sessao


class ResponderService:
    """
    A resposta humana as perguntas orientadoras (PB39).

    O texto nao vai direto para a proposta: entra na conversa, ligado a
    pergunta que responde, e a proxima estruturacao o usa - preenche o elemento
    vazio ou sugere a mudanca no que ja esta escrito.
    """

    @transaction.atomic
    def execute(
        self,
        *,
        sessao: SessaoCopiloto,
        texto: str,
        ator: Usuario,
        elemento: str = '',
        pergunta: str = '',
    ) -> MensagemCopiloto:
        _exigir_aberta(sessao)

        mensagem = MensagemCopiloto.objects.create(
            sessao=sessao,
            autor=AutorMensagem.HUMANO,
            ordem=_proxima_ordem(sessao),
            conteudo=texto_da_resposta(texto, elemento=elemento, pergunta=pergunta),
        )

        detalhe = {'caracteres': len(texto)}
        if elemento:
            detalhe['elemento'] = elemento

        registrar_evento(
            categoria=CategoriaEvento.COPILOTO,
            tipo='resposta_registrada',
            entidade='mensagem_copiloto',
            entidade_id=mensagem.id_mensagem,
            oportunidade=sessao.oportunidade,
            ator=ator.email,
            detalhe=detalhe,
        )
        return mensagem


class EstruturarPropostaService(ComProvedor):
    """Uma rodada do Copiloto sobre a proposta (RF04)."""

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
            entrada=_texto_de_entrada(oportunidade),
            sintese=sessao.sintese if sessao is not None else '',
            preenchidos=elementos_preenchidos(proposta),
            vazios=elementos_vazios(proposta),
            respostas=_respostas_humanas(sessao),
            correlation_id=correlation_id,
            executado_por=ator.email,
        )

        execucao_ia = resultado.get('execucao_ia')
        fallback_usado = bool(resultado.get('fallback_usado'))
        motivo_fallback = resultado.get('motivo_fallback') if fallback_usado else None
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
                motivo_fallback=motivo_fallback,
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
        motivo_fallback: str | None = None,
    ) -> dict[str, Any]:
        preenchidos = self._preencher_vazios(proposta, dados.get('preenchimentos') or {})

        if preenchidos:
            proposta.revisada_por_humano = False
            proposta.execucao_ia = execucao_ia
            proposta.save()

        sugestoes = self._sugestoes_validas(
            proposta, dados.get('sugestoes') or [], preenchidos
        )
        lacunas = self._sincronizar_lacunas(
            proposta=proposta,
            execucao_ia=execucao_ia,
            avaliacao=dados.get('avaliacao') or [],
        )

        if sessao is not None:
            MensagemCopiloto.objects.create(
                sessao=sessao,
                autor=AutorMensagem.COPILOTO,
                ordem=_proxima_ordem(sessao),
                conteudo=self._relato(
                    preenchidos, sugestoes, lacunas, fallback_usado, motivo_fallback
                ),
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
                'sugestoes': [sugestao['elemento'] for sugestao in sugestoes],
                'lacunas': len(lacunas),
                'fallback_usado': fallback_usado,
                'saida_aceita': aceita,
            },
        )

        return {
            'proposta': proposta,
            'preenchidos': preenchidos,
            'sugestoes': sugestoes,
            'lacunas': lacunas,
            'fallback_usado': fallback_usado,
            'motivo_fallback': motivo_fallback,
            'execucao_ia': execucao_ia,
        }

    def _preencher_vazios(
        self, proposta: PropostaEstruturada, preenchimentos: dict[str, Any]
    ) -> list[str]:
        preenchidos = []

        for elemento in elementos_vazios(proposta):
            valor = preenchimentos.get(elemento)

            if isinstance(valor, list):
                valor = [item.strip() for item in valor if (item or '').strip()]
            elif isinstance(valor, str):
                valor = valor.strip()

            if not valor:
                continue

            setattr(proposta, elemento, valor)
            preenchidos.append(elemento)

        return preenchidos

    def _sugestoes_validas(
        self,
        proposta: PropostaEstruturada,
        sugestoes: list[dict[str, Any]],
        preenchidos: list[str],
    ) -> list[dict[str, str]]:
        """
        So o que mexe em texto que ja existia antes da rodada.

        Sugestao para elemento vazio nao tem o que comparar, e a que repete o
        texto atual nao sugere nada. Uma por elemento.
        """
        vazios = set(elementos_vazios(proposta))
        validas = []
        vistos = set()

        for sugestao in sugestoes:
            elemento = sugestao['elemento']
            texto = (sugestao.get('texto_sugerido') or '').strip()

            if elemento in vazios or elemento in preenchidos or elemento in vistos:
                continue

            if not texto or texto == texto_do_elemento(proposta, elemento):
                continue

            vistos.add(elemento)
            validas.append(
                {
                    'elemento': elemento,
                    'texto_sugerido': texto,
                    'motivo': (sugestao.get('motivo') or '').strip(),
                }
            )

        return validas

    def _sincronizar_lacunas(
        self,
        *,
        proposta: PropostaEstruturada,
        execucao_ia,
        avaliacao: list[dict[str, Any]],
    ) -> list[Lacuna]:
        """
        Uma lacuna aberta por elemento que falta, com o tipo e o que fazer.

        - Elemento vazio e lacuna ausente.
        - Elemento escrito que a IA avaliou como inconsistente ou pouco
          desenvolvido tambem e lacuna, com a pergunta dela. "Ausente" sobre
          texto que existe conta como pouco desenvolvido.
        - Elemento escrito avaliado como adequado fecha a lacuna dele; sem
          avaliacao nova, o que a IA apontou antes continua aberto.

        Fechar importa tanto quanto abrir: lacuna resolvida que continua na tela
        ensina o Supervisor a ignorar a lista.
        """
        vazios = set(elementos_vazios(proposta))
        avaliados = {item['elemento']: item for item in avaliacao}
        base = base_conhecimento()

        abertas = {
            lacuna.campo_afetado: lacuna
            for lacuna in proposta.lacunas.filter(
                tipo=TipoLacuna.PROPOSTA, resolvida=False
            )
        }

        atuais = []

        for elemento in ELEMENTOS:
            item = avaliados.get(elemento)
            existente = abertas.get(elemento)

            if elemento in vazios:
                campos = self._lacuna_de_ausente(elemento, item, existente, base)
            elif item is not None and item['situacao'] != 'adequado':
                campos = self._lacuna_de_escrito(elemento, item)
            elif item is None and existente is not None and existente.natureza in NATUREZAS_DO_ESCRITO:
                atuais.append(existente)
                continue
            else:
                if existente is not None:
                    existente.resolvida = True
                    existente.resolvida_em = timezone.now()
                    existente.save(update_fields=['resolvida', 'resolvida_em'])
                continue

            if campos is None:
                atuais.append(existente)
                continue

            atuais.append(
                self._abrir_ou_atualizar(proposta, elemento, existente, campos, execucao_ia)
            )

        return atuais

    def _lacuna_de_ausente(self, elemento, item, existente, base) -> dict[str, Any] | None:
        if item is None and existente is not None and existente.natureza == NaturezaLacuna.AUSENTE:
            return None

        recomendacao = (item or {}).get('recomendacao') or ''

        if not recomendacao and existente is not None and existente.natureza not in NATUREZAS_DO_ESCRITO:
            recomendacao = existente.recomendacao

        if not recomendacao and base.disponivel:
            perguntas = _perguntas_da_base(elemento, base)
            recomendacao = perguntas[0].get('question', '') if perguntas else ''

        return {
            'natureza': NaturezaLacuna.AUSENTE,
            'descricao': (item or {}).get('o_que_falta')
            or f'A proposta não descreve {ROTULOS[elemento]}.',
            'recomendacao': recomendacao,
            'pergunta': '',
            'severidade': SEVERIDADE_DO_ELEMENTO[elemento],
        }

    def _lacuna_de_escrito(self, elemento, item) -> dict[str, Any]:
        natureza = (
            NaturezaLacuna.INCONSISTENTE
            if item['situacao'] == NaturezaLacuna.INCONSISTENTE
            else NaturezaLacuna.POUCO_DESENVOLVIDO
        )

        return {
            'natureza': natureza,
            'descricao': item.get('o_que_falta')
            or f'{TITULOS[elemento]}: {natureza.label.lower()}.',
            'recomendacao': item.get('recomendacao') or '',
            'pergunta': item.get('pergunta') or '',
            'severidade': SEVERIDADE_DA_NATUREZA[natureza],
        }

    def _abrir_ou_atualizar(
        self, proposta, elemento, existente, campos, execucao_ia
    ) -> Lacuna:
        if existente is None:
            return Lacuna.objects.create(
                proposta=proposta,
                tipo=TipoLacuna.PROPOSTA,
                campo_afetado=elemento,
                execucao_ia=execucao_ia,
                **campos,
            )

        for campo, valor in campos.items():
            setattr(existente, campo, valor)

        if execucao_ia is not None:
            existente.execucao_ia = execucao_ia

        existente.save(update_fields=[*campos, 'execucao_ia'])
        return existente

    def _relato(
        self,
        preenchidos: list[str],
        sugestoes: list[dict[str, str]],
        lacunas: list[Lacuna],
        fallback_usado: bool,
        motivo_fallback: str | None = None,
    ) -> str:
        if fallback_usado and not preenchidos:
            return (
                f'Não foi possível estruturar agora: {explicar_motivo(motivo_fallback)}. '
                'Os elementos seguem editáveis na aba Proposta estruturada.'
            )

        partes = [_contagem(len(preenchidos), 'elemento preenchido', 'elementos preenchidos')]

        if sugestoes:
            partes.append(
                _contagem(len(sugestoes), 'sugestão para revisar', 'sugestões para revisar')
            )

        partes.append(_contagem(len(lacunas), 'lacuna em aberto', 'lacunas em aberto'))

        return (
            f'Rodada concluída: {", ".join(partes[:-1])} e {partes[-1]}. Todo conteúdo '
            'precisa de revisão humana antes de valer como proposta.'
        )


class AceitarSugestaoService:
    """
    O Supervisor aceita o que a IA sugeriu para um elemento ja escrito.

    Grava so aquele elemento. A marca de revisao da proposta nao muda: aceitar
    uma sugestao revisa um elemento, nao os outros sete.
    """

    @transaction.atomic
    def execute(
        self, *, oportunidade: Oportunidade, elemento: str, texto: str, ator: Usuario
    ) -> PropostaEstruturada:
        proposta = (
            PropostaEstruturada.objects.select_for_update()
            .filter(oportunidade=oportunidade)
            .first()
        )

        if proposta is None:
            raise RecursoNaoEncontrado(
                'Esta oportunidade ainda não tem proposta estruturada.',
                'proposta_inexistente',
            )

        if elemento == 'objetivos_especificos':
            valor = [linha.strip() for linha in texto.splitlines() if linha.strip()]
        else:
            valor = texto.strip()

        setattr(proposta, elemento, valor)
        proposta.save()

        registrar_evento(
            categoria=CategoriaEvento.COPILOTO,
            tipo='sugestao_aceita',
            entidade='proposta_estruturada',
            entidade_id=proposta.id_proposta,
            oportunidade=oportunidade,
            ator=ator.email,
            detalhe={'elemento': elemento},
        )
        return proposta


class ConcluirSessaoService:
    """Encerra a conversa. A proposta permanece editavel pela aba Proposta."""

    @transaction.atomic
    def execute(self, *, sessao: SessaoCopiloto, ator: Usuario) -> SessaoCopiloto:
        _exigir_aberta(sessao)

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
