import { describe, expect, it } from 'vitest'
import {
  REGRAS_DA_SENHA,
  errosDosCampos,
  problemaNaConfirmacao,
  problemaNaNovaSenha,
} from './senha'

describe('regras da nova senha', () => {
  it('lista as quatro regras que o servidor aplica', () => {
    const texto = REGRAS_DA_SENHA.join(' ')

    expect(REGRAS_DA_SENHA).toHaveLength(4)
    expect(texto).toMatch(/8 caracteres/)
    expect(texto).toMatch(/só números/)
    expect(texto).toMatch(/nome ou .*e-mail/)
    expect(texto).toMatch(/senha comum/)
  })

  it.each([
    ['', /informe a nova senha/i],
    ['curta', /pelo menos 8 caracteres/i],
    ['12345678', /só números/i],
  ])('recusa %j antes de ir ao servidor', (senha, mensagem) => {
    expect(problemaNaNovaSenha(senha)).toMatch(mensagem)
  })

  it('deixa para o servidor o que só ele sabe julgar', () => {
    expect(problemaNaNovaSenha('Bioinsumo!2026')).toBe('')
  })

  it('confere a confirmação', () => {
    expect(problemaNaConfirmacao('Bioinsumo!2026', '')).toMatch(/repita a nova senha/i)
    expect(problemaNaConfirmacao('Bioinsumo!2026', 'Bioinsumo!2027')).toMatch(/não coincidem/i)
    expect(problemaNaConfirmacao('Bioinsumo!2026', 'Bioinsumo!2026')).toBe('')
  })
})

describe('erros que o servidor devolve por campo', () => {
  const CAMPOS = { senha_atual: 'senhaAtual', nova_senha: 'novaSenha' }

  it('leva cada mensagem ao campo dela', () => {
    const falha = {
      data: {
        senha_atual: ['Senha atual incorreta.'],
        nova_senha: ['Esta senha é muito comum.', 'Esta senha é inteiramente numérica.'],
      },
    }

    expect(errosDosCampos(falha, CAMPOS)).toEqual({
      senhaAtual: 'Senha atual incorreta.',
      novaSenha: 'Esta senha é muito comum. Esta senha é inteiramente numérica.',
    })
  })

  it('ignora o que não é de campo conhecido', () => {
    expect(errosDosCampos({ data: { detail: 'Token inválido.' } }, CAMPOS)).toEqual({})
    expect(errosDosCampos(new Error('Falha de rede'), CAMPOS)).toEqual({})
  })
})
