"""
Gateway do Google Gemini.

Adaptado do legado (ai_matching) para o novo modelo:
- Oportunidade + PropostaEstruturada + CompetenciaNecessaria + MembroRede
- Rastreabilidade via ExecucaoIA (ai_run_id, correlation_id)
- Fallback seguro: Gemini indisponivel -> busca lexical/embedding

E **gateway, nao caso de uso**. Na convencao do projeto (plano 7.2) Service
Object e um caso de uso por classe, com `execute()`; esta classe traduz quatro
operacoes para o provedor externo, grava a execucao e garante o fallback. Os
casos de uso que a consomem - Copiloto, competencias, matching e pre-analise -
nascem nas fases 3.2 a 3.4 e a recebem por construtor (plano 7.3), que e o que
permite o duble em teste (AGENTS.md 0.1).
"""
import json
import logging
import uuid
from typing import Any
from django.conf import settings
import google.generativeai as genai
from apps.ai.models import ExecucaoIA, TipoExecucaoIA, StatusExecucao
from apps.ai.services.custo import (
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

    `Plano_Integracao_IA.md` manda *registrar* tokens de entrada e saida - e e
    sobre esse numero que o custo e o teto mensal sao conferidos. O
    `usage_metadata` do Gemini e a medida do proprio provedor; a contagem por
    caractere so entra quando ele nao vem.
    """
    uso = getattr(response, 'usage_metadata', None)
    texto = getattr(response, 'text', '') or ''

    if uso is not None:
        entrada = getattr(uso, 'prompt_token_count', None)
        saida = getattr(uso, 'candidates_token_count', None)

        if entrada is not None and saida is not None:
            return int(entrada), int(saida)

    return (
        len(prompt) // CARACTERES_POR_TOKEN,
        len(texto) // CARACTERES_POR_TOKEN,
    )


class ProvedorGemini:
    """
    O Gemini com rastreabilidade, fallback e parsing robusto.

    Sem `GEMINI_API_KEY` nasce indisponivel e toda operacao cai no fallback
    sem tocar a rede - e o que mantem a suite isolada (AGENTS.md 0.1).
    """

    def __init__(self, modelo: str | None = None, temperatura: float | None = None):
        self._modelo = modelo or settings.AI_MATCH_GEMINI_MODEL
        temperatura = (
            temperatura
            if temperatura is not None
            else settings.AI_GEMINI_TEMPERATURA
        )

        api_key = getattr(settings, 'GEMINI_API_KEY', None)
        if not api_key:
            logger.warning('GEMINI_API_KEY nao configurada. IA indisponivel - fallback ativo.')
            self._disponivel = False
            self.model = None
        else:
            genai.configure(api_key=api_key)
            self.model = genai.GenerativeModel(
                model_name=self._modelo,
                generation_config=genai.GenerationConfig(
                    temperature=temperatura,
                    max_output_tokens=settings.AI_GEMINI_MAX_TOKENS_SAIDA,
                    response_mime_type='application/json',
                ),
            )
            self._disponivel = True

    @property
    def disponivel(self) -> bool:
        return self._disponivel

    @property
    def modelo(self) -> str:
        """
        O modelo que este provedor chama - e o que o registro precisa gravar.

        Fica exposto porque `ExecucaoIA.modelo` e o painel de saude respondem
        "qual modelo produziu isto", e a resposta tem de vir do mesmo lugar que
        a chamada. Ler a settings de novo no registro reabriria a divergencia
        que este atributo fecha.
        """
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
        """
        Cria registro de execucao de IA para rastreabilidade.

        `oportunidade_id` chega dos quatro fluxos e e gravado: e ele que
        permite perguntar quanto uma oportunidade custou. Fica nulo so em
        execucao que nao pende de oportunidade nenhuma, como embedding da rede.
        """
        return ExecucaoIA.objects.create(
            tipo=tipo,
            provedor='google',
            modelo=self._modelo,
            versao_prompt=prompt_versao,
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
                tokens_entrada=tokens_entrada, tokens_saida=tokens_saida
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
        """
        Extrai JSON valido da resposta, tolerando texto extra.
        Mesmo parser robusto do legado.
        """
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
    ) -> dict[str, Any]:
        """
        Executa no Gemini com fallback automatico.
        Retorna dict com keys: 'dados', 'execucao_ia', 'fallback_usado'.

        Antes de chamar, confere o teto mensal: `Metodos_Integracao_IA.md`, na
        tabela de falhas, manda "Interromper requisicao e registrar alerta"
        quando o custo passa do limite. Interromper nao pode virar erro na cara
        do usuario - o fallback e o que AGENTS.md 0.2 exige de todo componente
        de IA -, entao o estouro devolve o caminho sem IA, nao excecao.
        """
        if not self._disponivel:
            logger.info(f'Gemini indisponivel - executando fallback para {tipo}')
            dados_fallback = fallback_fn()
            return {
                'dados': dados_fallback,
                'execucao_ia': None,
                'fallback_usado': True,
            }

        try:
            garantir_orcamento()
        except TetoDeCustoExcedido as estouro:
            logger.warning(f'{estouro} Executando fallback para {tipo}.')
            return {
                'dados': fallback_fn(),
                'execucao_ia': None,
                'fallback_usado': True,
            }

        execucao = self._criar_execucao(
            tipo=tipo,
            oportunidade_id=oportunidade_id,
            correlation_id=correlation_id,
            prompt_versao=prompt_versao,
            parametros=parametros,
            executado_por=executado_por,
        )

        import time
        inicio = time.perf_counter()

        try:
            response = self.model.generate_content(prompt)
            latencia_ms = int((time.perf_counter() - inicio) * 1000)

            tokens_entrada, tokens_saida = tokens_da_resposta(
                response, prompt=prompt
            )

            resultado = self._parse_json_seguro(response.text or '{}')

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

            # Fallback
            logger.info(f'Executando fallback para {tipo}')
            dados_fallback = fallback_fn()
            return {
                'dados': dados_fallback,
                'execucao_ia': execucao,
                'fallback_usado': True,
            }

    # ==================== PROMPTS ESPECIFICOS ====================

    def estruturar_proposta(
        self,
        oportunidade_id: int,
        entrada_bruta: str,
        contexto: str,
        correlation_id: uuid.UUID,
        executado_por: str,
    ) -> dict[str, Any]:
        """
        Copiloto de Estruturacao (RF04).
        Transforma entrada em proposta estruturada (8 elementos).
        """
        prompt = f"""
Você é o Copiloto de Estruturação do P&D Connect.
Sua tarefa: transformar a entrada bruta em uma proposta de P&D estruturada com 8 elementos.

ENTRADA BRUTA:
{entrada_bruta}

CONTEXTO ADICIONAL:
{contexto}

REGRAS:
1. Responda APENAS com JSON valido.
2. Os 8 campos sao obrigatorios (podem vir vazios se nao houver informacao).
3. "objetivos_especificos" deve ser array de strings.
4. Nao inclua comentarios, markdown ou explicacoes.

FORMATO DE SAIDA:
{{
  "problema_pesquisa": "string",
  "hipotese": "string ou null",
  "objetivo_geral": "string",
  "objetivos_especificos": ["string", "..."],
  "metodologia": "string",
  "resultados_esperados": "string",
  "caracterizacao_inovacao": "string",
  "infraestrutura_recursos": "string"
}}
"""

        def fallback():
            return {
                'problema_pesquisa': '',
                'hipotese': None,
                'objetivo_geral': '',
                'objetivos_especificos': [],
                'metodologia': '',
                'resultados_esperados': '',
                'caracterizacao_inovacao': '',
                'infraestrutura_recursos': '',
            }

        return self._executar_com_fallback(
            tipo=TipoExecucaoIA.COPILOTO,
            oportunidade_id=oportunidade_id,
            correlation_id=correlation_id,
            prompt_versao='copiloto_v1',
            prompt=prompt,
            parametros={'entrada_bruta': entrada_bruta[:200], 'contexto': contexto[:200]},
            fallback_fn=fallback,
            executado_por=executado_por,
        )

    def derivar_competencias(
        self,
        oportunidade_id: int,
        proposta_texto: str,
        correlation_id: uuid.UUID,
        executado_por: str,
    ) -> dict[str, Any]:
        """
        Deriva competencias necessarias da proposta (RF05).
        """
        prompt = f"""
Você é um especialista em gestao de P&D.
Extraia as competencias tecnicas/cientificas necessarias para executar esta proposta.

PROPOSTA ESTRUTURADA:
{proposta_texto}

REGRAS:
1. Responda APENAS com JSON valido.
2. Retorne array de objetos, cada um com: "descricao", "nivel_importancia" ("essencial" ou "desejavel").
3. Maximo 15 competencias.
4. Foque em conhecimentos tecnicos/cientificos reais (ex: "Microbiologia de alimentos", "PCR em tempo real", "Fermentacao industrial").

FORMATO:
{{
  "competencias": [
    {{"descricao": "string", "nivel_importancia": "essencial|desejavel"}},
    ...
  ]
}}
"""

        def fallback():
            return {'competencias': []}

        return self._executar_com_fallback(
            tipo=TipoExecucaoIA.COMPETENCIAS,
            oportunidade_id=oportunidade_id,
            correlation_id=correlation_id,
            prompt_versao='competencias_v1',
            prompt=prompt,
            parametros={'proposta_len': len(proposta_texto)},
            fallback_fn=fallback,
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
        """
        Matching: compara competencias necessarias com perfis da rede (RF06-RF08).
        """
        cand_text = '\n'.join([
            f"Candidato {i}: {c['nome']} | Titulação: {c.get('titulacao', 'N/A')} | "
            f"Disponibilidade: {c.get('disponibilidade', 'N/A')} | "
            f"Competencias: {', '.join(c.get('competencias', []))} | "
            f"Tecnicas: {', '.join(c.get('tecnicas', []))} | "
            f"Linhas: {', '.join(c.get('linhas', []))} | "
            f"Experiencia: {c.get('experiencia', 'N/A')[:200]}"
            for i, c in enumerate(candidatos)
        ])

        comp_text = '\n'.join([
            f"- {c['descricao']} ({c.get('nivel_importancia', 'essencial')})"
            for c in competencias_necessarias
        ])

        prompt = f"""
Você é o motor de Matching do P&D Connect.
Compare as competencias necessarias com os perfis da rede interna e rankie os melhores.

COMPETENCIAS NECESSARIAS:
{comp_text}

CANDIDATOS DA REDE ({len(candidatos)} total):
{cand_text}

REGRAS:
1. Responda APENAS com JSON valido.
2. Retorne "matches": array de objetos com:
   - "candidato_index": int (indice no array acima)
   - "nome": string
   - "score_compatibilidade": float 0.0-1.0
   - "match_reasons": array de strings (fatores que levaram ao match)
   - "score_features": object (features do score: ex: {{"titulacao": 0.8, "competencias": 0.6, "disponibilidade": 1.0}})
   - "papel_sugerido": "supervisor|pesquisador"
3. Ordene por score decrescente.
4. Maximo 10 matches.
5. So inclua se score >= 0.3.
"""

        def fallback():
            # Fallback: busca lexical simples (Jaccard) - implementado em matching service
            return {'matches': []}

        return self._executar_com_fallback(
            tipo=TipoExecucaoIA.MATCHING,
            oportunidade_id=oportunidade_id,
            correlation_id=correlation_id,
            prompt_versao='matching_v1',
            prompt=prompt,
            parametros={'num_candidatos': len(candidatos), 'num_competencias': len(competencias_necessarias)},
            fallback_fn=fallback,
            executado_por=executado_por,
        )

    def pre_analise_pipe(
        self,
        oportunidade_id: int,
        proposta_texto: str,
        equipe_texto: str,
        correlation_id: uuid.UUID,
        executado_por: str,
    ) -> dict[str, Any]:
        """
        Pre-analise PIPE/FAPESP (RF09, RF10).
        6 dimensoes: desafio_tecnologico, inovacao, plano_pesquisa, equipe_supervisao, infraestrutura, viabilidade.
        """
        prompt = f"""
Você é um analista de maturidade tecnologica orientado ao PIPE/FAPESP.
Avalie a proposta em 6 dimensoes e retorne lacunas + recomendacoes.

PROPOSTA:
{proposta_texto}

EQUIPE POTENCIAL:
{equipe_texto}

REGRAS:
1. Responda APENAS com JSON valido.
2. Para cada dimensao: "avaliacao" (texto), "nivel" ("consolidada"|"em_desenvolvimento"|"fragil"), "evidencias" (array).
3. "lacunas": array de objetos {{"dimensao": "...", "descricao": "..."}}.
4. "recomendacoes": array de strings acionaveis.
5. Nao use palavras "nota", "parecer", "aprovacao" - e orientativo apenas.

FORMATO:
{{
  "dimensoes": [
    {{"dimensao": "desafio_tecnologico", "avaliacao": "...", "nivel": "...", "evidencias": [...]}},
    {{"dimensao": "inovacao", "avaliacao": "...", "nivel": "...", "evidencias": [...]}},
    {{"dimensao": "plano_pesquisa", "avaliacao": "...", "nivel": "...", "evidencias": [...]}},
    {{"dimensao": "equipe_supervisao", "avaliacao": "...", "nivel": "...", "evidencias": [...]}},
    {{"dimensao": "infraestrutura", "avaliacao": "...", "nivel": "...", "evidencias": [...]}},
    {{"dimensao": "viabilidade", "avaliacao": "...", "nivel": "...", "evidencias": [...]}}
  ],
  "lacunas": [{{"dimensao": "...", "descricao": "..."}}, ...],
  "recomendacoes": ["...", "..."],
  "sintese": "Resumo executivo em 2-3 linhas"
}}
"""

        def fallback():
            return {
                'dimensoes': [],
                'lacunas': [],
                'recomendacoes': [],
                'sintese': 'Pre-analise nao disponivel (IA indisponivel).',
            }

        return self._executar_com_fallback(
            tipo=TipoExecucaoIA.PREANALISE,
            oportunidade_id=oportunidade_id,
            correlation_id=correlation_id,
            prompt_versao='preanalise_v1',
            prompt=prompt,
            parametros={'proposta_len': len(proposta_texto), 'equipe_len': len(equipe_texto)},
            fallback_fn=fallback,
            executado_por=executado_por,
        )