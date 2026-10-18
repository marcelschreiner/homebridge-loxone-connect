// Loxone intelligent room controller (IRoomControllerV2), exposed as heating thermostat.
// The target temperature is set like the Loxone app does: in the automatic modes as offset to the
// comfort temperature, in the manual modes as manual temperature. The operating mode is only shown.
const ACTIVE_MODE_MANUAL = 3;
const ACTIVE_MODE_OFF = 4;
const OPERATING_MODE_OFF = -1;
const MANUAL_OPERATING_MODES = [4, 5]; // manual heating, manual cooling

const MIN_TEMPERATURE = 5;
const MAX_TEMPERATURE = 35;

const IRoomControllerV2Item = function(widget, platform, homebridge) {

    this.platform = platform;
    this.uuidAction = widget.uuidAction;
    this.states = widget.states || {};

    this.tempActual = undefined;
    this.tempTarget = undefined;
    this.comfortTemperature = undefined;
    this.comfortTemperatureOffset = undefined;
    this.activeMode = undefined;
    this.operatingMode = undefined;
    this.openWindow = 0;

    IRoomControllerV2Item.super_.call(this, widget, platform, homebridge);
};

const clampTemperature = value => Math.min(MAX_TEMPERATURE, Math.max(MIN_TEMPERATURE, value));
const round = (value, step) => Math.round(value / step) * step;

// Register a listener to be notified of changes in this items value
IRoomControllerV2Item.prototype.initListener = function() {
    for (const state of ['tempActual', 'tempTarget', 'comfortTemperature', 'comfortTemperatureOffset', 'activeMode', 'operatingMode', 'openWindow']) {
        if (this.states[state]) {
            this.platform.ws.registerListenerForUUID(this.states[state], value => this.callBack(state, value));
        }
    }
};

IRoomControllerV2Item.prototype.callBack = function(state, value) {
    const number = parseFloat(value);
    this[state] = isNaN(number) ? undefined : number;

    const Characteristic = this.homebridge.hap.Characteristic;
    if (this.tempActual !== undefined) {
        this.otherService.getCharacteristic(Characteristic.CurrentTemperature).updateValue(this.tempActual);
    }
    if (this.tempTarget !== undefined) {
        this.otherService.getCharacteristic(Characteristic.TargetTemperature).updateValue(clampTemperature(this.tempTarget));
    }
    this.otherService.getCharacteristic(Characteristic.CurrentHeatingCoolingState).updateValue(this.getCurrentHeatingCoolingState());
    this.otherService.getCharacteristic(Characteristic.TargetHeatingCoolingState).updateValue(this.getTargetHeatingCoolingState());

    this.updateMatterState();
};

IRoomControllerV2Item.prototype.isOff = function() {
    return this.operatingMode === OPERATING_MODE_OFF || this.activeMode === ACTIVE_MODE_OFF;
};

IRoomControllerV2Item.prototype.getTargetHeatingCoolingState = function() {
    const Characteristic = this.homebridge.hap.Characteristic;
    return this.isOff() ? Characteristic.TargetHeatingCoolingState.OFF : Characteristic.TargetHeatingCoolingState.HEAT;
};

IRoomControllerV2Item.prototype.getCurrentHeatingCoolingState = function() {
    const Characteristic = this.homebridge.hap.Characteristic;
    const heating = !this.isOff() && !this.openWindow && this.tempActual !== undefined && this.tempTarget !== undefined
        && this.tempActual < this.tempTarget;
    return heating ? Characteristic.CurrentHeatingCoolingState.HEAT : Characteristic.CurrentHeatingCoolingState.OFF;
};

