"""
Views da Oportunidade.

O portao real da leitura e `escopo_de()`, que chega aqui dentro de `fila_de()`
no `get_queryset`; a permissao de rota so decide quem pode tentar.
"""
from django.db.models import Q
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from apps.accounts.models import Papel
from apps.opportunities.serializers import (
    AnexoSerializer,
    CadastroOportunidadeSerializer,
    ComplementacaoSerializer,
    DecisaoSerializer,
    EventoHistoricoSerializer,
    FiltroDaFilaSerializer,
    ObservacaoRegistradaSerializer,
    ObservacaoSerializer,
    SolicitacaoComplementoSerializer,
    SolicitacaoRegistradaSerializer,
    OportunidadeSerializer,
    RelatorioOportunidadeSerializer,
    RelatorioEquipeSerializer,
    RelatorioPreAnaliseSerializer,
)
from apps.competencies.serializers import (
    CompetenciaNecessariaSerializer,
    CompetenciaNecessariaWriteSerializer,
    ResultadoDerivacaoSerializer,
)
from apps.competencies.services import (
    AdicionarCompetenciaService,
    AtualizarCompetenciaService,
    DerivarCompetenciasService,
    RemoverCompetenciaService,
    competencia_necessaria_de,
    competencias_de,
)
from apps.copilot.models import PropostaEstruturada
from apps.copilot.serializers import (
    EstadoCopilotoSerializer,
    MensagemCopilotoSerializer,
    PropostaEstruturadaSerializer,
    PropostaEstruturadaWriteSerializer,
    ResultadoEstruturacaoSerializer,
    RespostaCopilotoSerializer,
    SessaoCopilotoSerializer,
)
from apps.copilot.services import (
    AtualizarPropostaService,
    ConcluirSessaoService,
    EstruturarPropostaService,
    IniciarPropostaService,
    IniciarSessaoService,
    ResponderService,
    elementos_vazios,
    perguntas_orientadoras,
    proposta_de,
    sessao_aberta_de,
    sessao_atual_de,
)
from apps.ai.services.base_conhecimento import base_conhecimento
from apps.matching.serializers import (
    AjusteMembroSerializer,
    EquipePotencialSerializer,
    InclusaoMembroSerializer,
    MembroEquipeSerializer,
    ResultadoMatchingSerializer,
)
from apps.matching.services import (
    AdicionarMembroService,
    AjustarMembroService,
    ExecutarMatchingService,
    ValidarEquipeService,
    equipe_atual_de,
    membro_da_equipe,
)
from apps.maturity.serializers import (
    AcatarRecomendacaoSerializer,
    PreAnaliseSerializer,
    RecomendacaoSerializer,
)
from apps.maturity.services import (
    AcatarRecomendacaoService,
    PreAnalisarService,
    preanalise_atual_de,
    recomendacao_de,
)
from apps.network.models import MembroRede
from apps.opportunities.services import (
    AnexarDocumentoService,
    AtualizarContextoService,
    CadastrarOportunidadeService,
    ComplementarOportunidadeService,
    EquipeDaOportunidade,
    FluxoDaOportunidade,
    PreAnaliseDaOportunidade,
    RegistrarDecisaoService,
    RegistrarObservacaoService,
    SolicitarComplementoService,
    fila_de,
    historico_de,
)
from core.exceptions import AcaoNaoPermitida
from core.permissions import EhSupervisor, TemPapel


class PodeVerOportunidade(TemPapel):
    """Os tres atores do fluxo. O Administrador nao entra (CONTEXT.md secao 3)."""

    papeis_permitidos = (Papel.SUPERVISOR, Papel.PESQUISADOR, Papel.DEMANDANTE)


class PodeVerProposta(TemPapel):
    """
    O Demandante fica fora: PB71 lhe da o andamento "sem acessar informacoes
    internas restritas", e a proposta e trabalho interno - a mesma razao que
    mantem `copiloto` fora de CATEGORIAS_VISIVEIS_AO_DEMANDANTE.
    """

    papeis_permitidos = (Papel.SUPERVISOR, Papel.PESQUISADOR)


