"""
Semeia o banco LOCAL com volume, para conferir as telas com cara de uso real.

    python manage.py semear_volume_dev
    python manage.py semear_volume_dev --oportunidades 80

Monta uma rede de 60 pessoas, 12 empresas demandantes e oportunidades em todas
as etapas do fluxo. Ate as competencias, cada oportunidade passa pelos services
de sempre. O resultado do matching e o da pre-analise sao gravados como se a IA
tivesse rodado: nenhuma chamada a provedor, nenhum e-mail. A situacao final e a
que os dados dizem (`ajustar_pelos_dados`); as decididas recebem a decisao e
passam pelo `mover`.

Pessoas e empresas sao ficticias (`@*.example`), sem senha utilizavel. O plano
sai de um sorteio com semente fixa, entao rodar de novo nao duplica nada.

AGENTS.md 0.1: roda apenas contra banco local, com a trava do `semear_dev`.
"""
import random
import unicodedata
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.test.utils import override_settings
from django.utils import timezone

from apps.accounts.models import Papel, SituacaoConta, Usuario
from apps.accounts.services.criadores import CriadorDeDemandante
from apps.ai.models import StatusExecucao
from apps.competencies.models import NivelImportancia
from apps.competencies.services.derivacao import AdicionarCompetenciaService
from apps.copilot.models import Lacuna, Severidade, TipoLacuna
from apps.copilot.services.proposta import AtualizarPropostaService, IniciarPropostaService
from apps.decisions.models import Decisao, TipoDecisao
from apps.matching.models import (
    EquipePotencial,
    ExecucaoMatching,
    LacunaCompetenciaEquipe,
    MembroEquipe,
    OrigemIndicacao,
)
from apps.matching.services.motor import ESTRATEGIA_HIBRIDA
from apps.maturity.models import (
    DimensaoMaturidade,
    NivelDimensao,
    OrigemRecomendacao,
    PreAnalise,
    PreAnaliseDimensao,
    Recomendacao,
)
from apps.maturity.services.preanalise import (
    ImportarCriteriosService,
    criterios_vigentes,
    versao_vigente,
)
from apps.network.models import (
    Disponibilidade,
    MembroRede,
    PapelNaRede,
    SituacaoMembro,
    Titulacao,
)
from apps.network.services.rede import CadastrarMembroService
from apps.opportunities.models import (
    Oportunidade,
    PrioridadeOportunidade,
    SituacaoOportunidade as S,
)
from apps.opportunities.services.fluxo import ETAPAS_EM_CURSO, ajustar_pelos_dados, mover
from apps.opportunities.services.oportunidade import CadastrarOportunidadeService
from apps.organizations.cnpj import PESOS_PRIMEIRO_DIGITO, PESOS_SEGUNDO_DIGITO
from apps.organizations.models import Organizacao, TipoOrganizacao
from core.management.commands.semear_dev import TITULACOES, exigir_banco_local

SEMENTE = 2026

ESSENCIAL = NivelImportancia.ESSENCIAL
DESEJAVEL = NivelImportancia.DESEJAVEL

COORDENACAO = ('coordenacao.volume@ac2.example', 'Coordenação fictícia (seed de volume)')

DECISAO_DA_SITUACAO = {
    S.CONTINUAR: TipoDecisao.CONTINUAR,
    S.REVISAR: TipoDecisao.REVISAR,
    S.ARQUIVADA: TipoDecisao.ARQUIVAR,
}

PESO_DAS_ETAPAS = {
    S.ENTRADA: 3,
    S.ESTRUTURACAO: 3,
    S.COMPETENCIAS: 2,
    S.MATCHING: 3,
    S.PRE_ANALISE: 1,
    S.AGUARDANDO_DECISAO: 3,
    S.CONTINUAR: 4,
    S.REVISAR: 2,
    S.ARQUIVADA: 2,
}

NOMES = [
    'Ana', 'Bruno', 'Carla', 'Daniel', 'Elisa', 'Fábio', 'Gabriela', 'Hugo',
    'Isabela', 'João', 'Karina', 'Leonardo', 'Mariana', 'Nícolas', 'Olívia',
    'Paulo', 'Renata', 'Samuel', 'Talita', 'Vinícius', 'Yara', 'Wagner',
    'Priscila', 'Otávio', 'Natália', 'Lucas', 'Camila', 'Gustavo', 'Débora', 'Rafaela',
]

SOBRENOMES = [
    'Albuquerque', 'Barros', 'Cardoso', 'Damasceno', 'Esteves', 'Figueira',
    'Guimarães', 'Holanda', 'Jardim', 'Lacerda', 'Macedo', 'Nunes', 'Pacheco',
    'Quintela', 'Rezende', 'Siqueira', 'Toledo', 'Valença', 'Xavier', 'Zanetti',
    'Moraes', 'Teixeira', 'Bittencourt', 'Coutinho',
]

