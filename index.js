const ItemFactory = require('./libs/ItemFactory.js');
const Utility = require('./libs/Utility.js');
const WSListener = require('./libs/WSListener.js');

const PLUGIN_NAME = 'homebridge-loxone-connect';
const PLATFORM_NAME = 'LoxoneWs';

// a HomeKit bridge supports up to 150 accessories, Matter (Homebridge) up to 1000
const HAP_ACCESSORY_LIMIT = 100;

module.exports = homebridge => {
    console.log(`homebridge API version: ${homebridge.version}`);

    //All items are child of the abstractItem
    Utility.addSupportTo(ItemFactory.LightControllerV2MoodSwitch, ItemFactory.AbstractItem);
    Utility.addSupportTo(ItemFactory.Trigger, ItemFactory.AbstractItem);
    Utility.addSupportTo(ItemFactory.TemperatureSensor, ItemFactory.AbstractItem);
    Utility.addSupportTo(ItemFactory.HumiditySensor, ItemFactory.AbstractItem);
    Utility.addSupportTo(ItemFactory.MotionSensor, ItemFactory.AbstractItem);
    Utility.addSupportTo(ItemFactory.ContactSensor, ItemFactory.AbstractItem);
    Utility.addSupportTo(ItemFactory.LightSensor, ItemFactory.AbstractItem);
    Utility.addSupportTo(ItemFactory.LeakSensor, ItemFactory.AbstractItem);
    Utility.addSupportTo(ItemFactory.Dimmer, ItemFactory.AbstractItem);
    Utility.addSupportTo(ItemFactory.Colorpicker, ItemFactory.AbstractItem);
    Utility.addSupportTo(ItemFactory.Gate, ItemFactory.AbstractItem);
    Utility.addSupportTo(ItemFactory.Doorbell, ItemFactory.AbstractItem);
    Utility.addSupportTo(ItemFactory.Blinds, ItemFactory.AbstractItem);
    Utility.addSupportTo(ItemFactory.Shutters, ItemFactory.AbstractItem);
    Utility.addSupportTo(ItemFactory.TimedSwitch, ItemFactory.AbstractItem);
    Utility.addSupportTo(ItemFactory.Switch, ItemFactory.AbstractItem);
    Utility.addSupportTo(ItemFactory.SmokeSensor, ItemFactory.AbstractItem);
    Utility.addSupportTo(ItemFactory.Alarm, ItemFactory.AbstractItem);
    Utility.addSupportTo(ItemFactory.RadioSwitchItem, ItemFactory.AbstractItem);
    Utility.addSupportTo(ItemFactory.Lock, ItemFactory.AbstractItem);
    Utility.addSupportTo(ItemFactory.Valve, ItemFactory.AbstractItem);
    Utility.addSupportTo(ItemFactory.Meter, ItemFactory.AbstractItem);

    //Add childs of switch
    Utility.addSupportTo(ItemFactory.Lightbulb, ItemFactory.Switch);
    Utility.addSupportTo(ItemFactory.Outlet, ItemFactory.Switch);
    Utility.addSupportTo(ItemFactory.Pushbutton, ItemFactory.Switch);
    Utility.addSupportTo(ItemFactory.Fan, ItemFactory.Switch);

    //Add childs of motion sensor
    Utility.addSupportTo(ItemFactory.PresenceDetector, ItemFactory.MotionSensor);

    //Add childs of shower
    Utility.addSupportTo(ItemFactory.Sprinkler, ItemFactory.Valve);

    homebridge.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, LoxPlatform);
};

