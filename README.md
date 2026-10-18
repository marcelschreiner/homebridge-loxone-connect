# homebridge-loxone-connect
Homebridge plugin for controlling Loxone.

❤️ [One-time donation](https://paypal.me/activebyte)

There are a few variants from the original loxone homebridge plugin,
but they all have the same problem. Most of them are abandoned and they don't work completely.
Those are the two main reason that i made this plugin, i also added a lot of fun and useful stuff.

Feature requests are always welcome!

The plugin will be able to communicate with the following items from your Loxone setup:
  - Lights (Switches, Dimmers and RGB/ Smart-actor RGBW leds)
  - Sensors (Temperature, Humidty, Light, Motion, Contact, Leak and Smoke)*
  - Presence detector
  - Energy meter (power and energy, Matter only)
  - Switches (On/Off, Pushbutton, Stairwell, Radio)
  - Doorbell notification*
  - Valve, Sprinklers*
  - HomeKit trigger*
  - Window blinds
  - Alarm system
  - Outlet*
  - Gate
  - Lock*
  - Fan*

*Needs additional configuration, check [assumptions](#assumptions).
The only configuration required is the credentials to your Loxone miniserver.

# Prerequisites
[Homebridge](https://github.com/homebridge/homebridge) 1.8 or newer, Homebridge 2 is supported (including Matter).
Follow all the installation steps there.

# Installation

Install the plugin through npm or download the files from here.

```sh
$ sudo npm install -g homebridge-loxone-connect
```
Or update to latest version when already installed:
```sh
$ sudo npm update -g homebridge-loxone-connect
```

# Configuration
See config-sample.json for an example configuration. 

### Platform configuration

| Parameter | Note |
| --- | --- |
| `host` | IP of your loxone miniserver |
| `port` | optional, port of your miniserver (default: 80) |
| `username` | loxone username |
| `password` | loxone password |
| `options` | optional, check [options](#options) |
| `alias` | optional, check [assumption aliases](#assumption-aliases)|

### Options

| Parameter | Note |
| --- | --- |
| `rooms` | optional, specify an array of interested rooms to filter on. If empty or not given, all elements are used. <br/> Example: specifying "rooms" : ["Kitchen", "Bedroom"] will limit your bridge to only elements from those 2 rooms.  |
| `stairwellSwitch` | optional, choose the switch behavior of the Stairwell Light Switch, default: "pulse".<br/><br/> Has 2 possible values: <br/> * pulse : Normal operation, light will stay on for fixed amount of time. This is the default in case not given. <br/> * on : Light will stay on as long as the switch is enabled. |
| `moodSwitches` | optional, displays Loxone moods (wich are part of LightControllerV2 elements) as seperate buttons, default: "none". <br/><br/>  Has 3 possible values: <br/>* none : does not include moods. This is the default in case not given. <br/> * all : include moods as actionable item. <br/> * only : only include moods and filter out any other element. |
| `radioSwitches` | optional, displays Loxone radio switches, default: "1". |
| `alarmSystem` | optional, choose between instant and delayed activation of the alarm, default: "delayedon". <br/><br/> Has 2 possible values <br/> * delayedon : Alarm will be delayed. Default. <br/> * on : Alarm will be instantly on. |
| `alarmTrigerLevel` | optional, choose at what level the alarm notification will be send to HomeKit, default: "5". <br/><br/> Has 6 possible values:<br/> * 1 : Silent.<br/> * 2 : Acustic.<br/> * 3 : Optical.<br/> * 4 : Internal.<br/> * 5 : External.<br/> * 6 : Remote. |
| `autoLock` | optional, whether the lock should automatically lock after being opened, default: "1". |
| `autoLockDelay` | optional, time (in seconds) until the lock will auto lock if enabled, default: "5". |
| `hap` | optional, publish the items as HomeKit (HAP) accessories, default: true. |
| `matter` | optional, publish the items as Matter accessories, default: true. Only has an effect on Homebridge 2 with Matter enabled on the bridge, check [Matter](#matter). |

### Assumption aliases

| Parameter | Note |
| --- | --- |
| `Outlet` | Outlet alias. |
| `Lighting` | Lighting alias. |
| `Doorbell` | Contact sensor alias. |
| `Trigger` | Trigger alias. |
| `Contact` | Contact sensor alias. |
| `Motion` | Motion sensor alias. |
| `Brightness` | Light sensor alias. |
| `Temperature` | Temperature sensor alias. |
| `Humidity` | Humidity sensor alias. |
| `Leak` | Leak sensor alias. |
| `Smoke` | smoke sensor alias. |
| `Valve` | Valve alias. |
| `Sprinklers` | Sprinklers alias. |
| `Fan` | Fan alias. |
| `Lock` | Lock alias. |
| `DefaultMood` | LightControllerV2 default mood alias. (Default 'Off') |

For more information check [assumptions](#assumptions).

# Matter

Starting with Homebridge 2, the plugin can also expose your Loxone items via [Matter](https://csa-iot.org/all-solutions/matter/), so they can be used with Apple Home, Google Home, Amazon Alexa, SmartThings and other Matter controllers.

1. Update to Homebridge 2.
2. Enable Matter for the bridge the plugin runs on (Homebridge UI: bridge settings, or add a `"matter": {}` block to `bridge` in your config.json, or to `_bridge` when running the plugin as child bridge).
3. Restart Homebridge and pair the Matter bridge with the Matter QR code / pairing code shown in the Homebridge UI.

HomeKit (HAP) and Matter work side by side. If you pair both with Apple Home, every item shows up twice: set `"hap": false` in the options to only use Matter, or `"matter": false` to only use HomeKit.

| Loxone item | Matter device type |
| --- | --- |
| Switch, Stairwell switch, Pushbutton, Radio switch, Mood | On/Off Switch |
| Lightbulb | On/Off Light |
| Dimmer | Dimmable Light |
| Color picker (RGB / LightControllerV2) | Extended Color Light |
| Outlet | On/Off Plug-in Unit |
| Fan | Fan (off / high) |
| Window blinds (Jalousie) | Window Covering (lift, with slat tilt for shutters) |
| Lock | Door Lock |
| Valve, Sprinklers | Water Valve |
| Temperature, Humidity, Light, Motion, Contact, Leak and Smoke sensor | matching Matter sensor |
| Presence detector | Occupancy Sensor |
| Energy meter (Meter block) | Electrical Sensor (power and energy, Matter only) |
| Doorbell, Trigger | Generic Switch (button press) |
| Gate, Alarm system | not available via Matter, HomeKit only |

Energy meters measuring power (format in W or kW) are exposed with their current power and, if available, the total energy (consumed and, for bidirectional meters, fed in). HomeKit (HAP) has no matching service, so they are only available via Matter. Meters counting water, gas, ... are skipped.

Whether a device type is shown and controllable depends on the Matter controller (e.g. Apple Home doesn't support every Matter device type yet).

# Assumptions
To create the correct accessory type from Loxone items, some attribute parsing is required inside Loxone config.<br/>
The prefixes can be changed in [assumption aliases](#assumption-aliases).<br/>
Currently these assumptions are made:<br/>

### Lightbulb

To make a lightbulb accessory you have to give a switch the prefix "Lighting" or you can give it the lightning category.
*You can use a different category name as long as the category has the lightning icon.

### Outlet

To make a lightbulb accessory you have to give a switch the prefix "Outlet" or you can give it the power category.
*You can use a different category name as long as the category has the power icon.

### Fan

To make a fan accessory you have to give a switch the prefix "Fan".

### Lock

To make a lock accessory you have to give a switch the prefix "Lock".
*automatic locking can be configured.

### Valve, Sprinklers

To make a valve or sprinkler accessory you have to give a switch the prefix "Valve" or "Sprinklers".

### Sensors, Doorbell, Trigger

For the following accessory's you will have to use a "Virtual Status block" inside Loxone config to make the following sensors.

| Accessory | Note |
| --- | --- |
| `Doorbell` | Has to have prefix "Doorbell".<br/>The Doorbell will show 'Not compatible' but it will still send the notification. |
| `Trigger` | Has to have prefix "Trigger".<br/>This can be used for Homekit automation like triggering a scene to become active. |
| `Contact sensor` | Has to have prefix "Contact". |
| `Motion sensor` | Has to have prefix "Motion". |
| `Light sensor` | Has to have prefix "Brightness". |
| `Temperature sensor` | Has to have prefix "Temperature". |
| `Humidity sensor` | Has to have prefix "Humidity". |
| `Leak sensor` | Has to have prefix "Leak". |
| `Smoke sensor` | Has to have prefix "Smoke". |

The controls will be named like you named them in Loxone Config. Rename them through the iOS Home app to make it more intuitive for using with Siri. Eg LIGHT_KITCHEN can be renamed to 'main light' and added to room Kitchen. Then you can ask Siri to 'turn on the main light in the kitchen'.

# Limitations

### Rooms

The Homebridge/HAP protocol does currently not allow attaching the Loxone rooms to the accessories. That is a manual action to be done once using the IOS Home app (or the Eve app which is much more user-friendly).

_Special note: organizing into rooms can be done from Eve, but renaming the items should (unfortunately) be done from the IOS Home app. Name changes in Eve are not reflected in Home and thus not known by Siri._

### 100 items

HomeKit has a limit of 100 accessories per bridge. If you have a large Loxone setup, try to filter unneeded items out either through [a dedicated Loxone usergroup](https://github.com/Sroose/homebridge-loxone-ws/issues/27) or in the checkCustomAttrs function.

### Visualization password

Currently node-lox-ws-api does not support Loxone blocks with a visualization password on it. We are looking into solving this issue.

### pushbuttons

Since Homekit has no pushbutton concept, I implemented pushbuttons as switches in Homekit. Telling Siri to put them On will send a pulse to the pushbutton. In Homekit, they will appear to be On for a second.

# Problem solving

If you have troubles getting the states on your iOS device, [try removing the files in your 'persists' folder](https://github.com/nfarina/homebridge#my-ios-app-cant-find-homebridge) (usually in ~/.homebridge/persist) and restarting homebridge.


License
----

The plugin is released under MIT license, which means you can do whatever you want with it as long as you give credit.

Credits
----
The original Loxone WS work was done by [Sroose](https://github.com/Sroose/homebridge-loxone-ws)

Attribution goes towards [Tommaso Marchionni](https://github.com/tommasomarchionni). The structure of this code is based on his [openHAB plugin](https://github.com/tommasomarchionni/homebridge-openHAB).

The original HomeKit API work was done by [Khaos Tian](https://github.com/KhaosT) in his [HAP-NodeJS](https://github.com/KhaosT/HAP-NodeJS) project.

The [homebridge](https://github.com/nfarina/homebridge) component on which this plugin is built was created by [Nick Farina](https://github.com/nfarina).
