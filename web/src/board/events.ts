/** Eventos entre o assistente da placa e o resto do site (mapa, administração). */
export const ADD_EVENT = 'meteo:usb-add'
export const PROBE_EVENT = 'meteo:usb-probe'
/** Pede ao site para autorizar uma placa nova (precisa de um clique do usuário). */
export const requestUsb = () => window.dispatchEvent(new Event(ADD_EVENT))

/** O assistente pede ao mapa para escolher um ponto; o mapa responde com o ponto (ou null se cancelar). */
export const PICK_EVENT = 'meteo:usb-pick'
export const PICKED_EVENT = 'meteo:usb-picked'
export type Picked = { lat: number; lon: number } | null