AREAS = {
    'micologia': {
        'competencias': ['Micologia de alimentos', 'Controle de qualidade microbiológico'],
        'tecnicas': ['Contagem de bolores e leveduras', 'Microscopia de fungos filamentosos'],
        'linha': 'Deterioração fúngica de alimentos',
    },
    'bioconservacao': {
        'competencias': ['Bactérias láticas', 'Bioconservação de alimentos'],
        'tecnicas': ['Fermentação em batelada', 'Ensaio de antagonismo in vitro'],
        'linha': 'Bioconservação com culturas protetoras',
    },
    'molecular': {
        'competencias': ['Detecção molecular de patógenos', 'Validação de métodos analíticos'],
        'tecnicas': ['PCR em tempo real', 'Desenho de primers e sondas'],
        'linha': 'Diagnóstico molecular em segurança de alimentos',
    },
    'genomica': {
        'competencias': ['Bioinformática', 'Genômica microbiana'],
        'tecnicas': ['Sequenciamento de genoma completo', 'Análise de metagenoma'],
        'linha': 'Genômica de patógenos de alimentos',
    },
    'patogenos': {
        'competencias': ['Listeria monocytogenes', 'Salmonella e enterobactérias', 'Higiene industrial'],
        'tecnicas': ['Swab de superfície', 'Quantificação de biofilmes', 'Isolamento em meio seletivo'],
        'linha': 'Segurança de alimentos',
    },
    'bioinsumos': {
        'competencias': ['Controle biológico', 'Formulação de bioinsumos', 'Nematologia agrícola'],
        'tecnicas': ['Ensaio em casa de vegetação', 'Produção de esporos de Bacillus'],
        'linha': 'Bioinsumos agrícolas',
    },
    'fermentacao': {
        'competencias': ['Leveduras', 'Fermentação de bebidas'],
        'tecnicas': ['Cromatografia gasosa', 'Análise de compostos voláteis'],
        'linha': 'Fermentação controlada de bebidas',
    },
    'qualidade': {
        'competencias': ['Boas práticas de fabricação', 'APPCC'],
        'tecnicas': ['Auditoria de qualidade', 'Mapeamento de pontos críticos'],
        'linha': 'Gestão da qualidade em alimentos',
    },
    'sensorial': {
        'competencias': ['Análise sensorial', 'Tecnologia de panificação'],
        'tecnicas': ['Painel sensorial treinado', 'Teste de aceitação'],
        'linha': 'Qualidade sensorial de alimentos',
    },
    'estatistica': {
        'competencias': ['Planejamento experimental e estatística', 'Modelagem de vida de prateleira'],
        'tecnicas': ['Delineamento fatorial', 'Análise de sobrevivência'],
        'linha': 'Estatística aplicada a bioprocessos',
    },
    'ambiental': {
        'competencias': ['Microbiologia ambiental', 'Tratamento biológico de efluentes'],
        'tecnicas': ['Respirometria', 'Análise de DBO e DQO'],
        'linha': 'Biorremediação de efluentes agroindustriais',
    },
    'probioticos': {
        'competencias': ['Probióticos', 'Microbiologia de laticínios'],
        'tecnicas': ['Ensaio de viabilidade celular', 'Simulação gastrointestinal in vitro'],
        'linha': 'Alimentos funcionais',
    },
}

EMPRESAS = {
    'campoalegre': ('Laticínios Campo Alegre (fictício)', 'Laticínios Campo Alegre'),
    'serraazul': ('Frigorífico Serra Azul (fictício)', 'Frigorífico Serra Azul'),
    'valedolupulo': ('Cervejaria Vale do Lúpulo (fictício)', 'Cervejaria Vale do Lúpulo'),
    'planalto': ('Cooperativa Agrícola Planalto (fictício)', 'Cooperativa Planalto'),
    'boaesperanca': ('Usina Boa Esperança (fictício)', 'Usina Boa Esperança'),
    'pomardourado': ('Sucos Pomar Dourado (fictício)', 'Sucos Pomar Dourado'),
    'ovosdosul': ('Granja Ovos do Sul (fictício)', 'Granja Ovos do Sul'),
    'terraviva': ('Biofábrica Terra Viva (fictício)', 'Biofábrica Terra Viva'),
    'paodaserra': ('Panificadora Pão da Serra (fictício)', 'Panificadora Pão da Serra'),
    'nutricampo': ('Rações NutriCampo (fictício)', 'Rações NutriCampo'),
    'encostafria': ('Vinícola Encosta Fria (fictício)', 'Vinícola Encosta Fria'),
    'cafedomorro': ('Torrefação Café do Morro (fictício)', 'Café do Morro'),
}

