"""
Semeia o banco LOCAL com o que a IA precisa para ser exercitada.

    python manage.py semear_ia_dev

Prepara as entradas e para ai: rede interna variada, oportunidades em etapas
diferentes do fluxo e os criterios PIPE. Quem dispara Copiloto, derivacao de
competencias, matching e pre-analise e a pessoa, pela tela - o seed nao chama
provedor de IA nem manda e-mail.

| Etapa a testar         | Oportunidade                                      |
|------------------------|---------------------------------------------------|
| Copiloto               | as duas sem proposta                              |
| Derivar competencias   | as duas com proposta e sem competencia            |
| Matching               | as duas com proposta e competencias necessarias   |
| Pre-analise            | qualquer uma com proposta; a do soro de leite     |
|                        | tem proposta incompleta de proposito              |

Os atores sao ficticios (`@*.example`) e sem senha utilizavel: o seed nao cria
nem altera conta real. Para testar, entre com a sua conta de Supervisor - ele
enxerga todas as oportunidades.

Idempotente: rodar de novo nao duplica nada.

AGENTS.md 0.1: roda **apenas** contra banco local. A trava e a mesma do
`semear_dev`, e nao ha flag que a desligue.
"""
import unicodedata

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import Papel, SituacaoConta, Usuario
from apps.competencies.models import NivelImportancia
from apps.competencies.services.derivacao import AdicionarCompetenciaService
from apps.copilot.services.proposta import AtualizarPropostaService, IniciarPropostaService
from apps.maturity.services.preanalise import ImportarCriteriosService
from apps.network.models import (
    Disponibilidade,
    MembroRede,
    PapelNaRede,
    SituacaoMembro,
    Titulacao,
)
from apps.network.services.rede import CadastrarMembroService
from apps.opportunities.models import Oportunidade
from apps.opportunities.services.oportunidade import CadastrarOportunidadeService
from apps.organizations.models import Organizacao, TipoOrganizacao
from core.management.commands.semear_dev import TITULACOES, exigir_banco_local

ESSENCIAL = NivelImportancia.ESSENCIAL
DESEJAVEL = NivelImportancia.DESEJAVEL

SUPERVISOR = ('supervisao.ficticia@ac2.example', 'Supervisão fictícia (seed de IA)')

DEMANDANTES = {
    'serra_clara': (
        'Laticínios Serra Clara (fictício)', '90000001000129',
        'contato@serraclara.example', 'Laticínios Serra Clara',
    ),
    'alta_mogiana': (
        'Cooperativa de Café Alta Mogiana (fictício)', '90000002000173',
        'contato@altamogiana.example', 'Cooperativa Alta Mogiana',
    ),
    'trigo_bom': (
        'Panificadora Trigo Bom (fictício)', '90000003000118',
        'contato@trigobom.example', 'Panificadora Trigo Bom',
    ),
}

