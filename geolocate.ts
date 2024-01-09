import {existsSync, readFileSync, writeFileSync} from "fs";
import * as https from "https";

export interface Location {
    ip: string;
    country_code: string;
    country_name: string;
    region_name: string;
    city_name: string;
    latitude: number;
    longitude: number;
    zip_code: string;
    time_zone: string;
    asn: string;
    as: string;
    is_proxy: boolean;
}
export class IpGeolocator {
    private ipLocationMap: Map<string, Location> = new Map<string, Location>();
    private dataFilePath: string = "";
    private apiKey: string = "";
    private enableAPI: boolean;
    private readonly err: Error | undefined;

    constructor(dataFilePath: string = "data/geoip.json", enableAPI: boolean = true) {
        this.dataFilePath = dataFilePath;
        this.enableAPI = enableAPI;
        const loadResult = this.load();
        if (loadResult instanceof Error) {
            this.err = loadResult;
        }
    }

    public hasError(): boolean {
        return this.err !== undefined;
    }

    public getError(): Error | undefined {
        return this.err;
    }

    private load(): void | Error {
        if (this.enableAPI) {
            const apiKey = process.env.GEOIP_API_KEY;
            if (!apiKey) {
                return new Error("GEOIP_API_KEY environment variable not set");
            }
            this.apiKey = apiKey;
        }

        if (existsSync(this.dataFilePath)) {
            const fileContent = readFileSync(this.dataFilePath, 'utf8');
            const jsonData = JSON.parse(fileContent);

            if (Array.isArray(jsonData)) {
                this.loadFromArray(jsonData);
            } else {
                this.loadFromObject(jsonData);
            }
        }
    }

    private loadFromArray(jsonData: Record<string, Location>[]): void {
        this.ipLocationMap = new Map<string, Location>();
        jsonData.forEach((record) => {
            const ip = Object.keys(record)[0].trim();
            const location = record[ip];
            if (location) {
                console.log(`Loaded ${ip} -> ${location.latitude},${location.longitude}`);
                this.ipLocationMap.set(ip, location);
            } else {
                console.log(`Failed to load ${ip} -> ${location}`);
            }
        });
    }

    private loadFromObject(jsonData: Record<string, Location>): void {
        this.ipLocationMap = new Map<string, Location>();
        Object.keys(jsonData).forEach((ip) => {
            ip = ip.trim()
            const location = jsonData[ip];
            if (location) {
                console.log(`Loaded ${ip} -> ${location.latitude},${location.longitude}`);
                this.ipLocationMap.set(ip, location);
            } else {
                console.log(`Failed to load ${ip} -> ${location}`);
            }
        });
    }

    public async mergeAndLookupLocations(ipAddresses: string[]): Promise<IterableIterator<string>> {
        if (this.enableAPI) {
            const ipAddressesToLookup = ipAddresses.filter((ip) => !this.ipLocationMap.has(ip));
            await this.lookupAll(ipAddressesToLookup);
        }
        return this.ipLocationMap.keys();
    }
    public save() {
        try {
            const objToSave = Object.fromEntries(this.ipLocationMap);
            writeFileSync(this.dataFilePath, JSON.stringify(objToSave, null, 2), 'utf8');
        } catch (error) {
            console.error(`Error saving to file: ${error}`);
        }
    }

    private update(ip: string, location: Location): void {
        this.ipLocationMap.set(ip, location);
    }

    private isValidIp(ip: string): boolean {
        const regex = new RegExp('^\\d{1,3}(\\.\\d{1,3}){3}$');
        return regex.test(ip);
    }
    private fetchLocation(ip: string): Promise<Location | Error> {
        if (!this.isValidIp(ip)) {
            return new Promise((resolve) => {
                resolve(new Error('Invalid IP address.'));
            });
        }

        if (!this.enableAPI) {
            return new Promise((resolve) => {
                resolve(new Error('API disabled.'));
            });
        }

        const url: string = `https://api.ip2location.io/?key=${this.apiKey}&ip=${ip}&format=json`;

        return new Promise((resolve, reject) => {
            https.get(url, (resp) => {
                let data = '';
                resp.on('data', chunk => data += chunk);
                resp.on('end', () => {
                    try {
                        const location: Location = JSON.parse(data);
                        this.update(ip, location);
                        resolve(location);
                    } catch {
                        resolve(new Error('Failed to parse JSON response.'));
                    }
                })
                    .on("error", (err) => reject(err));
            });
        });
    }

    public getIPEntries(): IterableIterator<string> {
        return this.ipLocationMap.keys();
    }

    public size(): number {
        return this.ipLocationMap.size;
    }

    public async lookup(ip: string): Promise<Location | Error> {
        if (this.ipLocationMap.has(ip)) {
            let location = this.ipLocationMap.get(ip);
            if (location) {
                return location;
            } else {
                return new Error("Failed to get location");
            }
        }

        if (!this.enableAPI) {
            return new Error("Failed to get location");
        }
        return await this.fetchLocation(ip);
    }

    public async lookupAll(ipAddresses: string[]): Promise<(Error | Location)[]> {
        return await Promise.all(ipAddresses.map(async (ip) => {
            return await this.lookup(ip);
        }));
    }

    public iterator(): IterableIterator<[string, Location]> {
        return this.ipLocationMap.entries();
    }
}