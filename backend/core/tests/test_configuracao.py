"""
Travas de configuracao: a chave de assinatura e o isolamento da suite.
As duas tem o mesmo desenho - regra de seguranca sem teste e regra que ninguem
percebe quando quebra (ver `core/configuracao.py`).
"""
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db import connections
from django.test import SimpleTestCase
from core.configuracao import (
    AMBIENTE_LOCAL,
    AMBIENTE_PRODUCAO,
    AMBIENTES,
    CHAVE_DE_DESENVOLVIMENTO,
    VIDA_DA_CONEXAO_EM_PRODUCAO,
    ambiente_declarado,
    ambiente_incoerente,
    chave_de_assinatura,
    exigir_ambiente_coerente,
    pool_de_conexoes,
    seguranca_de_transporte,
    vida_da_conexao,
)


CHAVE_PROPRIA = 'k9x!7cqw2m4v8zb3n6t1s5rj0hgl-pd-connect'


class ChaveDeAssinaturaTests(SimpleTestCase):
    def test_producao_recusa_subir_sem_chave_propria(self):
        with self.assertRaises(ImproperlyConfigured):
            chave_de_assinatura('', debug=False)

    def test_producao_recusa_a_chave_que_esta_no_repositorio(self):
        with self.assertRaises(ImproperlyConfigured):
            chave_de_assinatura(CHAVE_DE_DESENVOLVIMENTO, debug=False)

    def test_o_erro_ensina_a_gerar_uma_chave(self):
        """Quem toma o erro no deploy precisa sair dele sabendo o que fazer."""
        with self.assertRaises(ImproperlyConfigured) as capturado:
            chave_de_assinatura('', debug=False)
        self.assertIn('get_random_secret_key', str(capturado.exception))

    def test_producao_aceita_chave_propria(self):
        self.assertEqual(
            chave_de_assinatura(CHAVE_PROPRIA, debug=False), CHAVE_PROPRIA
        )

    def test_desenvolvimento_sobe_sem_chave_configurada(self):
        """Em dev a falta de chave nao pode travar quem acabou de clonar."""
        self.assertEqual(
            chave_de_assinatura('', debug=True), CHAVE_DE_DESENVOLVIMENTO
        )

    def test_espaco_em_branco_conta_como_ausencia(self):
        with self.assertRaises(ImproperlyConfigured):
            chave_de_assinatura('   ', debug=False)


class IsolamentoDuranteOsTestesTests(SimpleTestCase):
    """
    O `.env` de uma maquina de trabalho carrega credencial real: SMTP
    autenticado, banco remoto, chave de IA.
    O mandato 0.1 do AGENTS.md diz que a suite nao toca nenhum deles, e o
    `settings.py` impoe isso em vez de confiar na configuracao. Estes casos
    afirmam o resultado sobre as settings **desta** execucao: se a trava saisse
    do lugar, a conta chega aqui - nao numa cota de API consumida, num banco de
    cliente dropado ou num e-mail entregue a um endereco de verdade.
    """

    def test_o_transporte_de_email_e_locmem(self):
        self.assertEqual(
            settings.EMAIL_BACKEND,
            'django.core.mail.backends.locmem.EmailBackend',
        )

    def test_nenhuma_notificacao_por_email_sai(self):
        self.assertFalse(settings.SEND_NOTIFICATION_EMAILS)

    def test_a_ia_externa_fica_sem_chave_e_desligada(self):
        self.assertEqual(settings.GEMINI_API_KEY, '')
        self.assertFalse(settings.AI_MATCH_RERANK_ENABLED)

    def test_o_banco_em_uso_nao_e_remoto(self):
        host = settings.DATABASES['default'].get('HOST', '')
        self.assertIn(host.strip().lower(), settings.LOCAL_DB_HOSTS)

    def test_o_throttling_nao_estrangula_a_suite(self):
        taxas = settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']
        self.assertTrue(all(taxa is None for taxa in taxas.values()))

    def test_a_conexao_da_suite_morre_com_a_requisicao(self):
        """
        `AMBIENTE=producao` no `.env` da maquina nao pode fazer a suite herdar
        conexao persistente: o teardown precisa derrubar o banco de teste, e o
        Postgres recusa o `DROP` com sessao aberta nele.
        A leitura e em `connections`, nao em `settings.DATABASES`: quando o
        tripwire troca para SQLite ele reescreve o dicionario inteiro, e e o
        Django quem repoe os defaults de conexao em cima do que sobrou.
        """
        self.assertEqual(connections['default'].settings_dict['CONN_MAX_AGE'], 0)

    def test_a_suite_nao_usa_pool_de_conexoes(self):
        """
        Conexao guardada no pool sobrevive ao teste do mesmo jeito que a
        persistente, e o `DROP` do banco de teste esbarra nela.
        """
        opcoes = connections['default'].settings_dict.get('OPTIONS', {})
        self.assertFalse(opcoes.get('pool'))


