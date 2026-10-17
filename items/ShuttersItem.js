
const ShuttersItem = function(widget,platform,homebridge) {

    this.platform = platform;
    this.uuidAction = widget.uuidAction; // to control a shutter, use the uuidAction
    this.positionUuid = widget.states.position; // a shutter always has a state called position, which is the uuid which will receive the event to read the current postion
    this.slateUuid = widget.states.shadePosition; // a shutter always has a state called shadePosition, which is the uuid which will receive the event to read the current slate postion
    this.initialValue = true;
    this.initialSlateValue = true;
    this.inControl = false;

    //100 means fully open
    this.currentPosition = 100;
    this.targetPosition = 100;
    this.startedPosition = 100;
    // 90 means the outer facing edge lower than the inner facing edge
    this.currentSlatePosition = 90;
    this.targetSlatePosition = 90;
    this.startedSlatePosition = 90;

    ShuttersItem.super_.call(this, widget,platform,homebridge);

    this.positionState = this.homebridge.hap.Characteristic.PositionState.STOPPED;
};

// Register a listener to be notified of changes in this items value
ShuttersItem.prototype.initListener = function() {
    this.platform.ws.registerListenerForUUID(this.positionUuid, this.positionCallback.bind(this));
    this.platform.ws.registerListenerForUUID(this.slateUuid, this.slateCallback.bind(this));
};

ShuttersItem.prototype.positionCallback = function(value) {
    //function that gets called by the registered ws listener
    //console.log("Got new state for blind " + value);

    //incomign values from blinds are decimal (0 - 1)
    value *= 100;
    //in Homekit, 100% means OPEN while in Loxone this means CLOSED: reverse
    value = parseInt(100 - value);

    if(this.initialValue) {
        //this is the initial value. therfore, also set current targetValue on the same
        this.targetPosition = value;
        this.initialValue = false;
    }
    //if extenal actor changed the blinds, it's important that we set the targetvalue to the new real situation
    if(!this.inControl) {
        this.targetPosition = value;
    }

    //define states for Homekit
    const delta = Math.abs(parseInt(value) - this.targetPosition);

    let ps = this.homebridge.hap.Characteristic.PositionState.INCREASING;
    if (delta < 3) {
        //blinds don't always stop at the exact position, so take a margin of 3% here
        ps = this.homebridge.hap.Characteristic.PositionState.STOPPED;
    } else if (parseInt(value) > this.targetPosition){
        ps = this.homebridge.hap.Characteristic.PositionState.DECREASING;
    }

    this.currentPosition = value;

    //also make sure this change is directly communicated to HomeKit
    this.otherService
        .getCharacteristic(this.homebridge.hap.Characteristic.PositionState)
        .updateValue(ps);

    this.otherService
       .getCharacteristic(this.homebridge.hap.Characteristic.TargetPosition)
       .updateValue(parseInt(this.targetPosition));

    this.otherService
        .getCharacteristic(this.homebridge.hap.Characteristic.CurrentPosition)
        .updateValue(value);

    this.updateMatterState();
};

ShuttersItem.prototype.slateCallback = function(value) {
    //function that gets called by the registered ws listener
    //console.log("Got new state for blind " + value);

    //incomign values from blinds are decimal (0 - 1) but HomeKit is from -90 to +90
    value = value * 180 - 90;
    
    value = parseInt(value);

    if(this.initialSlateValue) {
        //this is the initial value. therfore, also set current targetValue on the same
        this.targetSlatePosition = value;
        this.initialSlateValue = false;
    }
    //if extenal actor changed the blinds, it's important that we set the targetvalue to the new real situation
    if(!this.inControl) {
        this.targetSlatePosition = value;
    }

    this.currentSlatePosition = value;

    this.otherService
       .getCharacteristic(this.homebridge.hap.Characteristic.TargetHorizontalTiltAngle)
       .updateValue(parseInt(this.targetSlatePosition));

    this.otherService
        .getCharacteristic(this.homebridge.hap.Characteristic.CurrentHorizontalTiltAngle)
        .updateValue(value);

    this.updateMatterState();
};

ShuttersItem.prototype.getOtherServices = function() {

    const otherService = new this.homebridge.hap.Service.WindowCovering();

    otherService.getCharacteristic(this.homebridge.hap.Characteristic.CurrentPosition)
        .on('get', this.getItemCurrentPosition.bind(this))
        .updateValue(this.currentPosition);

    otherService.getCharacteristic(this.homebridge.hap.Characteristic.TargetPosition)
        .on('set', this.setItem.bind(this))
        .on('get', this.getItemTargetPosition.bind(this))
        .updateValue(this.currentPosition);

    otherService.getCharacteristic(this.homebridge.hap.Characteristic.CurrentHorizontalTiltAngle)
        .on('get', this.getSlateCurrentPosition.bind(this))
        .updateValue(this.currentSlatePosition);

    otherService.getCharacteristic(this.homebridge.hap.Characteristic.TargetHorizontalTiltAngle)
        .on('set', this.setSlate.bind(this))
        .on('get', this.getSlateTargetPosition.bind(this))
        .updateValue(this.currentSlatePosition);

    otherService.getCharacteristic(this.homebridge.hap.Characteristic.PositionState)
        .on('get', this.getItemPositionState.bind(this))
        .updateValue(this.positionState);

    return otherService;
};

