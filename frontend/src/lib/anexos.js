export const EXTENSOES_ACEITAS = '.pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx'

export const TIPOS_POR_EXTENSO = 'PDF, PNG, JPG, TXT, CSV, Word (.docx) ou Excel (.xlsx)'

export const PRAZO_DE_GUARDA =
  'Os documentos ficam guardados por até 24 meses após o arquivamento da oportunidade.'

export const TETO_BYTES = 10 * 1024 * 1024

export function tamanhoLegivel(bytes) {
  if (!bytes) return '—'

  const kb = bytes / 1024

  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`
}

export function tipoDoArquivo(nome) {
  const extensao = (nome || '').split('.').pop()

  if (!extensao || extensao === nome) return 'ARQ'

  return extensao === 'jpeg' ? 'JPG' : extensao.toUpperCase().slice(0, 4)
}

export function tipoAceito(nome) {
  const partes = (nome || '').toLowerCase().split('.')

  return partes.length > 1 && EXTENSOES_ACEITAS.split(',').includes(`.${partes.pop()}`)
}

export function quantosDocumentos(total) {
  return total === 1 ? '1 documento' : `${total} documentos`
}

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