TEMAS = [
    {
        'area': 'patogenos', 'empresas': ['campoalegre', 'serraazul'],
        'titulo': 'Listeria persistente na área de fatiamento',
        'resumo': 'Amostras de superfície seguem positivas para Listeria mesmo após a higienização diária.',
        'contexto': 'A contaminação aparece nas fatiadoras e nas esteiras. A equipe suspeita de biofilme, mas não tem como confirmar.',
        'alvo': 'o biofilme de Listeria nas superfícies de contato',
        'acao': 'um protocolo de higienização validado contra biofilme',
        'metodo': 'swabs semanais, quantificação de biofilme e ensaio de sanitizantes em cupons de aço inox',
        'meta': 'Reduzir em 90% as amostras positivas de superfície em seis meses.',
        'inovacao': 'Protocolo ajustado à matriz e ao equipamento da planta, com indicador de biofilme no lugar da contagem pontual.',
        'competencias': [
            ('Listeria monocytogenes', ESSENCIAL), ('Higiene industrial', ESSENCIAL),
            ('Quantificação de biofilmes em superfícies industriais', ESSENCIAL),
            ('Planejamento experimental e estatística', DESEJAVEL),
        ],
    },
    {
        'area': 'molecular', 'empresas': ['nutricampo', 'ovosdosul'],
        'titulo': 'Liberação mais rápida de lotes por PCR',
        'resumo': 'Lotes ficam retidos até cinco dias à espera do laudo de Salmonella.',
        'contexto': 'O método de referência é lento e a armazenagem dos lotes retidos tem custo alto.',
        'alvo': 'o tempo de liberação de lotes analisados para Salmonella',
        'acao': 'um ensaio de PCR em tempo real com pré-enriquecimento curto',
        'metodo': 'desenho de primers, otimização do pré-enriquecimento e estudo comparativo com o método ISO 6579',
        'meta': 'Resultado em menos de 24 horas, com sensibilidade de pelo menos 95%.',
        'inovacao': 'Protocolo validado para a matriz da empresa, onde os kits comerciais sofrem inibição.',
        'competencias': [
            ('Detecção molecular de patógenos', ESSENCIAL), ('Salmonella e enterobactérias', ESSENCIAL),
            ('Validação de métodos analíticos', ESSENCIAL), ('Bioinformática', DESEJAVEL),
        ],
    },
    {
        'area': 'micologia', 'empresas': ['paodaserra'],
        'titulo': 'Bolor precoce no pão sem conservantes',
        'resumo': 'O pão sem conservantes embolora antes do prazo que o varejo exige.',
        'contexto': 'A empresa retirou o propionato da fórmula e perdeu vida de prateleira.',
        'alvo': 'a deterioração fúngica do pão sem conservantes',
        'acao': 'uma cultura protetora aplicada na massa',
        'metodo': 'isolamento dos fungos deteriorantes, ensaio de antagonismo e estudo de vida de prateleira',
        'meta': 'Vida de prateleira de dez dias com a mesma aceitação sensorial.',
        'inovacao': 'Substituição do conservante químico por bioconservação em linha industrial.',
        'competencias': [
            ('Micologia de alimentos', ESSENCIAL), ('Bioconservação de alimentos', ESSENCIAL),
            ('Análise sensorial', DESEJAVEL), ('Modelagem de vida de prateleira', DESEJAVEL),
        ],
    },
    {
        'area': 'fermentacao', 'empresas': ['valedolupulo', 'encostafria'],
        'titulo': 'Perfil aromático instável entre lotes',
        'resumo': 'Lotes da mesma receita saem com aroma diferente e geram reclamação de clientes.',
        'contexto': 'A fermentação varia com a temperatura do galpão e com a idade da levedura reutilizada.',
        'alvo': 'a variação de aroma entre lotes fermentados',
        'acao': 'um controle de fermentação guiado por marcadores voláteis',
        'metodo': 'perfil de voláteis por cromatografia gasosa, monitoramento da levedura e ensaios em escala piloto',
        'meta': 'Diferença sensorial entre lotes abaixo do limiar de detecção do painel.',
        'inovacao': 'Marcadores de aroma usados como critério de processo, não só de liberação.',
        'competencias': [
            ('Leveduras', ESSENCIAL), ('Fermentação de bebidas', ESSENCIAL),
            ('Cromatografia de compostos voláteis', ESSENCIAL), ('Análise sensorial', DESEJAVEL),
        ],
    },
    {
        'area': 'bioinsumos', 'empresas': ['planalto', 'terraviva'],
        'titulo': 'Controle biológico de nematoides na soja',
        'resumo': 'Nematoides de galha reduzem a produtividade e os nematicidas químicos têm uso cada vez mais restrito.',
        'contexto': 'Há isolados de Bacillus com atividade promissora em triagem prévia.',
        'alvo': 'o dano por nematoides de galha em áreas arenosas',
        'acao': 'uma formulação de esporos de Bacillus',
        'metodo': 'triagem in vitro de isolados, produção de esporos em fermentação submersa e ensaio em casa de vegetação',
        'meta': 'Redução de pelo menos 50% no número de galhas sem perda de produtividade.',
        'inovacao': 'Isolado nativo adaptado a solos arenosos, sem produto registrado com a mesma cepa.',
        'competencias': [
            ('Controle biológico', ESSENCIAL), ('Nematologia agrícola', ESSENCIAL),
            ('Formulação de bioinsumos', ESSENCIAL), ('Registro de bioinsumos no MAPA', DESEJAVEL),
        ],
    },
    {
        'area': 'ambiental', 'empresas': ['boaesperanca', 'serraazul', 'campoalegre'],
        'titulo': 'Efluente acima do limite de DBO',
        'resumo': 'O efluente tratado ainda sai acima do limite de DBO em períodos de safra.',
        'contexto': 'A lagoa de tratamento não acompanha o pico de carga orgânica.',
        'alvo': 'a carga orgânica do efluente em períodos de pico',
        'acao': 'um consórcio microbiano para reforço do tratamento biológico',
        'metodo': 'caracterização do efluente, seleção de consórcio por respirometria e ensaio em reator de bancada',
        'meta': 'DBO dentro do limite legal mesmo no pico de safra.',
        'inovacao': 'Consórcio selecionado da própria planta, sem troca do sistema de tratamento.',
        'competencias': [
            ('Microbiologia ambiental', ESSENCIAL), ('Tratamento biológico de efluentes', ESSENCIAL),
            ('Legislação ambiental de efluentes', DESEJAVEL),
        ],
    },
    {
        'area': 'probioticos', 'empresas': ['campoalegre', 'pomardourado'],
        'titulo': 'Bebida probiótica com viabilidade garantida',
        'resumo': 'A contagem de probióticos cai abaixo do declarado antes do fim da validade.',
        'contexto': 'O produto é vendido refrigerado, mas a cadeia de frio do varejo é irregular.',
        'alvo': 'a perda de viabilidade dos probióticos na validade',
        'acao': 'uma cepa e uma formulação mais resistentes',
        'metodo': 'triagem de cepas por viabilidade, simulação gastrointestinal in vitro e estudo de estabilidade',
        'meta': 'Contagem acima do declarado até o último dia de validade.',
        'inovacao': 'Combinação de cepa e matriz que dispensa microencapsulação.',
        'competencias': [
            ('Probióticos', ESSENCIAL), ('Microbiologia de laticínios', ESSENCIAL),
            ('Estudo de estabilidade de alimentos', DESEJAVEL),
        ],
    },
    {
        'area': 'qualidade', 'empresas': ['ovosdosul', 'nutricampo', 'paodaserra'],
        'titulo': 'Plano APPCC para nova linha de produção',
        'resumo': 'A nova linha precisa de plano APPCC antes da auditoria do cliente.',
        'contexto': 'A empresa não tem histórico de dados microbiológicos da linha nova.',
        'alvo': 'os pontos críticos de controle da linha nova',
        'acao': 'um plano APPCC com plano de amostragem microbiológica',
        'metodo': 'mapeamento do processo, análise de perigos e amostragem em três turnos',
        'meta': 'Plano aprovado na auditoria do cliente.',
        'inovacao': 'Plano de amostragem dimensionado pelo histórico real da linha.',
        'competencias': [
            ('APPCC', ESSENCIAL), ('Boas práticas de fabricação', ESSENCIAL),
            ('Controle de qualidade microbiológico', DESEJAVEL),
        ],
    },
    {
        'area': 'genomica', 'empresas': ['serraazul', 'ovosdosul'],
        'titulo': 'Rastrear a origem de contaminações recorrentes',
        'resumo': 'A mesma bactéria reaparece em pontos diferentes da planta e ninguém sabe de onde vem.',
        'contexto': 'A empresa tem isolados guardados dos últimos dois anos.',
        'alvo': 'a origem das contaminações recorrentes',
        'acao': 'a tipagem genômica dos isolados guardados',
        'metodo': 'sequenciamento de genoma completo dos isolados e análise filogenética',
        'meta': 'Mapa das rotas de contaminação com os pontos a corrigir.',
        'inovacao': 'Uso de genômica para decisão de higiene, não só para investigação de surto.',
        'competencias': [
            ('Genômica microbiana', ESSENCIAL), ('Bioinformática', ESSENCIAL),
            ('Epidemiologia molecular', DESEJAVEL),
        ],
    },
    {
        'area': 'sensorial', 'empresas': ['cafedomorro', 'pomardourado'],
        'titulo': 'Padronizar o perfil sensorial do produto',
        'resumo': 'O produto oscila de lote para lote e o cliente percebe a diferença.',
        'contexto': 'A empresa não tem painel sensorial nem critério objetivo de aceitação.',
        'alvo': 'a oscilação sensorial entre lotes',
        'acao': 'um painel sensorial treinado com critério de liberação',
        'metodo': 'treinamento de painel, definição de atributos e teste de aceitação com consumidores',
        'meta': 'Critério de liberação sensorial adotado na rotina.',
        'inovacao': 'Liberação de lote por critério sensorial quantificado.',
        'competencias': [
            ('Análise sensorial', ESSENCIAL), ('Planejamento experimental e estatística', DESEJAVEL),
            ('Fermentação de café', DESEJAVEL),
        ],
    },
    {
        'area': 'micologia', 'empresas': ['planalto', 'cafedomorro'],
        'titulo': 'Micotoxinas no grão armazenado',
        'resumo': 'Lotes armazenados apresentam micotoxinas acima do aceito pelo comprador.',
        'contexto': 'O armazém não controla umidade e temperatura dos silos de forma contínua.',
        'alvo': 'a formação de micotoxinas no armazenamento',
        'acao': 'um monitoramento de fungos e de umidade nos silos',
        'metodo': 'amostragem por camada do silo, contagem de fungos toxigênicos e análise de micotoxinas',
        'meta': 'Lotes dentro do limite do comprador por toda a safra.',
        'inovacao': 'Alerta precoce baseado em fungos, antes de a toxina aparecer.',
        'competencias': [
            ('Micologia de alimentos', ESSENCIAL), ('Análise de micotoxinas', ESSENCIAL),
            ('Controle de qualidade microbiológico', DESEJAVEL),
        ],
    },
    {
        'area': 'estatistica', 'empresas': ['pomardourado', 'campoalegre'],
        'titulo': 'Estender a validade sem mudar a fórmula',
        'resumo': 'O varejo pede mais dias de validade e a empresa não quer mudar a fórmula.',
        'contexto': 'A validade atual foi definida sem estudo formal.',
        'alvo': 'a validade real do produto',
        'acao': 'um estudo de vida de prateleira com modelo preditivo',
        'metodo': 'estudo acelerado e em tempo real, com modelagem de crescimento microbiano',
        'meta': 'Validade estendida com respaldo estatístico.',
        'inovacao': 'Modelo preditivo calibrado com dados da própria linha.',
        'competencias': [
            ('Modelagem de vida de prateleira', ESSENCIAL),
            ('Planejamento experimental e estatística', ESSENCIAL),
            ('Microbiologia preditiva', DESEJAVEL),
        ],
    },
]

