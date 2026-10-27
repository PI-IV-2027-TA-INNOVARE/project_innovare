"""
Gateway do Google Gemini.

E **gateway, nao caso de uso**. Na convencao do projeto (plano 7.2) Service
Object e um caso de uso por classe, com `execute()`; esta classe traduz as
operacoes para o provedor externo, grava a execucao e garante o fallback. Os
casos de uso que a consomem - Copiloto, competencias, matching e pre-analise -
a recebem por construtor (plano 7.3), que e o que permite o duble em teste
(AGENTS.md 0.1).

Fala com o provedor pela biblioteca `google-genai`, que permite limitar o
"raciocinio" do modelo (`AI_GEMINI_ORCAMENTO_RACIOCINIO`). Toda chamada leva o
prompt de sistema da baseline; o texto de cada tarefa vem de `prompts.py`.
"""
import json
import logging
import time
import uuid
from typing import Any, Callable

from django.conf import settings

from apps.ai.models import ExecucaoIA, StatusExecucao, TipoExecucaoIA
from apps.ai.services import prompts
from apps.ai.services.custo import (
    MOTIVO_DO_ESTOURO,
    MOTIVO_FALHA_DO_PROVEDOR,
    MOTIVO_LIMITE_DO_MES,
    MOTIVO_SEM_IA,
    TetoDeCustoExcedido,
    custo_da_chamada,
    garantir_orcamento,
)

logger = logging.getLogger(__name__)


CARACTERES_POR_TOKEN = 4
"""
So para quando o provedor nao informa o uso.

E chute: erra por idioma, por acento e por tokenizador. Fica como ultimo
recurso porque uma linha sem token nenhum apagaria a chamada da apuracao.
"""


def tokens_da_resposta(response, *, prompt: str) -> tuple[int, int]:
    """
    Os tokens da chamada, do provedor quando ele informa.

    Os tokens de raciocinio sao cobrados como saida, e entram na saida.
    """
    uso = getattr(response, 'usage_metadata', None)
    texto = getattr(response, 'text', '') or ''

    if uso is not None:
        entrada = getattr(uso, 'prompt_token_count', None)
        saida = getattr(uso, 'candidates_token_count', None)
        raciocinio = getattr(uso, 'thoughts_token_count', None) or 0

        if entrada is not None and saida is not None:
            return int(entrada), int(saida) + int(raciocinio)

    return (
        len(prompt) // CARACTERES_POR_TOKEN,
        len(texto) // CARACTERES_POR_TOKEN,
    )


def falha_passageira(erro: Exception) -> bool:
    """
    O que vale tentar de novo: 429, 5xx e o tempo esgotado.

    Erro de requisicao - prompt invalido, chave recusada - devolve a mesma
    resposta na segunda vez, e repeti-lo so gasta a espera do usuario.
    """
    from google.genai import errors as erros_genai

    if isinstance(erro, erros_genai.ServerError):
        return True

    if isinstance(erro, erros_genai.ClientError):
        return getattr(erro, 'code', None) == 429

    try:
        import httpx
    except ImportError:
        return False

    return isinstance(erro, httpx.TimeoutException)


class ChamadaEsgotada(Exception):
    """A falha passageira persistiu em todas as tentativas permitidas."""


class ClienteGenAI:
    """
    O SDK `google-genai` atras da forma de chamada que o gateway usa.

    Junta numa configuracao so o que cada chamada leva: prompt de sistema,
    temperatura, teto de saida, resposta em JSON, limite de raciocinio e tempo
    maximo de espera.
    """

    def __init__(
        self,
        *,
        api_key: str,
        modelo: str,
        temperatura: float,
        orcamento_raciocinio: int | None = None,
    ) -> None:
        from google import genai

        self._cliente = genai.Client(api_key=api_key)
        self._modelo = modelo
        self._temperatura = temperatura
        self._orcamento = orcamento_raciocinio

    def generate_content(self, prompt: str, *, request_options: dict, sistema: str = ''):
        from google.genai import types

        orcamento = int(
            settings.AI_GEMINI_ORCAMENTO_RACIOCINIO
            if self._orcamento is None
            else self._orcamento
        )

        configuracao = types.GenerateContentConfig(
            system_instruction=sistema or None,
            temperature=self._temperatura,
            max_output_tokens=settings.AI_GEMINI_MAX_TOKENS_SAIDA,
            response_mime_type='application/json',
            thinking_config=types.ThinkingConfig(thinking_budget=orcamento),
            http_options=types.HttpOptions(
                timeout=int(float(request_options['timeout']) * 1000)
            ),
        )

        return self._cliente.models.generate_content(
            model=self._modelo, contents=prompt, config=configuracao
        )


