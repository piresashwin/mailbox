import type { EmailProviderConnector, ProviderId } from './types'
import { gmailConnector } from './gmail'
import { outlookConnector } from './outlook'

const connectors: Record<string, EmailProviderConnector> = {
  outlook: outlookConnector,
  gmail: gmailConnector,
}

export function getConnector(id: ProviderId | string): EmailProviderConnector {
  const c = connectors[id]
  if (!c) throw new Error(`Unknown connector: ${id}`)
  return c
}

export function listConnectors(): EmailProviderConnector[] {
  return Object.values(connectors)
}