TEMAS_INTERNOS = [
    {
        'area': 'bioconservacao',
        'titulo': 'Banco de culturas protetoras da AC2',
        'resumo': 'Ideia interna: transformar isolados de bactérias láticas da AC2 em culturas protetoras.',
        'contexto': 'Há isolados com atividade antifúngica guardados sem uso comercial.',
        'alvo': 'o potencial comercial dos isolados guardados',
        'acao': 'um painel de culturas protetoras caracterizadas',
        'metodo': 'triagem de atividade antifúngica, identificação molecular e testes de aplicação',
        'meta': 'Três culturas prontas para oferta a clientes.',
        'inovacao': 'Isolados próprios, adaptados a matrizes brasileiras.',
        'competencias': [
            ('Bactérias láticas', ESSENCIAL), ('Bioconservação de alimentos', ESSENCIAL),
            ('Detecção molecular de patógenos', DESEJAVEL),
        ],
    },
    {
        'area': 'molecular',
        'titulo': 'Painel de PCR para patógenos de superfície',
        'resumo': 'Ideia interna: um painel único de PCR para os patógenos mais pedidos pelos clientes.',
        'contexto': 'Hoje cada patógeno é analisado com um método diferente.',
        'alvo': 'o tempo e o custo da análise de superfícies',
        'acao': 'um painel multiplex de PCR em tempo real',
        'metodo': 'desenho de primers, otimização do multiplex e validação com amostras reais',
        'meta': 'Um ensaio para quatro patógenos com resultado no mesmo dia.',
        'inovacao': 'Painel único para a rotina de clientes de pequeno porte.',
        'competencias': [
            ('Detecção molecular de patógenos', ESSENCIAL), ('Validação de métodos analíticos', ESSENCIAL),
            ('Bioinformática', DESEJAVEL),
        ],
    },
    {
        'area': 'ambiental',
        'titulo': 'Aproveitamento do soro de leite',
        'resumo': 'Ideia interna: dar destino de maior valor ao soro descartado por laticínios parceiros.',
        'contexto': 'O soro é descartado ou vendido a preço baixo.',
        'alvo': 'o descarte do soro de leite',
        'acao': 'uma bebida fermentada a partir do soro',
        'metodo': 'formulação, fermentação com culturas selecionadas e teste de aceitação',
        'meta': 'Protótipo aceito em teste sensorial com consumidores.',
        'inovacao': 'Uso integral do soro em produto de maior valor.',
        'competencias': [
            ('Probióticos', ESSENCIAL), ('Microbiologia de laticínios', ESSENCIAL),
            ('Análise sensorial', DESEJAVEL),
        ],
    },
]

