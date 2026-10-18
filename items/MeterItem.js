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

    // producers (e.g. photovoltaics) count the produced energy as positive, but Matter treats
    // positive power as consumption, so their power and energy are reported in the other direction
    const productionAlias = (platform.alias && platform.alias['Production']) || 'PV';
    this.isProduction = String(widget.name).includes(productionAlias);

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

    // Matter: positive = consumed, negative = produced / fed in
    const direction = this.isProduction ? -1 : 1;
    const state = {
        electricalPowerMeasurement: {
            activePower: this.actual === undefined ? null : Math.round(direction * this.actual * this.actualFactor) || 0
        }
    };

    // total counts the main direction of the meter, totalNeg the other one
    const imported = this.isProduction ? this.totalNegUuid : this.totalUuid;
    const exported = this.isProduction ? this.totalUuid : this.totalNegUuid;
    if (imported || exported) {
        state.electricalEnergyMeasurement = {};
        if (imported) {
            state.electricalEnergyMeasurement.cumulativeEnergyImported = energy(this.isProduction ? this.totalNeg : this.total);
        }
        if (exported) {
            state.electricalEnergyMeasurement.cumulativeEnergyExported = energy(this.isProduction ? this.total : this.totalNeg);
        }
    }

    return state;
};

module.exports = MeterItem;