// Platform constructor
function LoxPlatform(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.protocol = "http";

    // accessories restored from the Homebridge cache, by UUID
    this.cachedAccessories = new Map();
    this.cachedMatterAccessories = new Map();

    if (!this.config['host']) throw new Error("Configuration missing: loxone host (please provide the IP address here)");
    if (!this.config['username']) throw new Error("Configuration missing: loxone username");
    if (!this.config['password']) throw new Error("Configuration missing: loxone password");

    if (!this.config['port']) this.config['port'] = 80;
    this.host = config["host"];
    this.port = config["port"];
    this.username = config["username"];
    this.password = config["password"];

    //* Options *//
    if (!config['options']) {
        config['options'] = "";
    }
    const options = config['options'];

    this.rooms = [];
    if (options['rooms']) {
        this.rooms = options["rooms"];
    }

    this.moodSwitches = 'none';
    if (options['moodSwitches']) {
        this.moodSwitches = options["moodSwitches"];
    }

    this.radioSwitches = 1;
    if (options['radioSwitches'] !== undefined) {
        this.radioSwitches = options["radioSwitches"];
    }

    this.timedswitch_method = "pulse";
    if (options['stairwellSwitch'] == "on") {
        this.timedswitch_method = "on";
    }

    this.alarmsystem_method = "delayedon";
    if (options['alarmSystem'] == "on") {
        this.alarmsystem_method = "on";
    }

    this.alarmsystem_trigger = 5;
    if (options['alarmTrigerLevel']) {
        if (options['alarmTrigerLevel'] > 0 && options['alarmTrigerLevel'] < 7) {
            this.alarmsystem_trigger = options['alarmTrigerLevel'];
        } else {
            this.log("Info: alarmTrigerLevel must be an integer between 1 and 6");
        }
    }

    this.autoLock = 1;
    if (options['autoLock']) {
        this.autoLock = options['autoLock'];
    }

    this.autoLockDelay = 5;
    if (options['autoLockDelay']) {
        this.autoLockDelay = options['autoLockDelay'];
    }

    // expose accessories via HomeKit (HAP), default: on
    this.exposeHap = options['hap'] !== false;

    // expose accessories via Matter (Homebridge 2 and Matter enabled on the bridge), default: on
    this.exposeMatter = options['matter'] !== false;

    //* Alias *//
    this.alias = config['alias'];

    this.api.on('didFinishLaunching', () => {
        this.start().catch(error => this.log.error(`Platform - Startup failed: ${error && error.stack || error}`));
    });
}

// Called by Homebridge for every HAP accessory restored from the cache
LoxPlatform.prototype.configureAccessory = function (accessory) {
    this.cachedAccessories.set(accessory.UUID, accessory);
};

// Called by Homebridge 2 for every Matter accessory restored from the cache
LoxPlatform.prototype.configureMatterAccessory = function (accessory) {
    this.cachedMatterAccessories.set(accessory.UUID, accessory);
};

LoxPlatform.prototype.start = async function () {
    this.ws = new WSListener(this);

    while (!this.ws.loxdata) // Wait for json data
        await new Promise(resolve => setTimeout(resolve, 1000));

    const itemFactory = new ItemFactory.Factory(this, this.api);
    const items = itemFactory.parseSitemap(this.ws.loxdata);

    // getServices also starts listening for Loxone updates, so it is needed even if HAP is disabled
    const itemServices = new Map();
    for (const item of items) {
        itemServices.set(item, (item.getServices() || []).filter(service => !!service));
    }

    this.publishHapAccessories(items, itemServices);
    await this.publishMatterAccessories(items);
};

LoxPlatform.prototype.publishHapAccessories = function (items, itemServices) {
    const hap = this.api.hap;
    const current = new Map();

    if (this.exposeHap) {
        for (const item of items) {
            if (!item.hasHapService()) {
                this.log(`Platform - '${item.name}' is not supported via HomeKit (Matter only).`);
                continue;
            }

            // same UUID as the former static platform used, so HomeKit keeps rooms, scenes and automations
            const uuid = hap.uuid.generate(`${this.config.platform}:${item.uuid_base}`);
            if (current.has(uuid)) {
                continue;
            }

            if (current.size >= HAP_ACCESSORY_LIMIT) {
                this.log(`Platform - Accessory count limit (${HAP_ACCESSORY_LIMIT}) exceeded so skipping: '${item.name}' is not published via HomeKit.`);
                continue;
            }

            let accessory = this.cachedAccessories.get(uuid);
            const isNew = !accessory;
            if (isNew) {
                accessory = new this.api.platformAccessory(item.name, uuid);
            }
            this.attachServices(accessory, itemServices.get(item));
            current.set(uuid, { accessory, isNew });
        }
    } else {
        this.log('Platform - HomeKit (HAP) is disabled in the options, no HAP accessories are published.');
    }

    const added = [];
    const updated = [];
    for (const { accessory, isNew } of current.values()) {
        (isNew ? added : updated).push(accessory);
    }

    const stale = [...this.cachedAccessories.values()].filter(accessory => !current.has(accessory.UUID));

    if (stale.length > 0) {
        this.log(`Platform - Removing ${stale.length} HAP accessories that no longer exist.`);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
    }
    if (updated.length > 0) {
        this.api.updatePlatformAccessories(updated);
    }
    if (added.length > 0) {
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, added);
    }

    this.log(`Platform - ${current.size} HAP accessories published.`);
};