REDE = [
    {
        'nome': 'Beatriz Nogueira', 'titulacao': 'doutorado',
        'disponibilidade': Disponibilidade.INTEGRAL,
        'experiencia': 'Doze anos em deterioração fúngica de alimentos de panificação e laticínios.',
        'competencias': ['Micologia de alimentos', 'Controle de qualidade microbiológico'],
        'tecnicas': ['Contagem de bolores e leveduras', 'Microscopia de fungos filamentosos'],
        'linhas': ['Deterioração fúngica de alimentos'],
    },
    {
        'nome': 'Caio Mendes', 'titulacao': 'pos_doutorado',
        'disponibilidade': Disponibilidade.PARCIAL,
        'experiencia': 'Seleção de bactérias láticas com atividade antifúngica para bioconservação.',
        'competencias': ['Bacterias láticas', 'Bioconservação de alimentos'],
        'tecnicas': ['Fermentação em batelada', 'Ensaio de antagonismo in vitro'],
        'linhas': ['Bioconservação com culturas protetoras'],
    },
    {
        'nome': 'Lívia Prado', 'titulacao': 'doutorado',
        'disponibilidade': Disponibilidade.PARCIAL,
        'experiencia': 'Desenvolvimento de ensaios de PCR em tempo real para patógenos de alimentos.',
        'competencias': ['Detecção molecular de patógenos', 'Validação de métodos analíticos'],
        'tecnicas': ['PCR em tempo real', 'Desenho de primers e sondas'],
        'linhas': ['Diagnóstico molecular em segurança de alimentos'],
    },
    {
        'nome': 'Rodrigo Teles', 'titulacao': 'mestrado',
        'disponibilidade': Disponibilidade.INTEGRAL,
        'experiencia': 'Monitoramento de Salmonella em fábricas de ração e farinhas de origem animal.',
        'competencias': ['Salmonella e enterobactérias', 'Microbiologia de alimentos para animais'],
        'tecnicas': ['Isolamento em meio seletivo', 'Sorotipagem'],
        'linhas': ['Segurança de alimentos para animais'],
    },
    {
        'nome': 'Fernanda Alves', 'titulacao': 'doutorado',
        'disponibilidade': Disponibilidade.PONTUAL,
        'experiencia': 'Validação de métodos alternativos segundo a ISO 16140 e acreditação de laboratório.',
        'competencias': ['Validação de métodos analíticos', 'Química analítica'],
        'tecnicas': ['ISO 16140', 'Cromatografia líquida (HPLC)'],
        'linhas': ['Metrologia em microbiologia'],
    },
    {
        'nome': 'Henrique Sato', 'titulacao': 'doutorado',
        'disponibilidade': Disponibilidade.PARCIAL,
        'experiencia': 'Genômica comparativa de patógenos e desenho de alvos para diagnóstico.',
        'competencias': ['Bioinformática', 'Genômica microbiana'],
        'tecnicas': ['Sequenciamento de genoma completo', 'Desenho de primers e sondas'],
        'linhas': ['Genômica de patógenos de alimentos'],
    },
    {
        'nome': 'Juliana Rocha', 'titulacao': 'mestrado',
        'disponibilidade': Disponibilidade.PARCIAL,
        'experiencia': 'Coordena painel sensorial de produtos de panificação.',
        'competencias': ['Análise sensorial', 'Tecnologia de panificação'],
        'tecnicas': ['Painel sensorial treinado', 'Teste de aceitação'],
        'linhas': ['Qualidade de produtos de panificação'],
    },
    {
        'nome': 'Marcos Vieira', 'titulacao': 'doutorado',
        'disponibilidade': Disponibilidade.INTEGRAL,
        'experiencia': 'Planejamento de experimentos e modelagem estatística de vida de prateleira.',
        'competencias': ['Planejamento experimental e estatística', 'Modelagem de vida de prateleira'],
        'tecnicas': ['Delineamento fatorial', 'Análise de sobrevivência'],
        'linhas': ['Estatística aplicada a bioprocessos'],
    },
    {
        'nome': 'Patrícia Lemos', 'titulacao': 'doutorado',
        'disponibilidade': Disponibilidade.PARCIAL,
        'experiencia': 'Formulação de bioinsumos com Bacillus e registro junto ao MAPA.',
        'competencias': ['Controle biológico', 'Formulação de bioinsumos'],
        'tecnicas': ['Ensaio em casa de vegetação', 'Produção de esporos de Bacillus'],
        'linhas': ['Bioinsumos agrícolas'],
    },
    {
        'nome': 'Tiago Freitas', 'titulacao': 'mestrado',
        'disponibilidade': Disponibilidade.INTEGRAL,
        'experiencia': 'Manejo de nematoides de galha e de cisto em areas de soja do Centro-Oeste.',
        'competencias': ['Nematologia agrícola'],
        'tecnicas': ['Extração de nematoides do solo', 'Ensaio de patogenicidade'],
        'linhas': ['Manejo de nematoides na soja'],
    },
    {
        'nome': 'Sofia Ramos', 'titulacao': 'doutorado',
        'disponibilidade': Disponibilidade.PARCIAL,
        'experiencia': 'Investigação de Listeria monocytogenes e biofilmes em plantas de laticínios.',
        'competencias': ['Listeria monocytogenes', 'Higiene industrial'],
        'tecnicas': ['Swab de superficie', 'Quantificação de biofilmes'],
        'linhas': ['Segurança de laticínios'],
    },
    {
        'nome': 'André Kato', 'titulacao': 'pos_doutorado',
        'disponibilidade': Disponibilidade.PONTUAL,
        'experiencia': 'Fermentação induzida de café com leveduras selecionadas.',
        'competencias': ['Fermentação de café', 'Leveduras'],
        'tecnicas': ['Cromatografia gasosa', 'Análise de compostos voláteis'],
        'linhas': ['Fermentação induzida em café'],
    },
    {
        'nome': 'Larissa Dias', 'titulacao': 'graduacao',
        'disponibilidade': Disponibilidade.INTEGRAL,
        'experiencia': 'Iniciação científica em microbiologia geral.',
        'competencias': ['Microbiologia geral'],
        'tecnicas': ['Plaqueamento em profundidade', 'Coloração de Gram'],
        'linhas': ['Iniciação científica em microbiologia'],
    },
    {
        'nome': 'Bruno Costa', 'titulacao': 'especializacao',
        'disponibilidade': Disponibilidade.PARCIAL,
        'experiencia': 'Implantação de APPCC e boas práticas em pequenas indústrias.',
        'competencias': ['Boas práticas de fabricação', 'APPCC'],
        'tecnicas': ['Auditoria de qualidade'],
        'linhas': ['Gestão da qualidade em alimentos'],
    },
    {
        'nome': 'Eduardo Lima', 'titulacao': 'doutorado',
        'disponibilidade': Disponibilidade.INDISPONIVEL,
        'experiencia': 'Referência em PCR em tempo real para Salmonella; em licença no semestre.',
        'competencias': ['Detecção molecular de patógenos', 'Salmonella e enterobactérias'],
        'tecnicas': ['PCR em tempo real'],
        'linhas': ['Diagnóstico molecular em segurança de alimentos'],
    },
    {
        'nome': 'Helena Duarte', 'titulacao': 'doutorado',
        'disponibilidade': Disponibilidade.INTEGRAL,
        'situacao': SituacaoMembro.INATIVO,
        'experiencia': 'Micologia de alimentos; deixou a rede no último ciclo.',
        'competencias': ['Micologia de alimentos'],
        'tecnicas': ['Contagem de bolores e leveduras'],
        'linhas': ['Deterioração fúngica de alimentos'],
    },
]

