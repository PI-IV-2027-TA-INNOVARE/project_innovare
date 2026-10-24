import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ORIGENS, SITUACOES } from '../../app/oportunidades/oportunidadesData'
import LivePreview from './LivePreview'

describe('LivePreview', () => {
  it('não promete aviso ao Supervisor: a caixa de notificações é só do Demandante', () => {
    render(<LivePreview />)

    expect(screen.queryByText(/notificar o supervisor/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('mostra o controle de marcar que o sistema usa de fato', () => {
    render(<LivePreview />)

    expect(screen.getByLabelText(/liberar acesso agora/i)).toHaveRole('checkbox')
  })

  it('os selos são situações e origens reais do fluxo, com as classes da fila', () => {
    const { container } = render(<LivePreview />)

    const situacoes = SITUACOES.map((situacao) => situacao.label)
    const origens = ORIGENS.map((origem) => origem.label)
    const selosDeSituacao = [...container.querySelectorAll('.fluxo-badge')]
    const selosDeOrigem = [...container.querySelectorAll('.origem-badge')]

    expect(selosDeSituacao.length).toBeGreaterThan(0)
    expect(selosDeOrigem.length).toBeGreaterThan(0)
    selosDeSituacao.forEach((selo) => expect(situacoes).toContain(selo.textContent))
    selosDeOrigem.forEach((selo) => expect(origens).toContain(selo.textContent))
    expect(screen.queryByText(/^(concluída|bloqueada)$/i)).not.toBeInTheDocument()
  })
})
