const FanItem = function(widget,platform,homebridge) {
    FanItem.super_.call(this, widget,platform,homebridge);
};

FanItem.prototype.getOtherServices = function() {
    const otherService = new this.homebridge.hap.Service.Fan();

    this.item = 'Fan';

    otherService.getCharacteristic(this.homebridge.hap.Characteristic.On)
        .on('set', this.setItemState.bind(this))
        .on('get', this.getItemState.bind(this))
        .updateValue(this.currentState == '1');

    return otherService;
};

//Loxone only knows on/off for a fan, so Matter gets a fan with the modes off/high (0% or 100%)
FanItem.prototype.getMatterDeviceType = function(matter) {
    return matter.deviceTypes.Fan;
};

FanItem.prototype.getMatterStaticClusters = function() {
    return { fanControl: { fanModeSequence: 5 } }; // Off/High
};

FanItem.prototype.getMatterState = function() {
    const isOn = this.currentState == '1';
    return {
        fanControl: {
            fanMode: isOn ? 3 : 0, // High : Off
            percentSetting: isOn ? 100 : 0,
            percentCurrent: isOn ? 100 : 0
        }
    };
};

FanItem.prototype.getMatterHandlers = function() {
    return {
        fanControl: {
            fanModeChange: (request) => this.setItemState(request.fanMode !== 0, () => {}),
            percentSettingChange: (request) => this.setItemState((request.percentSetting || 0) > 0, () => {})
        }
    };
};

module.exports = FanItem;