class AmbienteDeclaradoTests(SimpleTestCase):
    """
    O ambiente e declarado, nao adivinhado.
    O `.env` desta maquina aponta para o Neon. Sem uma declaracao explicita, a
    unica pista seria o `DB_HOST`, e inferir ambiente de hostname erra nos dois
    sentidos: um tunel local para o Neon pareceria producao, e um Postgres
    gerenciado com DNS proprio pareceria local. Quem opera diz onde esta.
    """

    def test_ausencia_de_declaracao_vale_como_local(self):
        """Quem acabou de clonar nao tem `.env`, e local e o padrao seguro."""
        self.assertEqual(ambiente_declarado(''), AMBIENTE_LOCAL)
        self.assertEqual(ambiente_declarado(None), AMBIENTE_LOCAL)

    def test_producao_e_reconhecida(self):
        self.assertEqual(ambiente_declarado('producao'), AMBIENTE_PRODUCAO)

    def test_caixa_e_espaco_nao_mudam_o_ambiente(self):
        self.assertEqual(ambiente_declarado('  PRODUCAO '), AMBIENTE_PRODUCAO)

    def test_ambiente_desconhecido_impede_a_subida(self):
        """
        `AMBIENTE=prod` cairia no padrao local e afrouxaria TLS e pool em
        silencio, contra um banco de verdade. Falha ruidosa em vez disso.
        """
        with self.assertRaises(ImproperlyConfigured):
            ambiente_declarado('prod')

    def test_o_erro_lista_os_ambientes_aceitos(self):
        with self.assertRaises(ImproperlyConfigured) as capturado:
            ambiente_declarado('homologacao')
        for aceito in AMBIENTES:
            self.assertIn(aceito, str(capturado.exception))


class VidaDaConexaoTests(SimpleTestCase):
    """
    Quanto tempo a conexao com o banco sobrevive a requisicao.
    O padrao do Django e zero: fecha e reabre a cada requisicao. Contra um
    Postgres na mesma maquina isso custa quase nada; contra o Neon custa
    handshake TCP, TLS e autenticacao no proxy **antes da primeira query
    sair** - e ninguem percebe lendo o codigo, porque o custo nao esta em
    nenhuma linha dele.
    """

    def test_local_fecha_a_conexao_a_cada_requisicao(self):
        """O padrao do Django serve: o custo de reabrir e desprezivel."""
        self.assertEqual(vida_da_conexao(AMBIENTE_LOCAL), 0)

    def test_producao_reaproveita_a_conexao(self):
        self.assertEqual(
            vida_da_conexao(AMBIENTE_PRODUCAO), VIDA_DA_CONEXAO_EM_PRODUCAO
        )

    def test_valor_declarado_vence_o_padrao_do_ambiente(self):
        self.assertEqual(vida_da_conexao(AMBIENTE_PRODUCAO, '30'), 30)
        self.assertEqual(vida_da_conexao(AMBIENTE_LOCAL, '120'), 120)

    def test_chave_vazia_conta_como_ausencia(self):
        """
        O `decouple` le string vazia quando a chave existe sem valor - e um
        `int('')` ali derrubaria a subida em vez de usar o padrao.
        """
        self.assertEqual(
            vida_da_conexao(AMBIENTE_PRODUCAO, ''), VIDA_DA_CONEXAO_EM_PRODUCAO
        )
        self.assertEqual(vida_da_conexao(AMBIENTE_PRODUCAO, '   '), 600)

    def test_a_suite_nunca_herda_conexao_persistente(self):
        """
        Conexao viva no fim do teste e conexao que o teardown nao consegue
        derrubar: o Postgres recusa o DROP do banco de teste com sessao aberta
        nele. O ambiente declarado nao decide isso.
        """
        self.assertEqual(
            vida_da_conexao(AMBIENTE_PRODUCAO, '600', rodando_testes=True), 0
        )

    def test_valor_nao_numerico_impede_a_subida(self):
        with self.assertRaises(ImproperlyConfigured):
            vida_da_conexao(AMBIENTE_PRODUCAO, 'dez minutos')

    def test_com_pool_a_conexao_volta_para_o_pool_e_nao_persiste(self):
        """
        O Django recusa subir com pool e `CONN_MAX_AGE` ao mesmo tempo: quem
        reaproveita a conexao passa a ser o pool.
        """
        self.assertEqual(vida_da_conexao(AMBIENTE_PRODUCAO, com_pool=True), 0)
        self.assertEqual(
            vida_da_conexao(AMBIENTE_PRODUCAO, '600', com_pool=True), 0
        )


