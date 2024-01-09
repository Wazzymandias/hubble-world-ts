import { existsSync, readFileSync, writeFileSync } from 'fs'
import * as https from 'https'

export interface Location {
  ip: string
  country_code: string
  country_name: string
  region_name: string
  city_name: string
  latitude: number
  longitude: number
  zip_code: string
  time_zone: string
  asn: string
  as: string
  is_proxy: boolean
}

export class IpGeolocator {
  private ipLocationMap: Map<string, Location> = new Map<string, Location>()
  private readonly dataFilePath: string = ''
  private apiKey: string = ''
  private readonly enableAPI: boolean
  private readonly err: Error | undefined

  constructor (
    dataFilePath: string = 'data/geoip.json',
    enableAPI: boolean = true
  ) {
    this.dataFilePath = dataFilePath
    this.enableAPI = enableAPI
    const loadResult = this.load()
    if (loadResult instanceof Error) {
      this.err = loadResult
    }
  }

  public hasError (): boolean {
    return this.err !== undefined
  }

  public getError (): Error | undefined {
    return this.err
  }

  private load (): null | Error {
    if (this.enableAPI) {
      const apiKey = process.env.GEOIP_API_KEY
      if (apiKey === undefined || apiKey === '') {
        return new Error('GEOIP_API_KEY environment variable not set')
      }
      this.apiKey = apiKey
    }

    if (existsSync(this.dataFilePath)) {
      const fileContent = readFileSync(this.dataFilePath, 'utf8')
      const jsonData = JSON.parse(fileContent)

      if (Array.isArray(jsonData)) {
        this.loadFromArray(jsonData as Array<Record<string, Location>>)
      } else {
        this.loadFromObject(jsonData as Record<string, Location>)
      }
    }
    return null
  }

  private loadFromArray (jsonData: Array<Record<string, Location>>): void {
    this.ipLocationMap = new Map<string, Location>()
    jsonData.forEach((record) => {
      const ip = Object.keys(record)[0].trim()
      const location = record[ip]
      console.log(`Loaded ${ip} -> ${location.latitude},${location.longitude}`)
      this.ipLocationMap.set(ip, location)
    })
  }

  private loadFromObject (jsonData: Record<string, Location>): void {
    this.ipLocationMap = new Map<string, Location>()
    Object.keys(jsonData).forEach((ip) => {
      ip = ip.trim()
      const location = jsonData[ip]
      console.log(`Loaded ${ip} -> ${location.latitude},${location.longitude}`)
      this.ipLocationMap.set(ip, location)
    })
  }

  public async mergeAndLookupLocations (
    ipAddresses: string[]
  ): Promise<IterableIterator<string>> {
    if (this.enableAPI) {
      const ipAddressesToLookup = ipAddresses.filter(
        (ip) => !this.ipLocationMap.has(ip)
      )

      if (ipAddressesToLookup.length !== 0) {
        await this.lookupAll(ipAddressesToLookup)
      }
    }
    return this.ipLocationMap.keys()
  }

  public save (): void {
    try {
      const objToSave = Object.fromEntries(this.ipLocationMap)
      writeFileSync(
        this.dataFilePath,
        JSON.stringify(objToSave, null, 2),
        'utf8'
      )
    } catch (error: any) {
      console.error(`Error saving to file: ${error}`)
    }
  }

  private update (ip: string, location: Location): void {
    this.ipLocationMap.set(ip, location)
  }

  private isValidIp (ip: string): boolean {
    const regex = '^\\d{1,3}(\\.\\d{1,3}){3}$'
    return ip.match(regex) !== null
  }

  private async fetchLocation (ip: string): Promise<Location | Error> {
    if (!this.isValidIp(ip)) {
      return await new Promise((resolve) => {
        resolve(new Error('Invalid IP address.'))
      })
    }

    if (!this.enableAPI) {
      return await new Promise((resolve) => {
        resolve(new Error('API disabled.'))
      })
    }

    const url: string = `https://api.ip2location.io/?key=${this.apiKey}&ip=${ip}&format=json`

    return await new Promise((resolve, reject) => {
      https.get(url, (resp) => {
        let data = ''
        resp.on('data', (chunk) => {
          data += chunk
        })
        resp
          .on('end', () => {
            try {
              const location: Location = JSON.parse(data)
              this.update(ip, location)
              resolve(location)
            } catch {
              resolve(new Error('Failed to parse JSON response.'))
            }
          })
          .on('error', (err) => {
            reject(err)
          })
      })
    })
  }

  public getIPEntries (): IterableIterator<string> {
    return this.ipLocationMap.keys()
  }

  public size (): number {
    return this.ipLocationMap.size
  }

  public async lookup (ip: string): Promise<Location | Error> {
    if (this.ipLocationMap.has(ip)) {
      const location = this.ipLocationMap.get(ip)
      if (location !== undefined) {
        return location
      } else {
        return new Error('Failed to get location')
      }
    }

    if (!this.enableAPI) {
      return new Error('Failed to get location')
    }
    return await this.fetchLocation(ip)
  }

  public async lookupAll (
    ipAddresses: string[]
  ): Promise<Array<Error | Location>> {
    return await Promise.all(
      ipAddresses.map(async (ip) => {
        return await this.lookup(ip)
      })
    )
  }

  public iterator (): IterableIterator<[string, Location]> {
    return this.ipLocationMap.entries()
  }
}
