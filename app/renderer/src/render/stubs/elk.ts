// Remplace elkjs (licence EPL-2.0, non permissive) dans le paquet Mermaid :
// la disposition « elk » des diagrammes n'est pas disponible dans Plume.
export default class ELK {
  layout(): Promise<never> {
    return Promise.reject(new Error('La disposition ELK n’est pas disponible dans Plume.'))
  }
}
