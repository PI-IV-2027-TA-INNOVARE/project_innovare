import { Icone, appIcons } from '../../../lib/icons'
import {
  MATRIZ_DE_RESPONSABILIDADES,
  PAPEIS_DA_MATRIZ,
} from '../../../lib/permissoes'
import { ROLE_LABELS } from '../../../lib/roles'

const TONS = Object.freeze({
  Sim: 'sim',
  Não: 'nao',
  Acompanha: 'acompanha',
  Próprias: 'proprias',
  Administrativo: 'administrativo',
})

function ValorDaMatriz({ valor }) {
  return (
    <span className={`permissoes__valor permissoes__valor--${TONS[valor]}`}>
      {valor}
    </span>
  )
}

export default function PermissoesSection() {
  return (
    <div className="admin-section">
      <header className="admin-section__header">
        <div>
          <h2 className="admin-section__title">Permissões</h2>
          <p className="admin-section__description">
            A matriz macro de responsabilidades por perfil. Ela é fixa: mudar
            quem pode o quê é uma decisão de escopo, não uma configuração desta
            tela.
          </p>
        </div>
      </header>

      <div className="permissoes__aviso" role="note">
        <Icone icon={appIcons.lock} className="permissoes__aviso-icone" />
        <p>
          <strong>Somente leitura.</strong> O Administrador gerencia contas e
          acessos na tela de Usuários; as atribuições científicas e decisórias
          continuam com o Supervisor.
        </p>
      </div>

      <div className="permissoes__rolagem">
        <table className="permissoes__tabela">
          <caption className="permissoes__legenda">
            Quem pode fazer o quê na plataforma
          </caption>
          <thead>
            <tr>
              <th scope="col">Ação</th>
              {PAPEIS_DA_MATRIZ.map((papel) => (
                <th key={papel} scope="col">
                  {ROLE_LABELS[papel]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MATRIZ_DE_RESPONSABILIDADES.map((linha) => (
              <tr key={linha.acao}>
                <th scope="row">{linha.acao}</th>
                {PAPEIS_DA_MATRIZ.map((papel) => (
                  <td key={papel}>
                    <ValorDaMatriz valor={linha[papel]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="permissoes__notas">
        <div>
          <dt>Acompanha</dt>
          <dd>Vê o andamento, sem executar a ação.</dd>
        </div>
        <div>
          <dt>Próprias</dt>
          <dd>Somente as oportunidades que cadastrou.</dd>
        </div>
        <div>
          <dt>Administrativo</dt>
          <dd>Consulta para auditoria, sem conduzir o fluxo científico.</dd>
        </div>
      </dl>
    </div>
  )
}
