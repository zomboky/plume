// Emplacement des données de l'application.
// Installée : %APPDATA%\Plume. Portable : dossier `data\` à côté de l'exécutable.
import { app } from 'electron'
import { join } from 'node:path'

export function configureDataDir(): string {
  const override = process.env.PLUME_USER_DATA
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR
  let dir: string
  if (override) dir = override
  else if (portableDir) dir = join(portableDir, 'data')
  else dir = join(app.getPath('appData'), 'Plume')
  app.setPath('userData', dir)
  app.setPath('sessionData', join(dir, 'session'))
  return dir
}
