import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import PainelPorPapel from './PainelPorPapel'

/**
 * Conteúdo do painel por papel.
 *
 * O painel responde a uma pergunta só — "o que espera por mim agora?" — e a
 * resposta muda com o ator. O que estes testes protegem é que ela não se
 * confunda: fila de decisão é do Supervisor (RN-A07), e o Pesquisador precisa
 * ler na tela que não há convite a aceitar (RN-A06).
 */
function renderPainel(role, displayName) {
  return render(
    <MemoryRouter>
      <PainelPorPapel user={{ role, displayName }} />
    </MemoryRouter>
  )
}

describe('PainelPorPapel', () => {
  it('dá ao Supervisor a fila e o que espera decisão', () => {
    renderPainel('supervisor', 'Rafael Antunes')

    const decisao = screen.getByText('Aguardando sua decisão').closest('.stat-card')
    expect(within(decisao).getByText('1')).toBeInTheDocument()

    expect(screen.getByRole('heading', { name: /esperando sua decisão/i })).toBeInTheDocument()
    expect(screen.getByText('Bioinsumo para cana-de-açúcar')).toBeInTheDocument()
  })

  it('aponta o Supervisor para os perfis invisíveis ao matching', () => {
    renderPainel('supervisor', 'Rafael Antunes')

    const alerta = screen.getByText('Perfis invisíveis ao matching').closest('.stat-card')
    expect(alerta).toHaveAttribute('href', '/rede')
  })

  it('mostra ao Pesquisador onde ele foi indicado, sem fila de decisão', () => {
    renderPainel('pesquisador', 'Maria Ferreira')

    expect(screen.getByText('Oportunidades comigo')).toBeInTheDocument()
    expect(screen.queryByText('Aguardando sua decisão')).not.toBeInTheDocument()

    // Dito na tela: o matching sugere, o Supervisor valida (RN-A06).
    expect(screen.getByText(/não há convite para aceitar ou recusar/i)).toBeInTheDocument()
  })

  it('leva o Pesquisador a completar o próprio perfil', () => {
    renderPainel('pesquisador', 'Maria Ferreira')

    const perfil = screen.getByText('Perfil completo').closest('.stat-card')
    expect(within(perfil).getByText('83%')).toBeInTheDocument()
    expect(perfil).toHaveAttribute('href', '/perfil')
  })

  it('limita o Demandante aos próprios registros', () => {
    renderPainel('demandante', 'Agroindústria Vale Verde')

    expect(screen.getByText('Problemas cadastrados')).toBeInTheDocument()
    expect(screen.getByText('Bioinsumo para cana-de-açúcar')).toBeInTheDocument()
    expect(screen.queryByText('Cultura starter para queijo artesanal')).not.toBeInTheDocument()
  })

  it('filtra pelo usuário, não por uma organização escrita no código', () => {
    renderPainel('demandante', 'Cooperativa Terra Boa')

    expect(screen.getByText('Redução de nitrito em embutidos')).toBeInTheDocument()
    // Com o nome fixo no código, esta seria a lista da Vale Verde.
    expect(screen.queryByText('Bioinsumo para cana-de-açúcar')).not.toBeInTheDocument()
  })

  it('não manda o Demandante para uma rota que ele não alcança', () => {
    renderPainel('demandante', 'Agroindústria Vale Verde')

    // `/oportunidades/:id` é de Supervisor e Pesquisador: o link levaria a
    // "acesso restrito", e o usuário culparia a plataforma.
    expect(screen.queryByRole('link', { name: /bioinsumo/i })).not.toBeInTheDocument()
  })

  it('não inventa painel para o Administrador, que tem o console', () => {
    const { container } = renderPainel('administrador', 'Administração da plataforma')

    expect(container).toBeEmptyDOMElement()
  })
})
