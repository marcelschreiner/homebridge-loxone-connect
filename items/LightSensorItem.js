const LightSensorItem = function(widget,platform,homebridge) {

    this.platform = platform;
    this.uuidAction = widget.uuidAction;
    this.lightlevel = 0;

    LightSensorItem.super_.call(this, widget, platform, homebridge);
};

// Register a listener to be notified of changes in this items value
LightSensorItem.prototype.initListener = function() {
    this.platform.ws.registerListenerForUUID(this.uuidAction, this.callBack.bind(this));
};

LightSensorItem.prototype.callBack = function(value) {
    //function that gets called by the registered ws listener

    //console.log("Got new state for Light Level: " + value);

    this.lightlevel = value;

    //also make sure this change is directly communicated to HomeKit
    this.otherService
        .getCharacteristic(this.homebridge.hap.Characteristic.CurrentAmbientLightLevel)
        .setValue(this.lightlevel);

    this.updateMatterState();
};

LightSensorItem.prototype.getOtherServices = function() {
    const otherService = new this.homebridge.hap.Service.LightSensor();

    otherService.getCharacteristic(this.homebridge.hap.Characteristic.CurrentAmbientLightLevel)
        .on('get', this.getItemState.bind(this))
        .setValue(this.lightlevel);

    return otherService;
};

LightSensorItem.prototype.getItemState = function(callback) {
   callback(undefined, this.lightlevel);
};

LightSensorItem.prototype.getMatterDeviceType = function(matter) {
    return matter.deviceTypes.LightSensor;
};

LightSensorItem.prototype.getMatterState = function() {
    // Matter uses a logarithmic scale: 10000 * log10(lux) + 1, 0 means too low to be measured
    const lux = parseFloat(this.lightlevel);
    let measuredValue = 0;
    if (lux > 0) {
        measuredValue = Math.min(65534, Math.max(1, Math.round(10000 * Math.log10(lux) + 1)));
    }
    return { illuminanceMeasurement: { measuredValue: measuredValue } };
};

module.exports = LightSensorItem;