class ProvedorGemini:
    """
    O Gemini com rastreabilidade, fallback e parsing robusto.

    Sem `GEMINI_API_KEY` nasce indisponivel e toda operacao cai no fallback
    sem tocar a rede - e o que mantem a suite isolada (AGENTS.md 0.1).
    """

    provedor = 'google'

    def __init__(
        self,
        modelo: str | None = None,
        temperatura: float | None = None,
        cliente=None,
        dormir=time.sleep,
        orcamento_raciocinio: int | None = None,
    ):
        """
        `cliente` substitui o SDK e `dormir` a espera entre tentativas - e o que
        deixa o teste exercitar o retry sem rede e sem relogio (AGENTS.md 0.1).
        `orcamento_raciocinio` vence a settings so neste provedor: e o que a
        medicao manual usa para comparar com e sem limite.
        """
        self._modelo = modelo or settings.AI_MATCH_GEMINI_MODEL
        self._dormir = dormir
        temperatura = (
            temperatura
            if temperatura is not None
            else settings.AI_GEMINI_TEMPERATURA
        )

        api_key = getattr(settings, 'GEMINI_API_KEY', None)
        if cliente is not None:
            self.model = cliente
            self._disponivel = True
        elif not api_key:
            logger.warning('GEMINI_API_KEY nao configurada. IA indisponivel - fallback ativo.')
            self._disponivel = False
            self.model = None
        else:
            self.model = ClienteGenAI(
                api_key=api_key,
                modelo=self._modelo,
                temperatura=temperatura,
                orcamento_raciocinio=orcamento_raciocinio,
            )
            self._disponivel = True

    @property
    def disponivel(self) -> bool:
        return self._disponivel

    @property
    def modelo(self) -> str:
        """O modelo que este provedor chama - e o que o registro grava."""
        return self._modelo

    def _criar_execucao(
        self,
        tipo: TipoExecucaoIA,
        oportunidade_id: int | None,
        correlation_id: uuid.UUID,
        prompt_versao: str,
        parametros: dict,
        executado_por: str = '__sistema__',
    ) -> ExecucaoIA:
        """O registro da execucao, aberto antes da chamada."""
        return ExecucaoIA.objects.create(
            tipo=tipo,
            provedor=self.provedor,
            modelo=self._modelo,
            versao_prompt=prompts.versao_registrada(prompt_versao),
            correlation_id=correlation_id,
            oportunidade_id=oportunidade_id,
            executado_por=executado_por,
            status=StatusExecucao.EXECUTANDO,
            erro='',
            fallback_usado=False,
        )

    def _finalizar_execucao(
        self,
        execucao: ExecucaoIA,
        status: StatusExecucao,
        tokens_entrada: int | None = None,
        tokens_saida: int | None = None,
        custo_estimado: float | None = None,
        latencia_ms: int | None = None,
        fallback_usado: bool = False,
        erro: str = '',
    ) -> ExecucaoIA:
        """Atualiza execucao com resultado final."""
        from django.utils import timezone
        execucao.status = status
        execucao.tokens_entrada = tokens_entrada
        execucao.tokens_saida = tokens_saida
        execucao.custo_estimado = (
            custo_estimado
            if custo_estimado is not None
            else custo_da_chamada(
                tokens_entrada=tokens_entrada,
                tokens_saida=tokens_saida,
                provedor=self.provedor,
            )
        )
        execucao.latencia_ms = latencia_ms
        execucao.fallback_usado = fallback_usado
        execucao.erro = erro
        execucao.concluido_em = timezone.now()
        execucao.save(update_fields=[
            'status', 'tokens_entrada', 'tokens_saida', 'custo_estimado',
            'latencia_ms', 'fallback_usado', 'erro', 'concluido_em',
        ])
        return execucao

    def _parse_json_seguro(self, texto: str) -> dict[str, Any]:
        """Extrai JSON valido da resposta, tolerando texto em volta."""
        try:
            return json.loads(texto)
        except json.JSONDecodeError:
            try:
                inicio = texto.find('{')
                fim = texto.rfind('}') + 1
                if inicio != -1 and fim > inicio:
                    return json.loads(texto[inicio:fim])
            except json.JSONDecodeError:
                pass
        logger.warning(f'Falha ao parsear JSON da IA: {texto[:200]}')
        return {'_erro_parse': True, '_raw': texto[:500]}

    def _gerar(self, prompt: str):
        """
        A chamada ao provedor com timeout e retry limitado.

        `Metodos_Integracao_IA.md` pede "timeout e retry limitado; tratamento
        de 429, 5xx e indisponibilidade". A espera dobra a cada tentativa para
        nao insistir sobre um provedor que pediu calma (429).
        """
        tentativas = max(1, settings.AI_GEMINI_TENTATIVAS)
        espera = settings.AI_GEMINI_ESPERA_INICIAL_S
        sistema, _ = prompts.prompt_de_sistema()

        for tentativa in range(1, tentativas + 1):
            try:
                return self.model.generate_content(
                    prompt,
                    request_options={'timeout': settings.AI_GEMINI_TIMEOUT_S},
                    sistema=sistema,
                )
            except Exception as falha:
                if not falha_passageira(falha):
                    raise

                if tentativa == tentativas:
                    raise ChamadaEsgotada(
                        f'Falha passageira em {tentativas} tentativas: {falha}'
                    ) from falha
                logger.warning(
                    f'Falha passageira no Gemini (tentativa {tentativa} de '
                    f'{tentativas}): {falha}'
                )
                self._dormir(espera)
                espera *= 2

    def _ler(self, response, validar: Callable[[dict], bool] | None) -> dict[str, Any]:
        resultado = self._parse_json_seguro(getattr(response, 'text', None) or '{}')

        if not resultado.get('_erro_parse') and validar is not None and not validar(resultado):
            return {'_erro_parse': True, '_raw': 'resposta sem os vinculos pedidos'}

        return resultado

    def _executar_com_fallback(
        self,
        tipo: TipoExecucaoIA,
        oportunidade_id: int | None,
        correlation_id: uuid.UUID,
        prompt_versao: str,
        prompt: str,
        parametros: dict,
        fallback_fn,
        executado_por: str = '__sistema__',
        validar: Callable[[dict], bool] | None = None,
    ) -> dict[str, Any]:
        """
        Executa no Gemini com fallback automatico.

        Antes de chamar, confere o teto de gasto: estourado, a chamada nao sai
        e o caminho sem IA volta com o motivo, para a tela explicar.

        Resposta malformada - JSON invalido, ou sem os vinculos que `validar`
        exige - e pedida de novo uma vez, com o mesmo prompt.
        """
        if not self._disponivel:
            logger.info(f'Gemini indisponivel - executando fallback para {tipo}')
            return {
                'dados': fallback_fn(),
                'execucao_ia': None,
                'fallback_usado': True,
                'motivo_fallback': MOTIVO_SEM_IA,
            }

        try:
            garantir_orcamento(oportunidade_id=oportunidade_id)
        except TetoDeCustoExcedido as estouro:
            logger.warning(f'{estouro} Executando fallback para {tipo}.')
            return {
                'dados': fallback_fn(),
                'execucao_ia': None,
                'fallback_usado': True,
                'motivo_fallback': MOTIVO_DO_ESTOURO.get(
                    estouro.codigo, MOTIVO_LIMITE_DO_MES
                ),
            }

        execucao = self._criar_execucao(
            tipo=tipo,
            oportunidade_id=oportunidade_id,
            correlation_id=correlation_id,
            prompt_versao=prompt_versao,
            parametros=parametros,
            executado_por=executado_por,
        )

        inicio = time.perf_counter()

        try:
            response = self._gerar(prompt)
            latencia_ms = int((time.perf_counter() - inicio) * 1000)

            tokens_entrada, tokens_saida = tokens_da_resposta(
                response, prompt=prompt
            )

            resultado = self._ler(response, validar)

            if resultado.get('_erro_parse'):
                logger.warning(f'Resposta malformada do Gemini ({tipo}); pedindo de novo.')
                response = self._gerar(prompt)
                latencia_ms = int((time.perf_counter() - inicio) * 1000)
                entrada_extra, saida_extra = tokens_da_resposta(
                    response, prompt=prompt
                )
                tokens_entrada += entrada_extra
                tokens_saida += saida_extra
                resultado = self._ler(response, validar)

            self._finalizar_execucao(
                execucao=execucao,
                status=StatusExecucao.OK if not resultado.get('_erro_parse') else StatusExecucao.ERRO,
                tokens_entrada=tokens_entrada,
                tokens_saida=tokens_saida,
                latencia_ms=latencia_ms,
                fallback_usado=False,
                erro='' if not resultado.get('_erro_parse') else 'Falha ao parsear JSON da resposta',
            )

            return {
                'dados': resultado,
                'execucao_ia': execucao,
                'fallback_usado': False,
                'motivo_fallback': None,
            }

        except Exception as e:
            latencia_ms = int((time.perf_counter() - inicio) * 1000)
            logger.error(f'Erro no Gemini ({tipo}): {e}')

            self._finalizar_execucao(
                execucao=execucao,
                status=StatusExecucao.ERRO,
                latencia_ms=latencia_ms,
                fallback_usado=False,
                erro=str(e),
            )

            logger.info(f'Executando fallback para {tipo}')
            return {
                'dados': fallback_fn(),
                'execucao_ia': execucao,
                'fallback_usado': True,
                'motivo_fallback': MOTIVO_FALHA_DO_PROVEDOR,
            }

    def sintetizar_entrada(
        self,
        oportunidade_id: int,
        entrada: str,
        correlation_id: uuid.UUID,
        executado_por: str,
    ) -> dict[str, Any]:
        """A interpretacao inicial da entrada, que o Supervisor corrige (PB29)."""
        return self._executar_com_fallback(
            tipo=TipoExecucaoIA.COPILOTO,
            oportunidade_id=oportunidade_id,
            correlation_id=correlation_id,
            prompt_versao=prompts.VERSAO_SINTESE,
            prompt=prompts.prompt_sintese(entrada=entrada),
            parametros={'entrada_len': len(entrada)},
            fallback_fn=lambda: {'problema': '', 'contexto': '', 'o_que_falta': []},
            executado_por=executado_por,
        )

    def estruturar_proposta(
        self,
        oportunidade_id: int,
        entrada: str,
        sintese: str,
        preenchidos: dict[str, str],
        vazios: list[str],
        respostas: list[str],
        correlation_id: uuid.UUID,
        executado_por: str,
    ) -> dict[str, Any]:
        """
        Copiloto de Estruturacao (RF04): escreve so os elementos vazios, avalia
        os oito e devolve como sugestao o que mexeria em elemento preenchido.
        """
        return self._executar_com_fallback(
            tipo=TipoExecucaoIA.COPILOTO,
            oportunidade_id=oportunidade_id,
            correlation_id=correlation_id,
            prompt_versao=prompts.VERSAO_COPILOTO,
            prompt=prompts.prompt_estruturacao(
                entrada=entrada,
                sintese=sintese,
                preenchidos=preenchidos,
                vazios=vazios,
                respostas=respostas,
            ),
            parametros={'vazios': len(vazios), 'respostas': len(respostas)},
            fallback_fn=lambda: {'preenchimentos': {}, 'sugestoes': [], 'avaliacao': []},
            executado_por=executado_por,
        )

    def derivar_competencias(
        self,
        oportunidade_id: int,
        proposta_texto: str,
        correlation_id: uuid.UUID,
        executado_por: str,
    ) -> dict[str, Any]:
        """Deriva competencias necessarias da proposta (RF05)."""
        return self._executar_com_fallback(
            tipo=TipoExecucaoIA.COMPETENCIAS,
            oportunidade_id=oportunidade_id,
            correlation_id=correlation_id,
            prompt_versao=prompts.VERSAO_COMPETENCIAS,
            prompt=prompts.prompt_competencias(proposta_texto=proposta_texto),
            parametros={'proposta_len': len(proposta_texto)},
            fallback_fn=lambda: {'competencias': []},
            executado_por=executado_por,
        )

    def executar_matching(
        self,
        oportunidade_id: int,
        competencias_necessarias: list[dict],
        candidatos: list[dict],
        correlation_id: uuid.UUID,
        executado_por: str,
    ) -> dict[str, Any]:
        """A reordenacao do matching (RF06-RF08): candidatos so por apelido."""
        return self._executar_com_fallback(
            tipo=TipoExecucaoIA.MATCHING,
            oportunidade_id=oportunidade_id,
            correlation_id=correlation_id,
            prompt_versao=prompts.VERSAO_MATCHING,
            prompt=prompts.prompt_matching(
                competencias=competencias_necessarias, candidatos=candidatos
            ),
            parametros={'num_candidatos': len(candidatos), 'num_competencias': len(competencias_necessarias)},
            fallback_fn=lambda: {'matches': []},
            executado_por=executado_por,
        )

    def pre_analise_pipe(
        self,
        oportunidade_id: int,
        proposta_texto: str,
        equipe_texto: str,
        criterios: dict[str, Any],
        correlation_id: uuid.UUID,
        executado_por: str,
    ) -> dict[str, Any]:
        """
        Pre-analise PIPE/FAPESP (RF09, RF10), com os criterios da versao vigente.

        Recomendacao que nao aponta para uma lacuna da propria resposta torna a
        resposta malformada: e o vinculo que a tela mostra.
        """
        return self._executar_com_fallback(
            tipo=TipoExecucaoIA.PREANALISE,
            oportunidade_id=oportunidade_id,
            correlation_id=correlation_id,
            prompt_versao=prompts.VERSAO_PREANALISE,
            prompt=prompts.prompt_preanalise(
                baseline_id=criterios.get('baseline_id', ''),
                versao=criterios.get('versao', ''),
                criterios_por_dimensao=criterios.get('por_dimensao', []),
                proposta_texto=proposta_texto,
                equipe_texto=equipe_texto,
            ),
            parametros={'proposta_len': len(proposta_texto), 'equipe_len': len(equipe_texto)},
            fallback_fn=lambda: {
                'dimensoes': [],
                'lacunas': [],
                'recomendacoes': [],
                'sintese': 'Pré-análise indisponível agora: o serviço de IA não respondeu.',
            },
            executado_por=executado_por,
            validar=recomendacoes_vinculadas,
        )


def recomendacoes_vinculadas(resultado: dict[str, Any]) -> bool:
    """Toda recomendacao aponta para uma lacuna que a resposta declarou."""
    ids = {
        str(lacuna.get('id'))
        for lacuna in resultado.get('lacunas') or []
        if isinstance(lacuna, dict) and lacuna.get('id')
    }

    for recomendacao in resultado.get('recomendacoes') or []:
        if not isinstance(recomendacao, dict) or str(recomendacao.get('lacuna')) not in ids:
            return False

    return True
