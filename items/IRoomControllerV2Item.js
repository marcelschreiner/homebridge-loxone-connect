// Loxone intelligent room controller (IRoomControllerV2), exposed as heating thermostat.
// The target temperature can be changed in the comfort mode (as offset to the comfort temperature, like the
// +/- in the Loxone app) and in the manual modes (as manual temperature). In the other modes (eco, building
// protection, ...) the offset doesn't change the current target, so changes are reverted there.
// The operating mode is only shown.
const ACTIVE_MODE_COMFORT = 1;
const ACTIVE_MODE_MANUAL = 3;
const ACTIVE_MODE_OFF = 4;
const OPERATING_MODE_OFF = -1;
const MANUAL_OPERATING_MODES = [4, 5]; // manual heating, manual cooling

const MIN_TEMPERATURE = 5;
const MAX_TEMPERATURE = 35;
const MAX_COMFORT_OFFSET = 5;

// Apple Home sends every step while the slider is moved, only the final value is sent to Loxone
const SEND_DELAY = 1000;
// a requested target is shown until Loxone confirms it, or for this time at most
const CONFIRM_TIMEOUT = 8000;
const DIAGNOSTIC_TIME = 30000;

const IRoomControllerV2Item = function(widget, platform, homebridge) {

    this.platform = platform;
    this.uuidAction = widget.uuidAction;
    this.states = widget.states || {};

    this.tempActual = undefined;
    this.tempTarget = undefined;
    this.comfortTemperature = undefined;
    this.activeMode = undefined;
    this.operatingMode = undefined;
    this.openWindow = 0;

    IRoomControllerV2Item.super_.call(this, widget, platform, homebridge);
};

const clampTemperature = value => Math.min(MAX_TEMPERATURE, Math.max(MIN_TEMPERATURE, value));
const round = (value, step) => Math.round(value / step) * step;

// Register a listener to be notified of changes in this items value
IRoomControllerV2Item.prototype.initListener = function() {
    for (const state of ['tempActual', 'tempTarget', 'comfortTemperature', 'activeMode', 'operatingMode', 'openWindow']) {
        if (this.states[state]) {
            this.platform.ws.registerListenerForUUID(this.states[state], value => this.callBack(state, value));
        }
    }

    // log what Loxone reports shortly after a command, to see how it reacts to it
    for (const state of ['tempTarget', 'comfortTemperature', 'comfortTemperatureOffset', 'activeMode', 'operatingMode', 'overrideReason', 'overrideEntries']) {
        if (this.states[state]) {
            this.platform.ws.registerListenerForUUID(this.states[state], value => {
                if (this.lastCommandTime && Date.now() - this.lastCommandTime < DIAGNOSTIC_TIME) {
                    this.log(`[RoomController] - ${this.name}: Loxone reports ${state} = ${String(value).slice(0, 200)} (${Date.now() - this.lastCommandTime} ms after the command)`);
                }
            });
        }
    }
};

IRoomControllerV2Item.prototype.callBack = function(state, value) {
    const number = parseFloat(value);
    this[state] = isNaN(number) ? undefined : number;

    if (state === 'tempTarget' && this.sentTarget !== undefined && this.tempTarget !== undefined
        && Math.abs(this.tempTarget - this.sentTarget) < 0.05) {
        this.log(`[RoomController] - ${this.name}: Loxone confirmed the target temperature ${this.tempTarget}°C.`);
        this.clearPendingTarget();
    }

    this.refreshState();
};

// the target shown in HomeKit and Matter: the requested one while it is pending, otherwise the one of Loxone
IRoomControllerV2Item.prototype.getDisplayedTarget = function() {
    return this.pendingTarget !== undefined ? this.pendingTarget : this.tempTarget;
};

IRoomControllerV2Item.prototype.clearPendingTarget = function() {
    clearTimeout(this.sendTimer);
    clearTimeout(this.confirmTimer);
    this.pendingTarget = undefined;
    this.sentTarget = undefined;
};

