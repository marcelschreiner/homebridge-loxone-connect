// Loxone energy meter (Meter block), exposed as Matter electrical sensor with power and energy measurement.
// HomeKit (HAP) has no power meter service, so this item is only available via Matter.
const MeterItem = function(widget, platform, homebridge) {

    this.platform = platform;
    this.uuidAction = widget.uuidAction;

    const states = widget.states || {};
    const details = widget.details || {};
    this.actualUuid = states.actual;
    this.totalUuid = states.total;
    // bidirectional meters (and storages) also count the energy in the other direction, e.g. feed-in to the grid
    this.totalNegUuid = states.totalNeg;

    // Loxone reports the values in the unit of the format, usually kW and kWh
    this.actualFactor = unitFactor(details.actualFormat, 1000000); // to mW
    this.totalFactor = unitFactor(details.totalFormat, 1000000); // to mWh

    this.actual = undefined;
    this.total = undefined;
    this.totalNeg = undefined;

    MeterItem.super_.call(this, widget, platform, homebridge);
};

// returns the factor to convert the value to milli units (mW / mWh), defaultFactor if the format has no known unit
function unitFactor(format, defaultFactor) {
    const unit = /%[^a-zA-Z%]*[a-zA-Z]\s*(\S*)/.exec(String(format || ''));
    switch (unit && unit[1]) {
        case 'W':
        case 'Wh':
            return 1000;
        case 'kW':
        case 'kWh':
            return 1000000;
        case 'MW':
        case 'MWh':
            return 1000000000;
        default:
            return defaultFactor;
    }
}

// only meters measuring power make sense, a Meter block can also count water, gas, ...
MeterItem.isElectrical = function(widget) {
    const details = widget.details || {};
    return [details.actualFormat, details.totalFormat]
        .filter(format => !!format)
        .every(format => unitFactor(format, 0) > 0);
};

MeterItem.prototype.initListener = function() {
    if (this.actualUuid) {
        this.platform.ws.registerListenerForUUID(this.actualUuid, value => this.callBack('actual', value));
    }
    if (this.totalUuid) {
        this.platform.ws.registerListenerForUUID(this.totalUuid, value => this.callBack('total', value));
    }
    if (this.totalNegUuid) {
        this.platform.ws.registerListenerForUUID(this.totalNegUuid, value => this.callBack('totalNeg', value));
    }
};

MeterItem.prototype.callBack = function(state, value) {
    const number = parseFloat(value);
    this[state] = isNaN(number) ? undefined : number;
    this.updateMatterState();
};

MeterItem.prototype.getMatterDeviceType = function(matter) {
    return matter.deviceTypes.ElectricalSensor;
};

MeterItem.prototype.getMatterState = function() {
    // energy readings can't go back in time, Matter requires them to be positive
    const energy = (value) => value === undefined ? null : { energy: Math.max(0, Math.round(value * this.totalFactor)) };

    const state = {
        // positive = consumed from the grid, negative = fed in (same sign as Loxone)
        electricalPowerMeasurement: {
            activePower: this.actual === undefined ? null : Math.round(this.actual * this.actualFactor)
        }
    };

    if (this.totalUuid || this.totalNegUuid) {
        state.electricalEnergyMeasurement = {};
        if (this.totalUuid) {
            state.electricalEnergyMeasurement.cumulativeEnergyImported = energy(this.total);
        }
        if (this.totalNegUuid) {
            state.electricalEnergyMeasurement.cumulativeEnergyExported = energy(this.totalNeg);
        }
    }

    return state;
};

module.exports = MeterItem;
