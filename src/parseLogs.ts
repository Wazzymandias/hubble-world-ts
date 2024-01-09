import { existsSync, readFileSync } from 'fs'

interface LogEntry {
  peerInfo?: {
    gossipAddress?: {
      address?: string
    }
  }
}
export function parseGossipAddress (address: string): string[] {
  if (!existsSync(address)) {
    throw new Error(`File ${address} does not exist`)
  }

  const fileContent = readFileSync(address, 'utf8')
  const logLines = fileContent.split('\n')

  return logLines.reduce((acc: string[], line) => {
    if (line !== '') {
      try {
        const logEntry: LogEntry = JSON.parse(line)
        const ip = logEntry.peerInfo?.gossipAddress?.address
        if (ip !== undefined && ip !== '') {
          acc.push(ip)
        }
      } catch (e) {
        // console.log(`Error parsing line: ${line}`);
      }
    }
    return acc
  }, [])
}