PROPOSTA_BACILLUS = {
    'problema_pesquisa': (
        'Nematoides de galha (Meloidogyne javanica) reduzem ate 30% da '
        'produtividade da soja em areas arenosas, e os nematicidas químicos '
        'disponíveis tem custo alto e restrição crescente de uso.'
    ),
    'hipotese': (
        'Uma formulação de esporos de Bacillus amyloliquefaciens isolado de solo '
        'nativo reduz a populacao de nematoides e a formacao de galhas sem perda '
        'de produtividade.'
    ),
    'objetivo_geral': 'Desenvolver e validar em casa de vegetação um bioinsumo nematicida a base de Bacillus.',
    'objetivos_especificos': [
        'Selecionar isolados de Bacillus com atividade contra Meloidogyne javanica.',
        'Definir meio e processo de produção de esporos em escala de bancada.',
        'Avaliar a eficácia da formulação em casa de vegetação.',
    ],
    'metodologia': (
        'Triagem in vitro de 40 isolados por mortalidade de juvenis; produção de '
        'esporos em fermentação submersa; ensaio em casa de vegetação com '
        'delineamento em blocos casualizados e cinco repetições.'
    ),
    'resultados_esperados': 'Um isolado lider e uma formulação com reducao de pelo menos 50% no número de galhas.',
    'caracterizacao_inovacao': 'Isolado nativo adaptado a solos arenosos, sem produto registrado com o mesmo alvo e cepa.',
    'infraestrutura_recursos': 'Laboratório de microbiologia da AC2, fermentador de bancada de 5 L e casa de vegetação parceira.',
}

PROPOSTA_PAO = {
    'problema_pesquisa': (
        'O pão de forma sem conservantes químicos apresenta bolor visível entre o '
        'quinto e o sétimo dia, abaixo dos dez dias de prateleira que o varejo exige.'
    ),
    'hipotese': (
        'Culturas protetoras de bactérias láticas aplicadas na massa inibem os '
        'fungos deteriorantes sem alterar o sabor percebido pelo consumidor.'
    ),
    'objetivo_geral': 'Estender a vida de prateleira do pão sem conservantes usando bioconservação.',
    'objetivos_especificos': [
        'Identificar os fungos que deterioram o produto.',
        'Selecionar bactérias láticas com atividade antifúngica.',
        'Validar a vida de prateleira e a aceitação sensorial do pão formulado.',
    ],
    'metodologia': (
        'Isolamento e identificação dos fungos deteriorantes; ensaio de '
        'antagonismo com bactérias láticas; estudo de vida de prateleira com '
        'delineamento fatorial; painel sensorial com teste de aceitação.'
    ),
    'resultados_esperados': 'Vida de prateleira de pelo menos dez dias com aceitação sensorial igual a do produto atual.',
    'caracterizacao_inovacao': 'Substituição de propionato por cultura protetora em linha industrial de pão de forma.',
    'infraestrutura_recursos': 'Laboratório da AC2 e linha piloto da panificadora para os lotes de teste.',
}