ShuttersItem.prototype.getItemPositionState = function(callback) {
    callback(undefined,this.positionState);
};

ShuttersItem.prototype.getItemTargetPosition = function(callback) {
    callback(undefined,this.targetPosition);
};

ShuttersItem.prototype.getItemCurrentPosition = function(callback) {
    callback(undefined,this.currentPosition);
};

ShuttersItem.prototype.setItem = function(value, callback) {

    //sending new state (pct closed) to loxone
    const self = this;

    //set a flag that we're in control. this way we'll know if the action is coming from Homekit or from external actor (eg Loxone app)
    //this flag is removed after 20 seconds (increase if you have really long or slow blinds ;)
    this.inControl = true;
    setTimeout(() => { self.inControl = false; }, 55000);

    this.startedPosition = this.currentPosition;
    this.startedSlatePosition = this.currentSlatePosition;
    this.targetPosition = parseInt(value);

    this.setBoth(value, this.targetSlatePosition, callback);
};

ShuttersItem.prototype.getSlateTargetPosition = function(callback) {
    callback(undefined,this.targetSlatePosition);
};

ShuttersItem.prototype.getSlateCurrentPosition = function(callback) {
    callback(undefined,this.currentSlatePosition);
};

ShuttersItem.prototype.setSlate = function(value, callback) {

    //sending new state (pct closed) to loxone
    const self = this;

    //set a flag that we're in control. this way we'll know if the action is coming from Homekit or from external actor (eg Loxone app)
    //this flag is removed after 20 seconds (increase if you have really long or slow blinds ;)
    this.inControl = true;
    setTimeout(() => { self.inControl = false; }, 2400);

    this.startedPosition = this.currentPosition;
    this.startedSlatePosition = this.currentSlatePosition;
    this.targetSlatePosition = parseInt(value);

    this.setBoth(this.targetPosition, value, callback);
};

ShuttersItem.prototype.setBoth = function(positionValue, slateValue, callback) {
    // if the shutter is all the way up ignore the slate position to prevent lowering after fully up
    var newSlateValue = slateValue
    if (positionValue > 97) {
        newSlateValue = -90;
        this.targetSlatePosition = parseInt(newSlateValue);
    } else if (this.startedPosition > 97 && this.startedSlatePosition < -87) {
        newSlateValue = 90;
        this.targetSlatePosition = parseInt(newSlateValue);
    }

    let loxonePositionValue = 100 - parseInt(positionValue);

    let loxoneSlateValue = parseInt((newSlateValue + 90) * 100 / 180);

    let command = `manualPosBlind/${loxonePositionValue}/${loxoneSlateValue}`;

    this.log(`[Shutters] HomeKit - send message to ${this.name}: ${command}`);
    this.platform.ws.sendCommand(this.uuidAction, command);
    callback();
};

//Matter uses 0 = open and 10000 = closed for lift, and 0 = horizontal and 10000 = vertical (closed) for tilt
//HomeKit uses 100 = open for lift and -90 to 90 degrees for tilt
ShuttersItem.prototype.getMatterDeviceType = function(matter) {
    return matter.deviceTypes.WindowCovering;
};

ShuttersItem.prototype.getMatterStaticClusters = function() {
    // position aware lift and tilt are needed for the percentage attributes
    return {
        windowCovering: {
            type: 8, // TiltBlindLiftAndTilt
            configStatus: { operational: true, onlineReserved: true, liftMovementReversed: false, liftPositionAware: true,
                tiltPositionAware: true, liftEncoderControlled: false, tiltEncoderControlled: false }
        }
    };
};

ShuttersItem.prototype.getMatterState = function() {
    const tilt = angle => Math.min(10000, Math.max(0, Math.round((angle + 90) / 180 * 10000)));
    return {
        windowCovering: {
            currentPositionLiftPercent100ths: Math.round((100 - this.currentPosition) * 100),
            targetPositionLiftPercent100ths: Math.round((100 - this.targetPosition) * 100),
            currentPositionTiltPercent100ths: tilt(this.currentSlatePosition),
            targetPositionTiltPercent100ths: tilt(this.targetSlatePosition)
        }
    };
};

ShuttersItem.prototype.getMatterHandlers = function() {
    const noop = () => {};
    return {
        windowCovering: {
            upOrOpen: () => this.setItem(100, noop),
            downOrClose: () => this.setItem(0, noop),
            stopMotion: () => {
                this.targetPosition = this.currentPosition;
                this.targetSlatePosition = this.currentSlatePosition;
                this.log(`[Shutters] Matter - send message to ${this.name}: stop`);
                this.platform.ws.sendCommand(this.uuidAction, 'stop');
            },
            goToLiftPercentage: (request) => this.setItem(Math.round(100 - request.liftPercent100thsValue / 100), noop),
            goToTiltPercentage: (request) => this.setSlate(Math.round(request.tiltPercent100thsValue / 10000 * 180 - 90), noop)
        }
    };
};

module.exports = ShuttersItem;