TEXTO_DO_NIVEL = {
    NivelDimensao.CONSOLIDADA: 'A proposta trata {dimensao} com clareza e evidência suficiente.',
    NivelDimensao.EM_DESENVOLVIMENTO: 'A proposta cita {dimensao}, mas falta detalhe para sustentar o plano.',
    NivelDimensao.FRAGIL: 'A proposta quase não trata {dimensao}; é o ponto que mais pede atenção.',
}

ROTULO_DA_DIMENSAO = dict(DimensaoMaturidade.choices)

CAMPO_DA_DIMENSAO = {
    DimensaoMaturidade.DESAFIO_TECNOLOGICO: 'problema_pesquisa',
    DimensaoMaturidade.INOVACAO: 'caracterizacao_inovacao',
    DimensaoMaturidade.PLANO_PESQUISA: 'metodologia',
    DimensaoMaturidade.EQUIPE_SUPERVISAO: 'equipe',
    DimensaoMaturidade.INFRAESTRUTURA: 'infraestrutura_recursos',
    DimensaoMaturidade.VIABILIDADE: 'resultados_esperados',
}

OBSERVACAO_DA_DECISAO = {
    TipoDecisao.CONTINUAR: 'Proposta madura e equipe validada. Seguir para a submissão.',
    TipoDecisao.REVISAR: 'Voltar à empresa para completar os pontos frágeis apontados.',
    TipoDecisao.ARQUIVAR: 'Sem equipe que cubra as competências essenciais neste ciclo.',
}


def sem_acento(texto):
    return unicodedata.normalize('NFD', texto).encode('ascii', 'ignore').decode()


def cnpj_ficticio(numero):
    base = f'92{numero:06d}0001'

    def digito(numeros, pesos):
        resto = sum(int(n) * p for n, p in zip(numeros, pesos)) % 11
        return '0' if resto < 2 else str(11 - resto)

    primeiro = digito(base, PESOS_PRIMEIRO_DIGITO)
    return base + primeiro + digito(base + primeiro, PESOS_SEGUNDO_DIGITO)


def distribuir(total):
    """Ao menos uma oportunidade por etapa; o resto vai na proporção dos pesos."""
    contagem = {etapa: 1 for etapa in PESO_DAS_ETAPAS}
    resto = total - len(contagem)
    soma = sum(PESO_DAS_ETAPAS.values())
    brutas = {etapa: resto * peso / soma for etapa, peso in PESO_DAS_ETAPAS.items()}

    for etapa, bruta in brutas.items():
        contagem[etapa] += int(bruta)

    sobra = total - sum(contagem.values())
    for etapa in sorted(brutas, key=lambda e: brutas[e] - int(brutas[e]), reverse=True)[:sobra]:
        contagem[etapa] += 1

    return [etapa for etapa, quantas in contagem.items() for _ in range(quantas)]


def plano_da_rede(sorteio, tamanho):
    pares = sorteio.sample([(n, s) for n in NOMES for s in SOBRENOMES], tamanho)
    areas = list(AREAS)
    titulacoes = ['graduacao', 'especializacao', 'mestrado', 'doutorado', 'pos_doutorado']
    disponibilidades = list(Disponibilidade.values)
    plano = []

    for indice, (nome, sobrenome) in enumerate(pares):
        supervisor = indice < 6
        area = areas[indice % len(areas)]
        segunda = sorteio.choice(areas)

        if supervisor:
            titulacao = sorteio.choice(['doutorado', 'pos_doutorado'])
        elif indice - 6 < len(titulacoes):
            titulacao = titulacoes[indice - 6]
        else:
            titulacao = sorteio.choices(titulacoes, weights=[1, 1, 3, 4, 1])[0]

        if not supervisor and indice - 6 < len(disponibilidades):
            disponibilidade = disponibilidades[indice - 6]
        else:
            disponibilidade = sorteio.choices(disponibilidades, weights=[5, 9, 4, 2])[0]

        plano.append({
            'nome': f'{nome} {sobrenome}',
            'papel': PapelNaRede.SUPERVISOR if supervisor else PapelNaRede.PESQUISADOR,
            'area': area,
            'titulacao': titulacao,
            'disponibilidade': disponibilidade,
            'competencias': list(dict.fromkeys(
                AREAS[area]['competencias'] + [sorteio.choice(AREAS[segunda]['competencias'])]
            )),
            'tecnicas': list(dict.fromkeys(
                sorteio.sample(AREAS[area]['tecnicas'], 1) + [sorteio.choice(AREAS[segunda]['tecnicas'])]
            )),
            'linhas': [AREAS[area]['linha']],
            'experiencia': f'{sorteio.randint(3, 22)} anos em {AREAS[area]["linha"].lower()}.',
            'conta': supervisor or sorteio.random() < 0.4,
            'inativo': not supervisor and (indice in (10, 33) or sorteio.random() < 0.05),
        })

    return plano