// Replace the services of a (cached) accessory by the freshly created services of the item
LoxPlatform.prototype.attachServices = function (accessory, services) {
    const hap = this.api.hap;
    const infoUUID = hap.Service.AccessoryInformation.UUID;

    accessory.services
        .filter(service => service.UUID !== infoUUID)
        .forEach(service => accessory.removeService(service));

    const informationService = accessory.getService(hap.Service.AccessoryInformation);
    for (const service of services) {
        if (service.UUID === infoUUID) {
            for (const characteristic of [hap.Characteristic.Manufacturer, hap.Characteristic.Model, hap.Characteristic.SerialNumber]) {
                informationService.setCharacteristic(characteristic, service.getCharacteristic(characteristic).value);
            }
        } else {
            accessory.addService(service);
        }
    }
};

LoxPlatform.prototype.publishMatterAccessories = async function (items) {
    const matter = this.api.matter;
    const matterEnabled = typeof this.api.isMatterEnabled === 'function' && this.api.isMatterEnabled() && !!matter;

    if (!matterEnabled) {
        if (this.exposeMatter && typeof this.api.isMatterAvailable === 'function' && this.api.isMatterAvailable()) {
            this.log('Platform - Matter is not enabled for this bridge, enable it in the bridge settings to expose your Loxone items via Matter.');
        }
        return;
    }

    const registrations = new Map();
    if (this.exposeMatter) {
        for (const item of items) {
            const accessory = item.getMatterAccessory(matter);
            if (!accessory) {
                this.log(`Platform - '${item.name}' is not supported via Matter (HAP only).`);
                continue;
            }
            if (!registrations.has(accessory.UUID)) {
                registrations.set(accessory.UUID, { item, accessory });
            }
        }
    } else {
        this.log('Platform - Matter is disabled in the options, no Matter accessories are published.');
    }

    const stale = [...this.cachedMatterAccessories.values()].filter(accessory => !registrations.has(accessory.UUID));
    if (stale.length > 0) {
        this.log(`Platform - Removing ${stale.length} Matter accessories that no longer exist.`);
        try {
            await matter.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
        } catch (error) {
            this.log.error(`Platform - Could not remove Matter accessories: ${error}`);
        }
    }

    if (registrations.size === 0) {
        return;
    }

    // cached accessories are registered again as well, this attaches the handlers to them
    // one by one, so a single accessory that Matter refuses doesn't take down the others
    let registered = 0;
    for (const { item, accessory } of registrations.values()) {
        try {
            await this.registerMatterAccessory(matter, accessory);
        } catch (error) {
            this.log.error(`Platform - Could not register Matter accessory '${item.name}': ${error}`);
            continue;
        }
        item.matter = matter;
        item.matterRegistered = true;
        registered++;
    }

    // registration finishes in the background, push the current Loxone state once it is done
    setTimeout(() => {
        for (const { item } of registrations.values()) {
            item.updateMatterState(true);
        }
    }, 3000);

    this.log(`Platform - ${registered} Matter accessories published.`);
};

// The Matter server of the bridge may still be starting when Loxone is already connected, retry for a while
LoxPlatform.prototype.registerMatterAccessory = async function (matter, accessory) {
    for (let attempt = 1; ; attempt++) {
        try {
            return await matter.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        } catch (error) {
            if (attempt >= 30 || !/still starting/i.test(String(error && error.message))) {
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
};
