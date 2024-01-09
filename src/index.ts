import { Command } from "commander";
import { watch } from "fs";
import { parseGossipAddress } from "./parseLogs";
import { IpGeolocator, type Location } from "./geolocate";
import * as blessed from "blessed";
import * as contrib from "blessed-contrib";

class HubbleWorldApp {
  private readonly app: Command;
  private geoip: IpGeolocator | undefined;
  private screen: blessed.Widgets.Screen;
  private map: contrib.Widgets.MapElement.prototype;

  constructor() {
    this.app = new Command();
    this.configureApp();
    this.setupScreen();
  }

  private configureApp(): void {
    this.app
      .name("hubble-world")
      .description("TUI map of Hubble instances around the world");
    this.app.option("--hub-log-file <path>", "Path to the hub log file");
    this.app.option("--geoip-data-file <path>", "Path to the GeoIP data file");
    this.app.option("--watch", "Watch the hub log file for changes");
    this.app.option("--no-api", "Disable the IP geolocation API");
    this.app.option("--api", "Enable the IP geolocation API");

    this.app.action(this.handleAction.bind(this));
  }

  private async handleAction(): Promise<void> {
    const opts = this.app.opts();
    const hubLogFile: string = (opts.hubLogFile as string) ?? "";
    const geoipDataFile: string = (opts.geoipDataFile as string) ?? "";
    const api = opts.api as boolean;
    const enableWatch = opts.watch as boolean;
    this.geoip = new IpGeolocator(geoipDataFile, api);
    if (this.geoip.hasError()) {
      console.error(
        `Failed to initialize GeoIP: ${this.geoip.getError()?.message}`,
      );
      process.exit(1);
    }

    if (
      hubLogFile === "" &&
      (geoipDataFile === "" || this.geoip.size() === 0)
    ) {
      console.error("No hub log file or GeoIP data specified.");
      return this.app.help();
    } else if (enableWatch && hubLogFile === "") {
      console.error("Cannot watch for changes without a hub log file.");
      return this.app.help();
    } else if (hubLogFile !== "") {
      // cannot map IP addresses to locations without an API key, return early if API is disabled
      if (!api) {
        console.error("API disabled, cannot map IP addresses to locations.");
        return;
      }
      if (enableWatch) {
        console.log(`Watching ${hubLogFile} for changes`);
        watch(hubLogFile, () => {
          setImmediate(async () => {
            try {
              const updatedIPs = parseGossipAddress(hubLogFile);
              await this.geoip?.mergeAndLookupLocations(updatedIPs);
              this.updateMapMarkers();
            } catch (error: any) {
              console.error(`Error processing log file: ${error}`);
            }
          });
        });
      }
      await this.processLogAndDisplayMap(hubLogFile);
    } else {
      await this.processCacheAndDisplayMap();
    }
  }

  private setupScreen(): void {
    this.screen = blessed.screen({ smartCSR: true });
    this.map = contrib.map({ label: "Hub Locations" });
    this.screen.append(this.map);
    this.screen.key(["escape", "q", "C-c"], () => process.exit(0));
  }

  private async processLogAndDisplayMap(logFilePath: string): Promise<void> {
    if (this.geoip === undefined) {
      console.error("Failed to process log, GeoIP not initialized.");
      return;
    }
    const ipAddresses = parseGossipAddress(logFilePath);
    await this.geoip.mergeAndLookupLocations(ipAddresses);

    for (const ip of this.geoip.getIPEntries()) {
      const location = await this.geoip.lookup(ip);
      if (location instanceof Error) {
        console.error(
          `Failed to get location for IP ${ip}: ${location.message}`,
        );
      } else {
        this.addLocationMarker(location);
      }
    }

    this.screen.render();
  }

  private async processCacheAndDisplayMap(): Promise<void> {
    if (this.geoip === undefined) {
      console.error("Failed to process cache, GeoIP not initialized.");
      return;
    }
    for (const ip of this.geoip.getIPEntries()) {
      const location = await this.geoip.lookup(ip);
      if (location instanceof Error) {
        console.error(
          `Failed to get location for IP ${ip}: ${location.message}`,
        );
      } else {
        this.addLocationMarker(location);
      }
    }

    this.screen.render();
  }

  private addLocationMarker(location: Location): void {
    this.map.addMarker({
      lon: location.longitude,
      lat: location.latitude,
      color: "red",
      char: "X",
    });
  }

  private updateMapMarkers(): void {
    if (this.geoip === undefined) {
      console.error("Failed to update map markers, GeoIP not initialized.");
      return;
    }
    this.map.clearMarkers();
    for (const [, location] of this.geoip.iterator()) {
      this.addLocationMarker(location);
    }
    this.screen.render();
  }

  public run(): void {
    this.app.parse();
  }
}

new HubbleWorldApp().run();