def plano_das_oportunidades(sorteio, total):
    etapas = distribuir(total)
    sorteio.shuffle(etapas)
    vistos = set()
    plano = []

    for indice, etapa in enumerate(etapas):
        interna = indice % 4 == 3

        if interna:
            tema = sorteio.choice(TEMAS_INTERNOS)
            autor = 'coordenacao'
        else:
            tema = sorteio.choice(TEMAS)
            autor = sorteio.choice(tema['empresas'])

        titulo = tema['titulo']
        rodada = 2

        while (titulo, autor) in vistos:
            titulo = f'{tema["titulo"]} — frente {rodada}'
            rodada += 1

        vistos.add((titulo, autor))
        plano.append({
            'indice': indice,
            'etapa': etapa,
            'tema': tema,
            'titulo': titulo,
            'autor': autor,
            'prioridade': sorteio.choices(list(PrioridadeOportunidade.values), weights=[2, 5, 3])[0],
            'dias': sorteio.randint(120, 320) if etapa not in ETAPAS_EM_CURSO else sorteio.randint(2, 110),
            'maturidade': sorteio.uniform(0.35, 0.8),
            'semente': sorteio.randint(0, 10**9),
        })

    return plano


def proposta_do_tema(tema):
    return {
        'problema_pesquisa': tema['resumo'] + ' ' + tema['contexto'],
        'hipotese': f'{tema["acao"][0].upper()}{tema["acao"][1:]} reduz {tema["alvo"]} sem custo proibitivo para a operação.',
        'objetivo_geral': f'Desenvolver e validar {tema["acao"]}.',
        'objetivos_especificos': [
            f'Caracterizar {tema["alvo"]}.',
            f'Testar {tema["acao"]} em escala de bancada.',
            'Validar o resultado na rotina da operação.',
        ],
        'metodologia': f'{tema["metodo"][0].upper()}{tema["metodo"][1:]}, com repetições e análise estatística dos resultados.',
        'resultados_esperados': tema['meta'],
        'caracterizacao_inovacao': tema['inovacao'],
        'infraestrutura_recursos': 'Laboratório de microbiologia da AC2 e a estrutura da empresa para os ensaios na rotina.',
    }


