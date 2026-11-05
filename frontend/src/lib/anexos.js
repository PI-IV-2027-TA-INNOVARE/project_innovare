export const EXTENSOES_ACEITAS = '.pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx'

export const TIPOS_POR_EXTENSO = 'PDF, PNG, JPG, TXT, CSV, Word (.docx) ou Excel (.xlsx)'

export const PRAZO_DE_GUARDA =
  'Os documentos ficam guardados por até 24 meses após o arquivamento da oportunidade.'

export function salvarNoComputador({ conteudo, nome }) {
  const endereco = URL.createObjectURL(conteudo)
  const link = document.createElement('a')

  link.href = endereco
  link.download = nome
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(endereco)
}