PROPOSTA_SALMONELLA = {
    'problema_pesquisa': (
        'O método de referência para Salmonella em ração leva ate cinco dias, e o '
        'lote fica retido nesse período, com custo de armazenagem e atraso de entrega.'
    ),
    'hipotese': (
        'Um ensaio de PCR em tempo real após pré-enriquecimento curto detecta '
        'Salmonella em ração em menos de 24 horas com sensibilidade equivalente '
        'a do método de referência.'
    ),
    'objetivo_geral': 'Desenvolver e validar um método rapido de detecção de Salmonella em ração animal.',
    'objetivos_especificos': [
        'Desenhar primers e sonda para alvo específico de Salmonella.',
        'Otimizar o pré-enriquecimento para matriz de ração.',
        'Validar o método contra o de referência segundo a ISO 16140.',
    ],
    'metodologia': (
        'Desenho de primers sobre genomas públicos; otimização do '
        'pré-enriquecimento em amostras contaminadas artificialmente; estudo '
        'comparativo com o método ISO 6579 em 120 amostras.'
    ),
    'resultados_esperados': 'Metodo com resultado em menos de 24 horas e sensibilidade de pelo menos 95%.',
    'caracterizacao_inovacao': 'Protocolo validado para matriz de ração, onde os kits comerciais tem inibição de PCR.',
    'infraestrutura_recursos': 'Termociclador de tempo real e laboratório NB2 da AC2.',
}

PROPOSTA_INCOMPLETA = {
    'problema_pesquisa': (
        'O soro de leite gerado na produção de queijo e descartado ou vendido a '
        'preço baixo, e representa custo ambiental para o laticinio.'
    ),
    'hipotese': 'O soro pode ser base de uma bebida probiótica com boa aceitação.',
    'objetivo_geral': 'Desenvolver uma bebida probiótica a partir do soro de leite.',
    'objetivos_especificos': [],
    'metodologia': '',
    'resultados_esperados': '',
    'caracterizacao_inovacao': '',
    'infraestrutura_recursos': '',
}

OPORTUNIDADES = [
    {
        'autor': 'serra_clara',
        'titulo': 'Listeria recorrente na linha de queijo minas frescal',
        'resumo': (
            'Três lotes de queijo minas frescal foram recolhidos este ano por '
            'Listeria monocytogenes acima do limite, apesar da pasteurização.'
        ),
        'contexto': (
            'A contaminação aparece depois da etapa de enformagem. A equipe '
            'suspeita de biofilme nas formas e na mesa de dessoragem, mas nao tem '
            'como confirmar nem sabe qual protocolo de higienização adotar.'
        ),
    },
    {
        'autor': 'alta_mogiana',
        'titulo': 'Padronizar a fermentação do café para lotes especiais',
        'resumo': (
            'A cooperativa quer vender lotes de café especial com perfil sensorial '
            'repetível, mas a fermentação natural varia muito entre produtores.'
        ),
        'contexto': (
            'Os cooperados fermentam o café em tanques abertos, sem controle de '
            'tempo nem de temperatura. A nota de prova oscila de 80 a 86 pontos '
            'entre lotes da mesma fazenda.'
        ),
    },
    {
        'autor': 'supervisor',
        'titulo': 'Bioinsumo com Bacillus para controle de nematoides na soja',
        'resumo': 'Ideia interna: transformar isolados de Bacillus do banco da AC2 em um nematicida biológico.',
        'contexto': 'Ha isolados com atividade promissora em triagem prévia e demanda de produtores de soja da região.',
        'proposta': PROPOSTA_BACILLUS,
    },
    {
        'autor': 'supervisor',
        'titulo': 'Bebida probiótica a partir do soro de leite',
        'resumo': 'Ideia interna: dar destino de maior valor ao soro descartado por laticínios parceiros.',
        'contexto': 'Proposta ainda em rascunho, sem metodologia nem recursos definidos.',
        'proposta': PROPOSTA_INCOMPLETA,
    },
    {
        'autor': 'trigo_bom',
        'titulo': 'Bolor em pão de forma sem conservantes químicos',
        'resumo': 'O pão sem conservantes embolora antes do prazo que o varejo exige.',
        'contexto': 'A panificadora retirou o propionato da fórmula por demanda do mercado e perdeu vida de prateleira.',
        'proposta': PROPOSTA_PAO,
        'competencias': [
            ('Micologia de alimentos', ESSENCIAL),
            ('Bioconservação com bactérias láticas', ESSENCIAL),
            ('Análise sensorial', DESEJAVEL),
            ('Planejamento experimental e estatística', DESEJAVEL),
        ],
    },
    {
        'autor': 'supervisor',
        'titulo': 'Detecção rápida de Salmonella em ração por PCR',
        'resumo': 'Ideia interna: reduzir de cinco dias para menos de 24 horas a liberação de lotes de ração.',
        'contexto': 'Fabricantes de ração parceiros relatam custo alto com lotes retidos a espera de laudo.',
        'proposta': PROPOSTA_SALMONELLA,
        'competencias': [
            ('Detecção molecular de patógenos por PCR em tempo real', ESSENCIAL),
            ('Salmonella em alimentos para animais', ESSENCIAL),
            ('Validação de métodos analíticos', ESSENCIAL),
            ('Bioinformática para desenho de primers', DESEJAVEL),
        ],
    },
]