class Command(BaseCommand):
    help = 'Semeia o banco local com volume: rede, empresas e oportunidades em todas as etapas.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--oportunidades', type=int, default=48,
            help='quantas oportunidades semear (padrão: 48; mínimo: uma por etapa)',
        )

    def handle(self, *args, **opcoes):
        exigir_banco_local()

        total = opcoes['oportunidades']

        if total < len(PESO_DAS_ETAPAS):
            raise CommandError(
                f'Peça ao menos {len(PESO_DAS_ETAPAS)} oportunidades: uma por etapa do fluxo.'
            )

        with override_settings(
            EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
            GEMINI_API_KEY='',
        ):
            with transaction.atomic():
                resumo = self._semear(total)

        self.stdout.write(self.style.SUCCESS(resumo))

    def _semear(self, total):
        sorteio = random.Random(SEMENTE)
        plano_rede = plano_da_rede(sorteio, 60)
        plano = plano_das_oportunidades(sorteio, total)

        for codigo, rotulo, nivel in TITULACOES:
            Titulacao.objects.update_or_create(codigo=codigo, defaults={'rotulo': rotulo, 'nivel': nivel})

        coordenacao = self._conta(*COORDENACAO, papel=Papel.SUPERVISOR)
        ImportarCriteriosService().execute(ator=coordenacao)

        instituicao = (
            Organizacao.objects.filter(tipo=TipoOrganizacao.INSTITUICAO).order_by('pk').first()
        )
        novos_membros = sum(self._membro(perfil, instituicao, coordenacao) for perfil in plano_rede)

        autores = {'coordenacao': coordenacao}
        for numero, (slug, (razao, nome)) in enumerate(EMPRESAS.items(), start=1):
            autores[slug] = self._demandante(slug, razao, nome, numero)

        rede = self._rede_do_plano(plano_rede)
        novas = sum(self._oportunidade(item, autores, coordenacao, rede) for item in plano)

        return (
            f'\nRede: {novos_membros} pessoa(s) nova(s), {len(plano_rede)} no plano.'
            f'\nEmpresas: {len(EMPRESAS)}.'
            f'\nOportunidades: {novas} nova(s), {len(plano)} no plano.\n'
        )

    def _conta(self, email, nome, *, papel, organizacao=None):
        conta = Usuario.objects.filter(email=email).first()

        if conta is None:
            conta = Usuario.objects.create_user(
                email=email, nome=nome, papel=papel, organizacao=organizacao
            )
            conta.situacao = SituacaoConta.ATIVO
            conta.save(update_fields=['situacao', 'atualizado_em'])

        return conta

    def _demandante(self, slug, razao, nome, numero):
        empresa, _ = Organizacao.objects.get_or_create(
            cnpj=cnpj_ficticio(numero),
            defaults={'nome': razao, 'tipo': TipoOrganizacao.DEMANDANTE},
        )
        email = f'contato@{slug}.example'
        nova = not Usuario.objects.filter(email=email).exists()
        conta = self._conta(email, nome, papel=Papel.DEMANDANTE, organizacao=empresa)

        if nova:
            CriadorDeDemandante().completar(usuario=conta, organizacao=empresa, ator=conta)

        return conta

    def _membro(self, perfil, instituicao, coordenacao):
        email = sem_acento(perfil['nome']).lower().replace(' ', '.') + '@ac2.example'

        if MembroRede.objects.com_email(email).exists() or Usuario.objects.filter(email=email).exists():
            return 0

        membro = CadastrarMembroService().execute(
            dados={
                'nome': perfil['nome'],
                'email': email,
                'papel_rede': perfil['papel'],
                'titulacao': Titulacao.objects.get(codigo=perfil['titulacao']),
                'organizacao': instituicao,
                'disponibilidade': perfil['disponibilidade'],
                'experiencia': perfil['experiencia'],
            },
            listas={
                'competencias': perfil['competencias'],
                'tecnicas': perfil['tecnicas'],
                'linhas': perfil['linhas'],
            },
            ator=coordenacao,
        )

        if perfil['inativo']:
            MembroRede.objects.filter(pk=membro.pk).update(situacao=SituacaoMembro.INATIVO)
        elif perfil['conta']:
            papel = Papel.SUPERVISOR if perfil['papel'] == PapelNaRede.SUPERVISOR else Papel.PESQUISADOR
            conta = self._conta(email, perfil['nome'], papel=papel)
            membro.ligar_a_conta(conta)
            membro.situacao = SituacaoMembro.ATIVO
            membro.save()

        return 1

    def _rede_do_plano(self, plano_rede):
        rede = {}

        for perfil in plano_rede:
            email = sem_acento(perfil['nome']).lower().replace(' ', '.') + '@ac2.example'
            membro = MembroRede.objects.com_email(email).first()

            if membro is not None:
                rede.setdefault(perfil['papel'], []).append((membro, perfil))

        return rede

    def _oportunidade(self, item, autores, coordenacao, rede):
        autor = autores[item['autor']]

        if Oportunidade.objects.filter(titulo=item['titulo'], criado_por=autor).exists():
            return 0

        sorteio = random.Random(item['semente'])
        tema = item['tema']
        etapa = item['etapa']
        alcance = ETAPAS_EM_CURSO.index(etapa) if etapa in ETAPAS_EM_CURSO else len(ETAPAS_EM_CURSO) - 1
        decisao = DECISAO_DA_SITUACAO.get(etapa)

        oportunidade = CadastrarOportunidadeService().execute(
            dados={'titulo': item['titulo'], 'resumo': tema['resumo'], 'contexto': tema['contexto']},
            ator=autor,
        )
        Oportunidade.objects.filter(pk=oportunidade.pk).update(prioridade=item['prioridade'])

        if alcance >= 1:
            proposta = IniciarPropostaService().execute(oportunidade=oportunidade, ator=coordenacao)
            AtualizarPropostaService().execute(
                proposta=proposta, dados=proposta_do_tema(tema), ator=coordenacao
            )

        if alcance >= 2:
            for descricao, nivel in tema['competencias']:
                AdicionarCompetenciaService().execute(
                    oportunidade=oportunidade,
                    dados={'descricao': descricao, 'nivel_importancia': nivel},
                    ator=coordenacao,
                )

        oportunidade.refresh_from_db()
        analise = None

        if alcance >= 3:
            self._equipe(oportunidade, item, tema, sorteio, coordenacao, rede, decisao)

        if alcance >= 4:
            analise = self._pre_analise(
                oportunidade, item, sorteio, coordenacao, pronta=alcance >= 5, decisao=decisao
            )

        ajustar_pelos_dados(oportunidade)

        if decisao is not None:
            oportunidade.refresh_from_db()
            Decisao.objects.create(
                oportunidade=oportunidade,
                tipo_decisao=decisao,
                observacoes=OBSERVACAO_DA_DECISAO[decisao],
                responsavel=coordenacao,
                pre_analise=analise,
            )
            mover(oportunidade, etapa, coordenacao)

        quando = timezone.now() - timedelta(days=item['dias'])
        Oportunidade.objects.filter(pk=oportunidade.pk).update(criada_em=quando)
        Decisao.objects.filter(oportunidade=oportunidade).update(
            registrada_em=quando + timedelta(days=sorteio.randint(20, 90))
        )

        return 1

    def _equipe(self, oportunidade, item, tema, sorteio, coordenacao, rede, decisao):
        ativos = [
            (membro, perfil)
            for membro, perfil in rede.get(PapelNaRede.PESQUISADOR, [])
            if not perfil['inativo']
        ]
        da_area = [par for par in ativos if par[1]['area'] == tema['area']]
        outros = [par for par in ativos if par[1]['area'] != tema['area']]
        escolhidos = sorteio.sample(da_area, min(len(da_area), 2)) + sorteio.sample(
            outros, min(len(outros), sorteio.randint(1, 3))
        )
        supervisor = sorteio.choice(rede.get(PapelNaRede.SUPERVISOR, []))
        validada = decisao == TipoDecisao.CONTINUAR or (
            decisao is None and item['etapa'] == S.AGUARDANDO_DECISAO and item['indice'] % 2 == 0
        )

        execucao = ExecucaoMatching.objects.create(
            oportunidade=oportunidade,
            estrategia=ESTRATEGIA_HIBRIDA,
            usou_rerank=sorteio.random() < 0.4,
            fallback_usado=sorteio.random() < 0.15,
            executado_por=coordenacao.email,
            status=StatusExecucao.OK,
            concluido_em=timezone.now(),
        )
        equipe = EquipePotencial.objects.create(oportunidade=oportunidade, execucao=execucao)
        Oportunidade.objects.filter(pk=oportunidade.pk).update(responsavel=supervisor[0])

        indicados = [(supervisor, PapelNaRede.SUPERVISOR)] + [
            (par, PapelNaRede.PESQUISADOR) for par in escolhidos
        ]

        for posicao, ((membro, perfil), papel) in enumerate(indicados):
            mesma_area = perfil['area'] == tema['area']
            pontuacao = sorteio.uniform(0.68, 0.93) if mesma_area else sorteio.uniform(0.42, 0.7)
            ultimo = posicao == len(indicados) - 1
            manual = ultimo and (item['indice'] % 3 == 0 or decisao == TipoDecisao.CONTINUAR)
            incluido = posicao == 0 or manual or sorteio.random() > 0.1

            MembroEquipe.objects.create(
                equipe=equipe,
                membro=membro,
                papel=papel,
                score_compatibilidade=Decimal(f'{pontuacao:.4f}'),
                justificativa=(
                    f'Atua em {AREAS[perfil["area"]]["linha"].lower()}, '
                    f'com {perfil["competencias"][0].lower()}.'
                ),
                match_reasons=[
                    f'Competência em comum: {perfil["competencias"][0]}.',
                    f'Disponibilidade {perfil["disponibilidade"]}.',
                ],
                score_features={
                    'semantico': round(pontuacao, 3),
                    'lexical': round(pontuacao * sorteio.uniform(0.6, 1.0), 3),
                    'area': 1.0 if mesma_area else 0.0,
                    'disponibilidade': round(sorteio.uniform(0.5, 1.0), 3),
                    'supervisao': papel == PapelNaRede.SUPERVISOR,
                },
                incluido=incluido,
                origem=OrigemIndicacao.MANUAL if manual else OrigemIndicacao.IA,
                validada=validada and incluido,
                ajustado_por=coordenacao if manual else None,
            )

        necessarias = list(oportunidade.proposta.competencias_necessarias.order_by('pk'))
        for posicao, competencia in enumerate(necessarias):
            ultima = posicao == len(necessarias) - 1 and len(necessarias) >= 3
            if posicao > 0 and (ultima or sorteio.random() < 0.3):
                LacunaCompetenciaEquipe.objects.create(
                    equipe=equipe,
                    descricao=f'Ninguém da rede cobre "{competencia.descricao}" com a profundidade pedida.',
                    competencia_necessaria=competencia,
                )

    def _pre_analise(self, oportunidade, item, sorteio, coordenacao, *, pronta, decisao):
        proposta = oportunidade.proposta
        analise = PreAnalise.objects.create(
            proposta=proposta,
            versao_criterio=versao_vigente(),
            versao_proposta=proposta.versao,
            sintese='' if not pronta else (
                'Proposta com problema bem definido; os pontos de atenção estão '
                'nas dimensões marcadas como frágeis ou em desenvolvimento.'
            ),
            executada_por=coordenacao.email,
            status=StatusExecucao.OK if pronta else StatusExecucao.EXECUTANDO,
        )

        if not pronta:
            return analise

        criterio_da_dimensao = {}
        for criterio in criterios_vigentes():
            criterio_da_dimensao.setdefault(criterio.dimensao, criterio)

        base = item['maturidade'] + (0.15 if decisao == TipoDecisao.CONTINUAR else 0)
        base -= 0.2 if decisao in (TipoDecisao.ARQUIVAR, TipoDecisao.REVISAR) else 0
        dimensoes = list(DimensaoMaturidade.values)
        forcada = sorteio.choice(dimensoes) if decisao in (TipoDecisao.ARQUIVAR, TipoDecisao.REVISAR) else None
        decidida = decisao is not None
        primeira = True

        for ordem, dimensao in enumerate(dimensoes):
            if dimensao == forcada:
                nivel = NivelDimensao.FRAGIL
            else:
                nivel = sorteio.choices(
                    [NivelDimensao.CONSOLIDADA, NivelDimensao.EM_DESENVOLVIMENTO, NivelDimensao.FRAGIL],
                    weights=[max(base, 0.1), (1 - base) * 0.7, (1 - base) * 0.3],
                )[0]
            rotulo = ROTULO_DA_DIMENSAO[dimensao].lower()

            PreAnaliseDimensao.objects.create(
                pre_analise=analise,
                dimensao=dimensao,
                avaliacao=TEXTO_DO_NIVEL[nivel].format(dimensao=rotulo),
                nivel=nivel,
                evidencias=[f'Trecho da proposta sobre {rotulo}.'],
                ordem=ordem,
            )

            if nivel == NivelDimensao.CONSOLIDADA:
                continue

            lacuna = Lacuna.objects.create(
                proposta=proposta,
                tipo=TipoLacuna.PRE_ANALISE,
                campo_afetado=CAMPO_DA_DIMENSAO[dimensao],
                descricao=f'Falta evidência sobre {rotulo}.',
                recomendacao=f'Detalhar {rotulo} com dados da operação.',
                severidade=Severidade.ALTA if nivel == NivelDimensao.FRAGIL else Severidade.MEDIA,
                criterio=criterio_da_dimensao.get(dimensao),
                pre_analise=analise,
                resolvida=decidida and not primeira and sorteio.random() < 0.4,
            )
            acatada = decidida and (
                primeira or decisao == TipoDecisao.CONTINUAR or sorteio.random() < 0.5
            )
            primeira = False

            Recomendacao.objects.create(
                oportunidade=oportunidade,
                origem=OrigemRecomendacao.PRE_ANALISE,
                pre_analise=analise,
                lacuna=lacuna,
                texto=f'Reforçar {rotulo} antes da submissão.',
                acatada=acatada,
                acatada_em=timezone.now() if acatada else None,
            )

        return analise