class PoolDeConexoesTests(SimpleTestCase):
    """
    O pool mantem conexoes abertas no processo, compartilhadas entre threads.

    O `CONN_MAX_AGE` sozinho nao resolve no `runserver`: ele abre uma thread
    por requisicao, a conexao do Django e por thread, e cada requisicao volta
    a pagar TCP, TLS e autenticacao - mais de um segundo contra o Neon.
    """

    def test_ausencia_de_declaracao_liga_o_pool(self):
        self.assertTrue(pool_de_conexoes(None))
        self.assertTrue(pool_de_conexoes(''))

    def test_pode_ser_desligado(self):
        self.assertIsNone(pool_de_conexoes('False'))
        self.assertIsNone(pool_de_conexoes(False))

    def test_a_suite_nunca_usa_pool(self):
        self.assertIsNone(pool_de_conexoes('True', rodando_testes=True))

    def test_espera_uma_conexao_livre_por_tempo_limitado(self):
        self.assertGreater(pool_de_conexoes(None)['timeout'], 0)

    def test_valor_que_nao_e_booleano_impede_a_subida(self):
        with self.assertRaises(ImproperlyConfigured):
            pool_de_conexoes('talvez')


class EndurecimentoDeTransporteTests(SimpleTestCase):
    """
    O que o `check --deploy` cobrava e ninguem respondia.

    `manage.py check --deploy` apontava cinco avisos; quatro eram a mesma coisa
    dita de formas diferentes: **nada no `settings.py` endurecia o transporte**.
    Sem `SECURE_SSL_REDIRECT` o login viaja em claro se alguem chegar por
    `http://`; sem `*_COOKIE_SECURE` o cookie acompanha essa viagem; sem HSTS o
    navegador repete o erro na proxima visita.

    Fica condicionado ao ambiente pelo mesmo motivo que `vida_da_conexao`:
    ligar redirect de HTTPS em `runserver` local quebra o desenvolvimento sem
    proteger ninguem. O `raise` de `ambiente_declarado` e o que garante que
    "producao" nao seja alcancada por erro de digitacao.
    """

    def test_producao_exige_https_cookie_seguro_e_hsts(self):
        endurecimento = seguranca_de_transporte(AMBIENTE_PRODUCAO, debug=False)

        self.assertTrue(endurecimento['AUTH_COOKIE_SECURE'])
        self.assertTrue(endurecimento['SECURE_SSL_REDIRECT'])
        self.assertTrue(endurecimento['SESSION_COOKIE_SECURE'])
        self.assertTrue(endurecimento['CSRF_COOKIE_SECURE'])
        self.assertGreaterEqual(endurecimento['SECURE_HSTS_SECONDS'], 3600)

    def test_producao_confia_no_cabecalho_do_proxy(self):
        """
        Atras de proxy que termina o TLS, o Django ve `http` e redirecionaria
        em laco. O `SECURE_PROXY_SSL_HEADER` e o que quebra o laco.
        """
        endurecimento = seguranca_de_transporte(AMBIENTE_PRODUCAO, debug=False)

        self.assertEqual(
            endurecimento['SECURE_PROXY_SSL_HEADER'],
            ('HTTP_X_FORWARDED_PROTO', 'https'),
        )

    def test_local_nao_redireciona_nem_exige_cookie_seguro(self):
        endurecimento = seguranca_de_transporte(AMBIENTE_LOCAL, debug=False)

        self.assertFalse(endurecimento['AUTH_COOKIE_SECURE'])
        self.assertFalse(endurecimento['SECURE_SSL_REDIRECT'])
        self.assertFalse(endurecimento['SESSION_COOKIE_SECURE'])
        self.assertFalse(endurecimento['CSRF_COOKIE_SECURE'])
        self.assertEqual(endurecimento['SECURE_HSTS_SECONDS'], 0)

    def test_o_antisniffing_vale_nos_dois_ambientes(self):
        """
        `nosniff` e `DENY` nao dependem de TLS e nao atrapalham o local: nao ha
        motivo para deixar o desenvolvimento sem eles.
        """
        for ambiente in (AMBIENTE_LOCAL, AMBIENTE_PRODUCAO):
            with self.subTest(ambiente=ambiente):
                endurecimento = seguranca_de_transporte(ambiente, debug=False)

                self.assertTrue(endurecimento['SECURE_CONTENT_TYPE_NOSNIFF'])
                self.assertEqual(endurecimento['X_FRAME_OPTIONS'], 'DENY')

    def test_testes_nao_redirecionam_para_https(self):
        """
        A suite fala `http://testserver`. Redirect ligado devolveria 301 em todo
        teste de API, e a resposta certa e nao ligar o redirect sob teste.
        """
        endurecimento = seguranca_de_transporte(
            AMBIENTE_PRODUCAO, debug=False, rodando_testes=True
        )

        self.assertFalse(endurecimento['SECURE_SSL_REDIRECT'])
        self.assertEqual(endurecimento['SECURE_HSTS_SECONDS'], 0)

    def test_debug_ligado_nao_redireciona_mesmo_declarando_producao(self):
        """
        `AMBIENTE=producao` com `DEBUG=True` e maquina de desenvolvimento
        apontada para o banco de verdade - combinacao que existe no `.env` da
        equipe hoje. Redirecionar para HTTPS ali derruba o `runserver`, que nao
        fala TLS: toda requisicao vira 301 para um endereco que nao responde.

        `DEBUG=True` e a declaracao inequivoca de "isto nao e um deploy", e e
        dessa leitura que a propria `security.W018` do Django parte.
        """
        endurecimento = seguranca_de_transporte(AMBIENTE_PRODUCAO, debug=True)

        self.assertFalse(endurecimento['SECURE_SSL_REDIRECT'])
        self.assertFalse(endurecimento['SESSION_COOKIE_SECURE'])
        self.assertFalse(endurecimento['CSRF_COOKIE_SECURE'])
        self.assertEqual(endurecimento['SECURE_HSTS_SECONDS'], 0)

    def test_mesmo_com_debug_o_antisniffing_continua(self):
        """O que nao depende de TLS nao tem motivo para sair com o DEBUG."""
        endurecimento = seguranca_de_transporte(AMBIENTE_PRODUCAO, debug=True)

        self.assertTrue(endurecimento['SECURE_CONTENT_TYPE_NOSNIFF'])
        self.assertEqual(endurecimento['X_FRAME_OPTIONS'], 'DENY')
        self.assertTrue(endurecimento['SESSION_COOKIE_HTTPONLY'])

    def test_producao_de_verdade_continua_endurecida(self):
        """A trava nao pode cair junto: sem DEBUG, producao endurece."""
        endurecimento = seguranca_de_transporte(AMBIENTE_PRODUCAO, debug=False)

        self.assertTrue(endurecimento['SECURE_SSL_REDIRECT'])
        self.assertTrue(endurecimento['SESSION_COOKIE_SECURE'])
        self.assertTrue(endurecimento['CSRF_COOKIE_SECURE'])
        self.assertGreaterEqual(endurecimento['SECURE_HSTS_SECONDS'], 3600)


