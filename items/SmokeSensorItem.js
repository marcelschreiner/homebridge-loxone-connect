const SmokeSensor = function(widget,platform,homebridge) {

    this.platform = platform;
    this.uuidAction = widget.uuidAction;

    SmokeSensor.super_.call(this, widget,platform,homebridge);
};

// Register a listener to be notified of changes in this items value
SmokeSensor.prototype.initListener = function() {
    this.platform.ws.registerListenerForUUID(this.uuidAction, this.callBack.bind(this));
};
    
SmokeSensor.prototype.callBack = function(value) {
    //console.log(`Got new state for SmokeSensor: ${value}`);
    this.smokeDetected = value;
    this.otherService.getCharacteristic(this.homebridge.hap.Characteristic.SmokeDetected).updateValue(value);
    this.updateMatterState();
};

SmokeSensor.prototype.getOtherServices = function() {

    const otherService = new this.homebridge.hap.Service.SmokeSensor();

    return otherService;
};

SmokeSensor.prototype.getMatterDeviceType = function(matter) {
    return matter.deviceTypes.SmokeSensor;
};

SmokeSensor.prototype.getMatterState = function() {
    const smoke = this.smokeDetected == 1;
    return {
        smokeCoAlarm: {
            smokeState: smoke ? 2 : 0, // Critical : Normal
            expressedState: smoke ? 1 : 0 // SmokeAlarm : Normal
        }
    };
};

module.exports = SmokeSensor;