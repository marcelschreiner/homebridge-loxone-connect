// Loxone presence detector block, exposed as motion sensor (HomeKit) / occupancy sensor (Matter)
const PresenceDetectorItem = function(widget, platform, homebridge) {
    this.stateUuid = widget.states.active;

    PresenceDetectorItem.super_.call(this, widget, platform, homebridge);
};

// Register a listener to be notified of changes in this items value
PresenceDetectorItem.prototype.initListener = function() {
    this.platform.ws.registerListenerForUUID(this.stateUuid, this.callBack.bind(this));
};

module.exports = PresenceDetectorItem;
