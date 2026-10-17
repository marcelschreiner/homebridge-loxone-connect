const TemperatureSensorItem = function(widget,platform,homebridge) {

    this.platform = platform;
    this.uuidAction = widget.uuidAction;
    this.currentTemperature = undefined;

    TemperatureSensorItem.super_.call(this, widget,platform,homebridge);
};

// Register a listener to be notified of changes in this items value
TemperatureSensorItem.prototype.initListener = function() {
    this.platform.ws.registerListenerForUUID(this.uuidAction, this.callBack.bind(this));
};

TemperatureSensorItem.prototype.callBack = function(value) {
    //function that gets called by the registered ws listener
    this.currentTemperature = value;

    //also make sure this change is directly communicated to HomeKit
    this.otherService
        .getCharacteristic(this.homebridge.hap.Characteristic.CurrentTemperature)
        .setValue(this.currentTemperature);

    this.updateMatterState();
};

TemperatureSensorItem.prototype.getOtherServices = function() {
    const otherService = new this.homebridge.hap.Service.TemperatureSensor();

    otherService.getCharacteristic(this.homebridge.hap.Characteristic.CurrentTemperature)
        .on('get', this.getItemState.bind(this))
        .setValue(this.currentTemperature);

    return otherService;
};

TemperatureSensorItem.prototype.getItemState = function(callback) {
   callback(undefined, this.currentTemperature);
};

TemperatureSensorItem.prototype.getMatterDeviceType = function(matter) {
    return matter.deviceTypes.TemperatureSensor;
};

TemperatureSensorItem.prototype.getMatterState = function() {
    // hundredths of °C, null means unknown
    const value = parseFloat(this.currentTemperature);
    return { temperatureMeasurement: { measuredValue: isNaN(value) ? null : Math.round(value * 100) } };
};

module.exports = TemperatureSensorItem;