// show the current Loxone state in HomeKit and Matter, also used to revert changes Loxone didn't accept
IRoomControllerV2Item.prototype.refreshState = function(force) {
    const Characteristic = this.homebridge.hap.Characteristic;
    if (this.tempActual !== undefined) {
        this.otherService.getCharacteristic(Characteristic.CurrentTemperature).updateValue(this.tempActual);
    }
    if (this.getDisplayedTarget() !== undefined) {
        this.otherService.getCharacteristic(Characteristic.TargetTemperature).updateValue(clampTemperature(this.getDisplayedTarget()));
    }
    this.otherService.getCharacteristic(Characteristic.CurrentHeatingCoolingState).updateValue(this.getCurrentHeatingCoolingState());
    this.otherService.getCharacteristic(Characteristic.TargetHeatingCoolingState).updateValue(this.getTargetHeatingCoolingState());

    this.updateMatterState(force);
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
        .on('get', callback => callback(undefined, clampTemperature(this.getDisplayedTarget() === undefined ? 20 : this.getDisplayedTarget())))
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

    // Matter reports the state pushed by the plugin like a change from the controller, that echo is ignored
    const displayed = this.getDisplayedTarget();
    if (displayed !== undefined && Math.abs(target - displayed) < 0.05) {
        return;
    }

    this.pendingTarget = target;
    this.sentTarget = undefined;
    clearTimeout(this.confirmTimer);
    clearTimeout(this.sendTimer);
    this.sendTimer = setTimeout(() => this.sendTargetTemperature(target), SEND_DELAY);
};

IRoomControllerV2Item.prototype.sendTargetTemperature = function(target) {
    let command;
    let expected = target;
    if (this.activeMode === ACTIVE_MODE_MANUAL || MANUAL_OPERATING_MODES.includes(this.operatingMode)) {
        command = `setManualTemperature/${Number(target.toFixed(1))}`;
    } else if (this.activeMode === ACTIVE_MODE_COMFORT && this.comfortTemperature !== undefined) {
        let offset = round(target - this.comfortTemperature, 0.1);
        if (Math.abs(offset) > MAX_COMFORT_OFFSET) {
            offset = Math.sign(offset) * MAX_COMFORT_OFFSET;
            this.log(`[RoomController] - ${this.name}: the target can only be changed by ${MAX_COMFORT_OFFSET}°C from the comfort temperature.`);
        }
        offset = Number(offset.toFixed(1));
        expected = round(this.comfortTemperature + offset, 0.1);
        command = `setComfortModeTemp/${offset}`;
    } else {
        this.log(`[RoomController] - ${this.name}: the target temperature can only be changed in the comfort mode or the manual mode (active mode ${this.activeMode}).`);
        this.clearPendingTarget();
        this.refreshState(true);
        return;
    }

    this.log(`[RoomController] - send message to ${this.name}: ${command} (target ${this.tempTarget}°C -> ${expected}°C, comfort ${this.comfortTemperature}°C, active mode ${this.activeMode})`);
    this.platform.ws.sendCommand(this.uuidAction, command);
    this.lastCommandTime = Date.now();
    if (this.tempTarget !== undefined && Math.abs(this.tempTarget - expected) < 0.05) {
        // nothing changes in Loxone, so there is nothing to confirm
        this.clearPendingTarget();
        this.refreshState(true);
        return;
    }
    this.pendingTarget = expected;
    this.sentTarget = expected;

    // if Loxone doesn't confirm the target, its own target is shown again
    this.confirmTimer = setTimeout(() => {
        this.log(`[RoomController] - ${this.name}: Loxone didn't confirm the target temperature ${expected}°C, the target is still ${this.tempTarget}°C.`);
        this.clearPendingTarget();
        this.refreshState(true);
    }, CONFIRM_TIMEOUT);
    this.refreshState(true);
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
            occupiedHeatingSetpoint: Math.round(clampTemperature(this.getDisplayedTarget() === undefined ? 20 : this.getDisplayedTarget()) * 100),
            systemMode: this.isOff() ? 0 : 4 // Off : Heat
        }
    };
};

IRoomControllerV2Item.prototype.getMatterHandlers = function() {
    return {
        thermostat: {
            occupiedHeatingSetpointChange: (request) => this.setTargetTemperature(request.occupiedHeatingSetpoint / 100),
            setpointRaiseLower: (request) => {
                if (this.getDisplayedTarget() !== undefined) {
                    this.setTargetTemperature(this.getDisplayedTarget() + request.amount / 10);
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