ACOES_DE_TRABALHO_INTERNO = (
    'proposta',
    'copiloto',
    'copiloto_responder',
    'copiloto_estruturar',
    'copiloto_concluir',
    'competencias',
    'competencias_derivar',
    'competencia_item',
    'equipe',
    'equipe_membros',
    'equipe_membro_item',
    'equipe_validar',
    'pre_analise',
    'recomendacao_item',
)
"""
As etapas internas do fluxo (`CONTEXT.md` secao 5, passos 3 a 12).

Leitura: Supervisor e Pesquisador. Escrita: Supervisor. O Demandante fica fora
das duas - PB71 lhe da o andamento "sem acessar informacoes internas
restritas", e e aqui que esse recorte acontece, no servidor.
"""


class OportunidadeViewSet(viewsets.ModelViewSet):
    """
    `/api/oportunidades/` - o registro central do sistema (RF01).

    A URL usa o codigo (`OP-2026-014`), nao a PK: e o identificador que o
    cliente le, diz e digita.
    """

    serializer_class = OportunidadeSerializer
    lookup_field = 'codigo'
    lookup_value_regex = r'OP-\d{4}-\d{3}'
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_permissions(self):
        if self.action in ACOES_DE_TRABALHO_INTERNO:
            if self.request.method in ('POST', 'PATCH', 'PUT', 'DELETE'):
                return [permissions.IsAuthenticated(), EhSupervisor()]

            return [permissions.IsAuthenticated(), PodeVerProposta()]

        if self.action in (
            'decisao',
            'observacoes',
            'solicitar_complemento',
            'partial_update',
            'relatorio',
            'relatorio_preanalise',
            'relatorio_equipe',
        ):
            return [permissions.IsAuthenticated(), EhSupervisor()]

        return [permissions.IsAuthenticated(), PodeVerOportunidade()]

    def get_queryset(self):
        queryset = fila_de(self.request.user)

        situacao = self.request.query_params.get('situacao')
        if situacao:
            queryset = queryset.filter(situacao=situacao)

        origem = self.request.query_params.get('origem')
        if origem:
            queryset = queryset.filter(origem=origem)

        busca = self.request.query_params.get('busca')
        if busca:
            queryset = queryset.filter(
                Q(titulo__icontains=busca)
                | Q(codigo__icontains=busca)
                | Q(demandante__nome__icontains=busca)
            )

        filtro = FiltroDaFilaSerializer(data=self.request.query_params)
        filtro.is_valid(raise_exception=True)

        if 'cadastrada_de' in filtro.validated_data:
            queryset = queryset.filter(
                criada_em__date__gte=filtro.validated_data['cadastrada_de']
            )

        if 'cadastrada_ate' in filtro.validated_data:
            queryset = queryset.filter(
                criada_em__date__lte=filtro.validated_data['cadastrada_ate']
            )

        return queryset

    @extend_schema(
        request=CadastroOportunidadeSerializer, responses=OportunidadeSerializer
    )
    def create(self, request, *args, **kwargs):
        serializer = CadastroOportunidadeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        oportunidade = CadastrarOportunidadeService().execute(
            dados=dict(serializer.validated_data), ator=request.user
        )

        return Response(
            self.get_serializer(oportunidade).data, status=status.HTTP_201_CREATED
        )

    def partial_update(self, request, *args, **kwargs):
        """
        Edicao do contexto pelo Supervisor (PB20).

        `get_object()` uma vez so. Chamado duas vezes, eram dois `SELECT`
        identicos na mesma requisicao e - o que pesa mais que o custo - duas
        instancias do mesmo registro: a que o serializer validou e a que o
        service gravou.
        """
        oportunidade = self.get_object()

        serializer = self.get_serializer(
            oportunidade, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)

        oportunidade = AtualizarContextoService().execute(
            oportunidade=oportunidade,
            dados=dict(serializer.validated_data),
            ator=request.user,
        )

        return Response(self.get_serializer(oportunidade).data)

    @extend_schema(request=DecisaoSerializer, responses=OportunidadeSerializer)
    @action(detail=True, methods=['post'], url_path='decisao', url_name='decisao')
    def decisao(self, request, codigo=None):
        """Continuar, Revisar ou Arquivar - com justificativa (RN-A07)."""
        serializer = DecisaoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        oportunidade = self.get_object()

        RegistrarDecisaoService().execute(
            oportunidade=oportunidade,
            tipo=serializer.validated_data['tipo'],
            justificativa=serializer.validated_data['justificativa'],
            ator=request.user,
        )

        oportunidade.refresh_from_db()
        return Response(self.get_serializer(oportunidade).data)

    @extend_schema(
        request=ComplementacaoSerializer, responses=OportunidadeSerializer
    )
    @action(detail=True, methods=['post'], url_path='complementar',
            url_name='complementar')
    def complementar(self, request, codigo=None):
        """Resposta do Demandante ao pedido de revisao (PB27)."""
        if request.user.papel != Papel.DEMANDANTE:
            raise AcaoNaoPermitida(
                'A complementacao e respondida pelo Demandante.',
                codigo='papel_nao_complementa',
            )

        serializer = ComplementacaoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        oportunidade = ComplementarOportunidadeService().execute(
            oportunidade=self.get_object(),
            texto=serializer.validated_data['texto'],
            ator=request.user,
        )

        return Response(self.get_serializer(oportunidade).data)

    @extend_schema(
        request=SolicitacaoComplementoSerializer,
        responses=SolicitacaoRegistradaSerializer,
    )
    @action(detail=True, methods=['post'], url_path='solicitar-complemento',
            url_name='solicitar-complemento')
    def solicitar_complemento(self, request, codigo=None):
        """
        Pedido de informacao complementar ao Demandante (PB26).

        So escrita, como a observacao: o pedido mora na trilha, e a leitura e a
        aba Historico. Duas rotas para a mesma verdade divergem no primeiro mes.
        """
        serializer = SolicitacaoComplementoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        registrada = SolicitarComplementoService().execute(
            oportunidade=self.get_object(),
            mensagem=serializer.validated_data['mensagem'],
            ator=request.user,
        )

        return Response(
            SolicitacaoRegistradaSerializer(registrada).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(
        request=ObservacaoSerializer, responses=ObservacaoRegistradaSerializer
    )
    @action(detail=True, methods=['post'], url_path='observacoes',
            url_name='observacoes')
    def observacoes(self, request, codigo=None):
        """
        Nota do Supervisor durante a avaliacao (PB65).

        So escrita: a leitura e a aba Historico, porque a nota mora na trilha.
        Duas rotas para a mesma verdade divergem no primeiro mes.
        """
        serializer = ObservacaoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        registrada = RegistrarObservacaoService().execute(
            oportunidade=self.get_object(),
            texto=serializer.validated_data['texto'],
            ator=request.user,
        )

        return Response(
            ObservacaoRegistradaSerializer(registrada).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(responses=AnexoSerializer(many=True))
    @action(detail=True, methods=['get', 'post'], url_path='anexos',
            url_name='anexos', parser_classes=[MultiPartParser, FormParser])
    def anexos(self, request, codigo=None):
        """
        Anexos vinculados a oportunidade (PB21).

        A permissao e a mesma da oportunidade: quem alcanca o registro alcanca
        os documentos dele. O `get_object` ja aplicou o escopo.
        """
        oportunidade = self.get_object()

        if request.method == 'GET':
            return Response(
                AnexoSerializer(oportunidade.anexos.all(), many=True).data
            )

        arquivo = request.FILES.get('arquivo')

        if arquivo is None:
            return Response(
                {'detail': 'Envie o arquivo no campo `arquivo`.',
                 'codigo': 'arquivo_ausente'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        anexo = AnexarDocumentoService().execute(
            oportunidade=oportunidade, arquivo=arquivo, ator=request.user
        )

        return Response(
            AnexoSerializer(anexo).data, status=status.HTTP_201_CREATED
        )

    @extend_schema(responses=EventoHistoricoSerializer(many=True))
    @action(detail=True, methods=['get'], url_path='historico',
            url_name='historico')
    def historico(self, request, codigo=None):
        """A trilha da oportunidade (RF12 / PB69, PB70), no recorte de cada ator."""
        eventos = historico_de(self.get_object(), request.user)

        return Response(EventoHistoricoSerializer(eventos, many=True).data)

    @extend_schema(responses=RelatorioOportunidadeSerializer)
    @action(detail=True, methods=['get'], url_path='relatorio',
            url_name='relatorio')
    def relatorio(self, request, codigo=None):
        """
        A visao consolidada da oportunidade (PB76).

        O documento e do Supervisor: o plano o lista na tela dele, e PB71
        mantem o Demandante com o andamento, sem o trabalho interno que o
        relatorio reune.

        A view so orquestra - quem sabe montar o documento e o facade.
        """
        fluxo = FluxoDaOportunidade(self.get_object())

        return Response(RelatorioOportunidadeSerializer(fluxo.relatorio()).data)

    @extend_schema(
        request=PropostaEstruturadaWriteSerializer,
        responses=PropostaEstruturadaSerializer,
    )
    @action(
        detail=True,
        methods=['get', 'post', 'patch'],
        url_path='proposta',
        url_name='proposta',
    )
    def proposta(self, request, codigo=None):
        """
        A Proposta Estruturada da oportunidade (RF04).

        Os tres metodos moram numa action so de proposito: o router cria uma
        rota por action, e duas actions no mesmo `url_path` deixam a primeira
        registrada respondendo 405 as demais. Quem pode o que esta em
        `get_permissions`, que aqui ramifica pelo metodo.
        """
        oportunidade = self.get_object()

        if request.method == 'POST':
            proposta = IniciarPropostaService().execute(
                oportunidade=oportunidade, ator=request.user
            )
            return Response(
                PropostaEstruturadaSerializer(proposta).data,
                status=status.HTTP_201_CREATED,
            )

        proposta = proposta_de(oportunidade)

        if request.method == 'GET':
            return Response(PropostaEstruturadaSerializer(proposta).data)

        serializer = PropostaEstruturadaWriteSerializer(
            proposta, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)

        proposta = AtualizarPropostaService().execute(
            proposta=proposta,
            dados=serializer.validated_data,
            ator=request.user,
        )

        return Response(PropostaEstruturadaSerializer(proposta).data)

    def destroy(self, request, *args, **kwargs):
        """
        Oportunidade nao se apaga.

        O `DELETE` existe na rota para o recurso aninhado da competencia
        necessaria; no registro central ele e recusado de proposito: a saida do
        fluxo e **Arquivar**, com historico preservado (D03 / RF11).
        """
        raise AcaoNaoPermitida(
            'A oportunidade não é apagada: o encerramento é a decisão '
            'Arquivar, que preserva o histórico.',
            codigo='oportunidade_nao_apaga',
        )



    @extend_schema(responses=RelatorioEquipeSerializer)
    @action(
        detail=True,
        methods=['get'],
        url_path='relatorio-equipe',
        url_name='relatorio-equipe',
    )
    def relatorio_equipe(self, request, codigo=None):
        """
        O Relatorio de Equipe Potencial (PB77).

        Documento da composicao sugerida com as aderencias do matching: quem
        entrou, por que entrou (`match_reasons`), com que score, e contra quais
        competencias necessarias. Sem rodada, o 404 explicado da aba - nao ha
        composicao a documentar.
        """
        fluxo = EquipeDaOportunidade(self.get_object())

        return Response(RelatorioEquipeSerializer(fluxo.relatorio()).data)

    @extend_schema(responses=RelatorioPreAnaliseSerializer)
    @action(
        detail=True,
        methods=['get'],
        url_path='relatorio-preanalise',
        url_name='relatorio-preanalise',
    )
    def relatorio_preanalise(self, request, codigo=None):
        """
        O Relatorio da Pre-analise (PB78).

        Documento consolidado da ultima execucao: resultado por dimensao,
        lacunas e recomendacoes, com os criterios da **versao que ela citou**.
        Sem execucao, responde o 404 explicado que a aba usa - a tela oferece
        executar em vez de imprimir folha vazia.
        """
        fluxo = PreAnaliseDaOportunidade(self.get_object())

        return Response(RelatorioPreAnaliseSerializer(fluxo.relatorio()).data)

    def _estado_do_copiloto(self, oportunidade):
        """
        O retrato da aba Copiloto sem gravar nada.

        A proposta nao e criada aqui: `GET` que escreve e surpresa, e a tela
        precisa poder mostrar "nenhum elemento preenchido" antes do primeiro
        clique.
        """
        proposta = getattr(oportunidade, 'proposta', None)
        transitoria = proposta or PropostaEstruturada(oportunidade=oportunidade)
        sessao = sessao_aberta_de(oportunidade)
        base = base_conhecimento()

        return {
            'sessao': sessao,
            'mensagens': list(sessao.mensagens.all()) if sessao else [],
            'perguntas': perguntas_orientadoras(transitoria),
            'lacunas': list(
                proposta.lacunas.filter(tipo='proposta', resolvida=False)
            ) if proposta is not None else [],
            'elementos_vazios': elementos_vazios(transitoria),
            'proposta_iniciada': proposta is not None,
            'base_disponivel': base.disponivel,
            'baseline_id': base.baseline_id,
        }

    @extend_schema(responses=EstadoCopilotoSerializer)
    @action(
        detail=True,
        methods=['get', 'post'],
        url_path='copiloto',
        url_name='copiloto',
    )
    def copiloto(self, request, codigo=None):
        """O Copiloto de Estruturacao (RF04): estado da sessao e abertura dela."""
        oportunidade = self.get_object()

        if request.method == 'POST':
            sessao = IniciarSessaoService().execute(
                oportunidade=oportunidade, ator=request.user
            )
            return Response(
                SessaoCopilotoSerializer(sessao).data,
                status=status.HTTP_201_CREATED,
            )

        return Response(
            EstadoCopilotoSerializer(self._estado_do_copiloto(oportunidade)).data
        )

    @extend_schema(
        request=RespostaCopilotoSerializer, responses=MensagemCopilotoSerializer
    )
    @action(
        detail=True,
        methods=['post'],
        url_path='copiloto/responder',
        url_name='copiloto-responder',
    )
    def copiloto_responder(self, request, codigo=None):
        """A resposta humana as perguntas orientadoras (PB39)."""
        serializer = RespostaCopilotoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        mensagem = ResponderService().execute(
            sessao=sessao_atual_de(self.get_object()),
            texto=serializer.validated_data['texto'],
            ator=request.user,
        )

        return Response(
            MensagemCopilotoSerializer(mensagem).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(responses=ResultadoEstruturacaoSerializer)
    @action(
        detail=True,
        methods=['post'],
        url_path='copiloto/estruturar',
        url_name='copiloto-estruturar',
    )
    def copiloto_estruturar(self, request, codigo=None):
        """Uma rodada de estruturacao (RF04). Saida sempre revisavel (RN-A07)."""
        resultado = EstruturarPropostaService().execute(
            oportunidade=self.get_object(), ator=request.user
        )

        execucao = resultado['execucao_ia']

        return Response(
            ResultadoEstruturacaoSerializer(
                {
                    'preenchidos': resultado['preenchidos'],
                    'lacunas': resultado['lacunas'],
                    'fallback_usado': resultado['fallback_usado'],
                    'ai_run_id': execucao.id_execucao_ia if execucao else None,
                    'proposta': resultado['proposta'],
                }
            ).data
        )

    @extend_schema(responses=SessaoCopilotoSerializer)
    @action(
        detail=True,
        methods=['post'],
        url_path='copiloto/concluir',
        url_name='copiloto-concluir',
    )
    def copiloto_concluir(self, request, codigo=None):
        """Encerra a sessao. A proposta segue editavel na aba Proposta."""
        sessao = ConcluirSessaoService().execute(
            sessao=sessao_atual_de(self.get_object()), ator=request.user
        )

        return Response(SessaoCopilotoSerializer(sessao).data)

    @extend_schema(
        request=CompetenciaNecessariaWriteSerializer,
        responses=CompetenciaNecessariaSerializer(many=True),
    )
    @action(
        detail=True,
        methods=['get', 'post'],
        url_path='competencias',
        url_name='competencias',
    )
    def competencias(self, request, codigo=None):
        """As Competencias Necessarias da proposta (RF05)."""
        oportunidade = self.get_object()

        if request.method == 'POST':
            serializer = CompetenciaNecessariaWriteSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)

            competencia = AdicionarCompetenciaService().execute(
                oportunidade=oportunidade,
                dados=dict(serializer.validated_data),
                ator=request.user,
            )

            return Response(
                CompetenciaNecessariaSerializer(competencia).data,
                status=status.HTTP_201_CREATED,
            )

        return Response(
            CompetenciaNecessariaSerializer(
                competencias_de(oportunidade), many=True
            ).data
        )

    @extend_schema(responses=ResultadoDerivacaoSerializer)
    @action(
        detail=True,
        methods=['post'],
        url_path='competencias/derivar',
        url_name='competencias-derivar',
    )
    def competencias_derivar(self, request, codigo=None):
        """Deriva as competencias da proposta (RF05 / PB42)."""
        resultado = DerivarCompetenciasService().execute(
            oportunidade=self.get_object(), ator=request.user
        )

        execucao = resultado['execucao_ia']

        return Response(
            ResultadoDerivacaoSerializer(
                {
                    'criadas': resultado['criadas'],
                    'fallback_usado': resultado['fallback_usado'],
                    'ai_run_id': execucao.id_execucao_ia if execucao else None,
                }
            ).data
        )

    @extend_schema(
        request=CompetenciaNecessariaWriteSerializer,
        responses=CompetenciaNecessariaSerializer,
    )
    @action(
        detail=True,
        methods=['patch', 'delete'],
        url_path=r'competencias/(?P<identificador>[0-9]+)',
        url_name='competencia',
    )
    def competencia_item(self, request, codigo=None, identificador=None):
        """A revisao humana de uma competencia derivada (PB42)."""
        competencia = competencia_necessaria_de(
            self.get_object(), int(identificador)
        )

        if request.method == 'DELETE':
            RemoverCompetenciaService().execute(
                competencia=competencia, ator=request.user
            )
            return Response(status=status.HTTP_204_NO_CONTENT)

        serializer = CompetenciaNecessariaWriteSerializer(
            competencia, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)

        competencia = AtualizarCompetenciaService().execute(
            competencia=competencia,
            dados=dict(serializer.validated_data),
            ator=request.user,
        )

        return Response(CompetenciaNecessariaSerializer(competencia).data)

    @extend_schema(responses=EquipePotencialSerializer)
    @action(
        detail=True,
        methods=['get', 'post'],
        url_path='equipe',
        url_name='equipe',
    )
    def equipe(self, request, codigo=None):
        """A Equipe Potencial (RF06-RF08). `POST` roda um novo matching."""
        oportunidade = self.get_object()

        if request.method == 'POST':
            resultado = ExecutarMatchingService().execute(
                oportunidade=oportunidade, ator=request.user
            )

            return Response(
                ResultadoMatchingSerializer(
                    {
                        'equipe': resultado['equipe'],
                        'avaliados': resultado['avaliados'],
                    }
                ).data,
                status=status.HTTP_201_CREATED,
            )

        return Response(EquipePotencialSerializer(equipe_atual_de(oportunidade)).data)

    @extend_schema(
        request=InclusaoMembroSerializer, responses=MembroEquipeSerializer
    )
    @action(
        detail=True,
        methods=['post'],
        url_path='equipe/membros',
        url_name='equipe-membros',
    )
    def equipe_membros(self, request, codigo=None):
        """A inclusao manual do Supervisor (RF08 / PB47)."""
        serializer = InclusaoMembroSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        equipe = equipe_atual_de(self.get_object())
        membro = AdicionarMembroService().execute(
            equipe=equipe,
            membro_rede=MembroRede.objects.get(
                id_membro=serializer.validated_data['id_membro']
            ),
            papel=serializer.validated_data['papel'],
            ator=request.user,
        )

        return Response(
            MembroEquipeSerializer(membro).data, status=status.HTTP_201_CREATED
        )

    @extend_schema(request=AjusteMembroSerializer, responses=MembroEquipeSerializer)
    @action(
        detail=True,
        methods=['patch'],
        url_path=r'equipe/membros/(?P<identificador>[0-9]+)',
        url_name='equipe-membro',
    )
    def equipe_membro_item(self, request, codigo=None, identificador=None):
        """Inclui ou tira alguem da composicao sugerida (RF08)."""
        equipe = equipe_atual_de(self.get_object())
        membro = membro_da_equipe(equipe, int(identificador))

        serializer = AjusteMembroSerializer(membro, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        membro = AjustarMembroService().execute(
            membro=membro,
            dados=dict(serializer.validated_data),
            ator=request.user,
        )

        return Response(MembroEquipeSerializer(membro).data)

    @extend_schema(responses=EquipePotencialSerializer)
    @action(
        detail=True,
        methods=['post'],
        url_path='equipe/validar',
        url_name='equipe-validar',
    )
    def equipe_validar(self, request, codigo=None):
        """O Supervisor valida a composicao (RF08 / D07). Nao convoca ninguem."""
        equipe = ValidarEquipeService().execute(
            equipe=equipe_atual_de(self.get_object()), ator=request.user
        )

        return Response(EquipePotencialSerializer(equipe).data)

    @extend_schema(responses=PreAnaliseSerializer)
    @action(
        detail=True,
        methods=['get', 'post'],
        url_path='pre-analise',
        url_name='pre-analise',
    )
    def pre_analise(self, request, codigo=None):
        """
        A Pre-analise de Maturidade PIPE/FAPESP (RF09) e a reavaliacao (RF10).

        `POST` sempre cria uma execucao nova: a anterior fica, com a versao de
        criterios e a versao da proposta que avaliou.
        """
        oportunidade = self.get_object()

        if request.method == 'POST':
            analise = PreAnalisarService().execute(
                oportunidade=oportunidade, ator=request.user
            )

            return Response(
                PreAnaliseSerializer(analise).data,
                status=status.HTTP_201_CREATED,
            )

        return Response(PreAnaliseSerializer(preanalise_atual_de(oportunidade)).data)

    @extend_schema(
        request=AcatarRecomendacaoSerializer, responses=RecomendacaoSerializer
    )
    @action(
        detail=True,
        methods=['patch'],
        url_path=r'recomendacoes/(?P<identificador>[0-9]+)',
        url_name='recomendacao',
    )
    def recomendacao_item(self, request, codigo=None, identificador=None):
        """Marca a recomendacao como acatada - o par da reavaliacao (RF10)."""
        serializer = AcatarRecomendacaoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        recomendacao = AcatarRecomendacaoService().execute(
            recomendacao=recomendacao_de(self.get_object(), int(identificador)),
            acatada=serializer.validated_data['acatada'],
            ator=request.user,
        )

        return Response(RecomendacaoSerializer(recomendacao).data)