def email_do_membro(nome):
    sem_acento = unicodedata.normalize('NFD', nome).encode('ascii', 'ignore').decode()
    return sem_acento.lower().replace(' ', '.') + '@ac2.example'


class Command(BaseCommand):
    help = 'Prepara o banco local para exercitar a IA: rede, oportunidades e criterios.'

    @transaction.atomic
    def handle(self, *args, **opcoes):
        exigir_banco_local()

        for codigo, rotulo, nivel in TITULACOES:
            Titulacao.objects.update_or_create(
                codigo=codigo, defaults={'rotulo': rotulo, 'nivel': nivel}
            )

        supervisor = self._conta(*SUPERVISOR, papel=Papel.SUPERVISOR)
        autores = {'supervisor': supervisor}

        for chave, (organizacao, cnpj, email, nome) in DEMANDANTES.items():
            empresa, _ = Organizacao.objects.get_or_create(
                cnpj=cnpj,
                defaults={'nome': organizacao, 'tipo': TipoOrganizacao.DEMANDANTE},
            )
            autores[chave] = self._conta(
                email, nome, papel=Papel.DEMANDANTE, organizacao=empresa
            )

        instituicao = (
            Organizacao.objects.filter(tipo=TipoOrganizacao.INSTITUICAO).order_by('pk').first()
        )
        membros = sum(self._membro(perfil, instituicao, supervisor) for perfil in REDE)

        oportunidades = sum(
            self._oportunidade(item, autores, supervisor) for item in OPORTUNIDADES
        )

        criterios = ImportarCriteriosService().execute(ator=supervisor)

        self.stdout.write(self.style.SUCCESS(
            f'\nRede: {membros} membro(s) novo(s), {len(REDE)} no seed.'
            f'\nOportunidades: {oportunidades} nova(s), {len(OPORTUNIDADES)} no seed.'
            f'\nCriterios PIPE: {criterios}.'
            '\n\nEntre com a sua conta de Supervisor para testar a IA.\n'
        ))

    def _conta(self, email, nome, *, papel, organizacao=None):
        conta = Usuario.objects.filter(email=email).first()

        if conta is None:
            conta = Usuario.objects.create_user(
                email=email, nome=nome, papel=papel, organizacao=organizacao
            )
            conta.situacao = SituacaoConta.ATIVO
            conta.save(update_fields=['situacao', 'atualizado_em'])

        return conta

    def _membro(self, perfil, instituicao, supervisor):
        email = email_do_membro(perfil['nome'])

        if MembroRede.objects.filter(email=email).exists():
            return 0

        membro = CadastrarMembroService().execute(
            dados={
                'nome': perfil['nome'],
                'email': email,
                'papel_rede': PapelNaRede.PESQUISADOR,
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
            ator=supervisor,
        )

        if perfil.get('situacao'):
            MembroRede.objects.filter(pk=membro.pk).update(situacao=perfil['situacao'])

        return 1

    def _oportunidade(self, item, autores, supervisor):
        autor = autores[item['autor']]

        if Oportunidade.objects.filter(titulo=item['titulo'], criado_por=autor).exists():
            return 0

        oportunidade = CadastrarOportunidadeService().execute(
            dados={
                'titulo': item['titulo'],
                'resumo': item['resumo'],
                'contexto': item['contexto'],
            },
            ator=autor,
        )

        if 'proposta' in item:
            proposta = IniciarPropostaService().execute(
                oportunidade=oportunidade, ator=supervisor
            )
            AtualizarPropostaService().execute(
                proposta=proposta, dados=item['proposta'], ator=supervisor
            )

        for descricao, nivel in item.get('competencias', []):
            AdicionarCompetenciaService().execute(
                oportunidade=oportunidade,
                dados={'descricao': descricao, 'nivel_importancia': nivel},
                ator=supervisor,
            )

        return 1