class AvisoDeAmbienteIncoerenteTests(SimpleTestCase):
    """
    `AMBIENTE=producao` com `DEBUG=True` precisa gritar.

    A combinacao e maquina de desenvolvimento apontada para o banco de verdade,
    e foi ela que transformou o endurecimento de transporte num 301 permanente
    contra `runserver`: o navegador cacheia 301 e passa a falhar toda chamada da
    API mesmo depois de o servidor parar de redirecionar. O conserto foi
    desarmar o endurecimento sob `DEBUG`, mas quem tem esse `.env` continua com
    um ambiente que mente sobre si mesmo - e merece saber.
    """

    def test_producao_com_debug_e_incoerente(self):
        self.assertTrue(ambiente_incoerente(AMBIENTE_PRODUCAO, debug=True))

    def test_producao_sem_debug_e_coerente(self):
        self.assertFalse(ambiente_incoerente(AMBIENTE_PRODUCAO, debug=False))

    def test_local_com_debug_e_coerente(self):
        self.assertFalse(ambiente_incoerente(AMBIENTE_LOCAL, debug=True))

    def test_local_sem_debug_e_coerente(self):
        self.assertFalse(ambiente_incoerente(AMBIENTE_LOCAL, debug=False))


class RecusaDeAmbienteIncoerenteTests(SimpleTestCase):
    """
    Producao com `DEBUG=True` para de subir, em vez de so avisar.

    Era a combinacao do `.env` de desenvolvimento apontado para o Neon: a pagina
    de erro detalhada saia para quem pedisse, e os anexos ficavam abertos.
    """

    def test_producao_com_debug_impede_a_subida(self):
        with self.assertRaises(ImproperlyConfigured) as erro:
            exigir_ambiente_coerente(AMBIENTE_PRODUCAO, debug=True)

        self.assertIn('banco local', str(erro.exception))

    def test_producao_sem_debug_sobe(self):
        exigir_ambiente_coerente(AMBIENTE_PRODUCAO, debug=False)

    def test_local_com_debug_sobe(self):
        exigir_ambiente_coerente(AMBIENTE_LOCAL, debug=True)

    def test_a_suite_nao_e_barrada(self):
        exigir_ambiente_coerente(AMBIENTE_PRODUCAO, debug=True, rodando_testes=True)
