import { Command } from "commander";
import { watch } from "fs";
import { parseGossipAddress } from "./parseLogs";
import {IpGeolocator, type Location} from "./geolocate";
import * as blessed from "blessed";
import * as contrib from "blessed-contrib";

class HubbleWorldApp {
    private app: Command;
    private geoip: IpGeolocator;
    private screen: blessed.Widgets.Screen;
    private map: contrib.Widgets.MapElement.prototype;

    constructor() {
        this.app = new Command();
        this.configureApp();
        this.geoip = new IpGeolocator();
        this.setupScreen();
    }

    private configureApp(): void {
        this.app.name("hubble-world").description("TUI map of Hubble instances around the world");
        this.app.option("--hub-log-file <path>", "Path to the hub log file");
        this.app.option("--watch", "Watch the hub log file for changes")

        this.app.action(this.handleAction.bind(this));
    }

    private async handleAction(options: { hubLogFile: string, watch: boolean }): Promise<void> {
        if (this.geoip.hasError()) {
            console.error(`Failed to initialize GeoIP: ${this.geoip.getError()?.message}`);
            process.exit(1);
        }

        if (options.hubLogFile) {
            if (options.watch) {
                console.log(`Watching ${options.hubLogFile} for changes`);
                watch(options.hubLogFile, async () => {
                    let updatedIPs = parseGossipAddress(options.hubLogFile);
                    await this.geoip.mergeAndLookupLocations(updatedIPs);
                    this.updateMapMarkers();
                });
            }
            await this.processLogAndDisplayMap(options.hubLogFile);
        } else if (this.geoip.size() === 0) {
            console.error("No hub log file specified and cached entries not found.");
            return this.app.help();
        }
    }

    private setupScreen(): void {
        this.screen = blessed.screen({ smartCSR: true });
        this.map = contrib.map({ label: 'Hub Locations' });
        this.screen.append(this.map);
        this.screen.key(['escape', 'q', 'C-c'], () => process.exit(0));
    }

    private async processLogAndDisplayMap(logFilePath: string): Promise<void> {
        const ipAddresses = parseGossipAddress(logFilePath);
        await this.geoip.mergeAndLookupLocations(ipAddresses);

        for (const ip of this.geoip.getIPEntries()) {
            const location = await this.geoip.lookup(ip);
            if (location instanceof Error) {
                console.error(`Failed to get location for IP ${ip}: ${location.message}`);
            } else {
                this.addLocationMarker(location);
            }
        }

        this.screen.render();
    }

    private addLocationMarker(location: Location): void {
        this.map.addMarker({ lon: location.longitude, lat: location.latitude, color: "red", char: "X" });
    }

    private updateMapMarkers(): void {
        this.map.clearMarkers();
        for (let [_, location] of this.geoip.iterator()) {
            this.addLocationMarker(location);
        }
        this.screen.render();
    }

    public run(): void {
        this.app.parse();
    }
}

new HubbleWorldApp().run();
