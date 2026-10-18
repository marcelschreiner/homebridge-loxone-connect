const AbstractItem = function(widget,platform,homebridge) {
    this.platform = platform;
    this.widget =  widget;
    this.homebridge = homebridge;
    this.log = this.platform.log;
    this.name = widget.name;
    this.roomname = widget.roomname;
    this.UUID = homebridge.hap.uuid.generate(String(widget.uuidAction));

    // provide explicit UUID to prevent automatic UUID generation by homebridge (which would fail because of possibly equal item name)
    this.uuid_base = this.UUID;

    // set by the platform once the item has been registered as Matter accessory
    this.matter = undefined;
    this.matterRegistered = false;
};

AbstractItem.prototype.getServices = function() {
    this.informationService = this.getInformationServices();
    this.otherService = this.getOtherServices();
    this.initListener();
    return [this.informationService, this.otherService];
};

AbstractItem.prototype.getOtherServices = () => {
    return null;
};

// items without a HomeKit service (e.g. power meters) are only exposed via Matter
AbstractItem.prototype.hasHapService = function() {
    return !!this.otherService;
};

AbstractItem.prototype.getInformationServices = function() {
    const informationService = new this.homebridge.hap.Service.AccessoryInformation();

    informationService
        .setCharacteristic(this.homebridge.hap.Characteristic.Manufacturer, 'Loxone')
        .setCharacteristic(this.homebridge.hap.Characteristic.Model, "Room: " + this.roomname)
        .setCharacteristic(this.homebridge.hap.Characteristic.SerialNumber, this.widget.uuidAction)
        .setCharacteristic(this.homebridge.hap.Characteristic.Name, this.name);
    return informationService;
};

//* Matter *//
// Items that can be exposed via Matter override getMatterDeviceType, getMatterState and (optionally)
// getMatterHandlers / getMatterStaticClusters. Items returning no device type stay HAP only.

AbstractItem.prototype.getMatterDeviceType = () => {
    return null;
};

// current state of the item as Matter cluster attributes, e.g. { onOff: { onOff: true } }
AbstractItem.prototype.getMatterState = () => {
    return {};
};

// attributes that never change at runtime (ranges, types, ...), only used for the initial registration
AbstractItem.prototype.getMatterStaticClusters = () => {
    return {};
};

AbstractItem.prototype.getMatterHandlers = () => {
    return undefined;
};

AbstractItem.prototype.getMatterAccessory = function(matter) {
    const deviceType = this.getMatterDeviceType(matter);
    if (!deviceType) {
        return null;
    }

    const clusters = this.getMatterStaticClusters(matter);
    const state = this.getMatterState(matter);
    for (const cluster in state) {
        clusters[cluster] = Object.assign({}, clusters[cluster], state[cluster]);
    }

    // Matter limits labels and serial numbers to 32 characters
    return {
        UUID: this.UUID,
        displayName: String(this.name).slice(0, 32),
        deviceType: deviceType,
        serialNumber: this.UUID.replace(/-/g, '').slice(0, 32),
        manufacturer: 'Loxone',
        model: `Room: ${this.roomname}`.slice(0, 32),
        context: {
            uuidAction: this.widget.uuidAction
        },
        clusters: clusters,
        handlers: this.wrapMatterHandlers(this.getMatterHandlers(matter))
    };
};

// Handlers get logged on failure and trigger a state resync afterwards, because the state Homebridge
// assumes after a command is not always the state Loxone ends up in (e.g. a radio switch that can't be switched off)
AbstractItem.prototype.wrapMatterHandlers = function(handlers) {
    if (!handlers) {
        return undefined;
    }

    // some controllers (e.g. Google Home, Alexa) send toggle instead of on/off
    const onOff = handlers.onOff;
    if (onOff && onOff.on && onOff.off && !onOff.toggle) {
        onOff.toggle = (args, context) => {
            const state = this.getMatterState(this.matter).onOff;
            return state && state.onOff ? onOff.off(args, context) : onOff.on(args, context);
        };
    }

    const wrapped = {};
    for (const cluster in handlers) {
        wrapped[cluster] = {};
        for (const command in handlers[cluster]) {
            const handler = handlers[cluster][command];
            wrapped[cluster][command] = async (args, context) => {
                try {
                    await handler(args || {}, context);
                } catch (error) {
                    this.log.error(`[Matter] - ${this.name}: ${cluster}.${command} failed: ${error}`);
                    throw error;
                }
                clearTimeout(this.matterResyncTimer);
                this.matterResyncTimer = setTimeout(() => this.updateMatterState(true), 1500);
            };
        }
    }
    return wrapped;
};

// push the current item state to Matter, call this whenever the state changed
// clusters that didn't change since the last push are skipped, unless force is set
// (needed after a command, because Matter may already assume a state Loxone never reached)
AbstractItem.prototype.updateMatterState = function(force) {
    if (!this.matter || !this.matterRegistered) {
        return;
    }

    if (!this.matterLastState) {
        this.matterLastState = {};
    }

    const state = this.getMatterState(this.matter);
    for (const cluster in state) {
        const serialized = JSON.stringify(state[cluster]);
        if (!force && this.matterLastState[cluster] === serialized) {
            continue;
        }
        this.matterLastState[cluster] = serialized;
        this.matter.updateAccessoryState(this.UUID, cluster, state[cluster])
            .catch(error => {
                // try again with the next update
                delete this.matterLastState[cluster];
                this.log.debug(`[Matter] - ${this.name}: could not update ${cluster}: ${error}`);
            });
    }
};

// stateless buttons (GenericSwitch) fire events instead of keeping a state
AbstractItem.prototype.emitMatterPress = function() {
    if (!this.matter || !this.matterRegistered) {
        return;
    }

    this.matter.switch.emitGesture(this.UUID, 'singlePress')
        .catch(error => this.log.debug(`[Matter] - ${this.name}: could not send button press: ${error}`));
};

module.exports = AbstractItem;
