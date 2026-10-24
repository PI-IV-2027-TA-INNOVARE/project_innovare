import { describe, expect, it } from 'vitest'
import { eventoDaApi } from './oportunidadesData'

describe('eventoDaApi — observação do Supervisor (PB65)', () => {
  /**
   * Nos demais eventos o texto e fixo e o `tipo` basta. Na observacao o texto
   * E o conteudo: cair no rotulo generico apagaria o que foi escrito.
   */
  it('usa o texto escrito, não um rótulo fixo do tipo', () => {
    const evento = eventoDaApi(
      {
        ocorrido_em: '2026-09-22T10:00:00.000Z',
        categoria: 'observacao',
        tipo: 'observacao_registrada',
        ator: 'supervisor@ac2microbiologia.com.br',
        detalhe: {
          texto: 'Laudo do lote de verão confirma a contaminação.',
          autor_nome: 'Rafael Antunes',
        },
      },
      0
    )

    expect(evento.texto).toBe('Laudo do lote de verão confirma a contaminação.')
    expect(evento.categoria).toBe('observacao')
  })

  it('assina com o nome de quem escreveu, não com o e-mail', () => {
    const evento = eventoDaApi(
      {
        ocorrido_em: '2026-09-22T10:00:00.000Z',
        categoria: 'observacao',
        tipo: 'observacao_registrada',
        ator: 'supervisor@ac2microbiologia.com.br',
        detalhe: { texto: 'Nota.', autor_nome: 'Rafael Antunes' },
      },
      0
    )

    expect(evento.ator).toBe('Rafael Antunes')
  })

  it('não mexe no texto dos eventos que já tinham rótulo', () => {
    const evento = eventoDaApi(
      {
        ocorrido_em: '2026-09-01T10:00:00.000Z',
        categoria: 'oportunidade',
        tipo: 'anexo_enviado',
        ator: 'Agroindústria Vale Verde',
        detalhe: { nome: 'laudo.pdf', bytes: 2048 },
      },
      0
    )

    expect(evento.texto).toBe('Documento anexado ao registro.')
  })
})