IRoomControllerV2Item.prototype.getOtherServices = function() {
    const Characteristic = this.homebridge.hap.Characteristic;
    const otherService = new this.homebridge.hap.Service.Thermostat();

    otherService.getCharacteristic(Characteristic.CurrentTemperature)
        .setProps({ minValue: -50, maxValue: 100 })
        .on('get', callback => callback(undefined, this.tempActual === undefined ? 0 : this.tempActual));

    otherService.getCharacteristic(Characteristic.TargetTemperature)
        .setProps({ minValue: MIN_TEMPERATURE, maxValue: MAX_TEMPERATURE, minStep: 0.5 })
        .on('get', callback => callback(undefined, clampTemperature(this.tempTarget === undefined ? 20 : this.tempTarget)))
        .on('set', (value, callback) => {
            this.setTargetTemperature(value);
            callback();
        });

    otherService.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
        .on('get', callback => callback(undefined, this.getCurrentHeatingCoolingState()));

    // the operating mode is controlled by Loxone, changes from HomeKit are reverted
    otherService.getCharacteristic(Characteristic.TargetHeatingCoolingState)
        .setProps({ validValues: [Characteristic.TargetHeatingCoolingState.OFF, Characteristic.TargetHeatingCoolingState.HEAT] })
        .on('get', callback => callback(undefined, this.getTargetHeatingCoolingState()))
        .on('set', (value, callback) => {
            callback();
            if (value !== this.getTargetHeatingCoolingState()) {
                this.log(`[RoomController] - ${this.name}: the operating mode can only be changed in Loxone.`);
                setTimeout(() => otherService.getCharacteristic(Characteristic.TargetHeatingCoolingState)
                    .updateValue(this.getTargetHeatingCoolingState()), 500);
            }
        });

    otherService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
        .updateValue(Characteristic.TemperatureDisplayUnits.CELSIUS);

    return otherService;
};

IRoomControllerV2Item.prototype.setTargetTemperature = function(value) {
    const target = round(clampTemperature(Number(value)), 0.1);
    // Matter reports state updates from Loxone like changes from the controller, they must not be sent back
    if (this.tempTarget !== undefined && Math.abs(target - this.tempTarget) < 0.05) {
        return;
    }

    let command;
    if (this.activeMode === ACTIVE_MODE_MANUAL || MANUAL_OPERATING_MODES.includes(this.operatingMode)) {
        command = `setManualTemperature/${target}`;
    } else if (this.comfortTemperatureOffset !== undefined && this.tempTarget !== undefined) {
        // the offset is changed by the requested difference, so it moves the target the right way in every mode (comfort, eco, ...)
        const offset = round(this.comfortTemperatureOffset + target - this.tempTarget, 0.1);
        command = `setComfortModeTemp/${Number(offset.toFixed(1))}`;
    } else if (this.comfortTemperature !== undefined) {
        const offset = round(target - this.comfortTemperature, 0.1);
        command = `setComfortModeTemp/${Number(offset.toFixed(1))}`;
    } else {
        this.log(`[RoomController] - ${this.name}: comfort temperature unknown, can't set the target temperature.`);
        return;
    }

    this.log(`[RoomController] - send message to ${this.name}: ${command}`);
    this.platform.ws.sendCommand(this.uuidAction, command);
    // Loxone confirms the new target, until then the requested one is shown
    this.tempTarget = target;
};

//* Matter *//

IRoomControllerV2Item.prototype.getMatterDeviceType = function(matter) {
    return matter.deviceTypes.Thermostat;
};

IRoomControllerV2Item.prototype.getMatterStaticClusters = function() {
    return {
        thermostat: {
            controlSequenceOfOperation: 2, // heating only
            absMinHeatSetpointLimit: MIN_TEMPERATURE * 100,
            absMaxHeatSetpointLimit: MAX_TEMPERATURE * 100,
            minHeatSetpointLimit: MIN_TEMPERATURE * 100,
            maxHeatSetpointLimit: MAX_TEMPERATURE * 100
        }
    };
};

IRoomControllerV2Item.prototype.getMatterState = function() {
    return {
        thermostat: {
            // hundredths of °C, null means unknown
            localTemperature: this.tempActual === undefined ? null : Math.round(this.tempActual * 100),
            occupiedHeatingSetpoint: Math.round(clampTemperature(this.tempTarget === undefined ? 20 : this.tempTarget) * 100),
            systemMode: this.isOff() ? 0 : 4 // Off : Heat
        }
    };
};

IRoomControllerV2Item.prototype.getMatterHandlers = function() {
    return {
        thermostat: {
            occupiedHeatingSetpointChange: (request) => this.setTargetTemperature(request.occupiedHeatingSetpoint / 100),
            setpointRaiseLower: (request) => {
                if (this.tempTarget !== undefined) {
                    this.setTargetTemperature(this.tempTarget + request.amount / 10);
                }
            },
            // the operating mode is controlled by Loxone, the resync after the handler reverts the change
            systemModeChange: (request) => {
                if (request.systemMode !== (this.isOff() ? 0 : 4)) {
                    this.log(`[RoomController] - ${this.name}: the operating mode can only be changed in Loxone.`);
                }
            }
        }
    };
};

module.exports = IRoomControllerV2Item;
