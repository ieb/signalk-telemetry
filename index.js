/*jshint node:true */
"use strict";

const Bacon = require('baconjs');
const path = require('path')
const fs = require('fs')
const Metrics = require('./process').Metrics;

module.exports = function(app) {



  var plugin = {
    unsubscribes: []
  };


  var loadBackends = function(app, plugin) {
    fpath = path.join(__dirname, 'backends')
    files = fs.readdirSync(fpath).filter(function(f) {
      return f.endsWith('.js');
    });
    return files.map(fname => {
      var backendDriver = path.basename(fname, '.js')
      var sobj = require(path.join(fpath, backendDriver));
      if ( sobj !== undefined ) {
         sobj.optionKey = backendDriver; 
      } else {
        console.log("Failed to load backend ", backendDriver);
      }
      return sobj;
    }).filter(backend => { return typeof backend !== 'undefined' && typeof backend.schema !== 'undefined' });
  }




  plugin.id = "sk-telemetry"
  plugin.name = "Signal K Telemetry"
  plugin.description = "Plugin Output SignalK data as metrics Telemetry"

  
  plugin.start = function(options) {
    var activeBackends = [];
    for (var i = 0; i < plugin.backends.length; i++) {
      var backend = plugin.backends[i];
      if ( options.backends[backend.optionKey] !== undefined ) {
        if ( options.backends[backend.optionKey].enabled ) {
          activeBackends.push(new backend.Backend(plugin, options, options.backends[backend.optionKey]));
        }
      }
    }


    plugin.metrics = new Metrics(activeBackends);

    function combine(sentence) {
       plugin.unsubscribes.push(app.streambundle.getSelfStream(sentence.key).onValue(value => {
          try {
            plugin.metrics.update(sentence.key, sentence.toDisplayValue(value));
          } catch (e) {
            console.log(e);
            console.log("Failed to update ", sentence);
          }
        }));
    }


    // subscribe to each active stream to accumulate the current value.
    for (var i = plugin.sentences.length - 1; i >= 0; i--) {
        var sentence = plugin.sentences[i];
        if ( options.sentences[sentence.optionKey]) {
          combine(sentence);
        }
    };




    plugin.interval = setInterval(function() {
      plugin.metrics.flush(2000);
    }, 2000);

  }

  plugin.stop = function() {
    clearInterval(plugin.interval);
    plugin.unsubscribes.forEach(f => f());
    if ( plugin.metrics !== undefined ) {
       plugin.metrics.close();
    }
  }
  var toDegreesRelative = function(v) {
    var d = v*180/Math.PI;
    var n = 0;
    while ( d > 180 ) {
      d = d - 360;
    }
    while ( d < -180 ) {
      d = d + 360;
    }
    return d;

  }
  var toDegreesDirection = function(v) {
    var d = v*180/Math.PI;
    var n = 0;
    while ( d > 360 ) {
      d = d - 360;
    }
    while ( d < 0 ) {
      d = d + 360;
    }
    return d;

  }
  var toKnots = function(v) {
    return v*3600/1852.0; 
  }
  var toLattitude = function(v) {
    return v;
  }
  var toLongitude = function(v) {
    return v;
  }
  var toPercentage = function(v) {
    return v*100;

  }
  var toMeters = function(v) {
    return v;

  }

  var toMbar = function(v) {
    return v / 100;
  }

  var toCelcius = function (v) {
    return v - 273.15;
  }

  var toRelativeHumidity = function(v) {
    return v;
  }


  plugin.sentences = [
     {
        title: 'Aparent Wind Angle',
        optionKey: 'awa',
        key: 'environment.wind.angleApparent',
        toDisplayValue: toDegreesRelative
     },
     {
        title: 'Aparent Wind Speed',
        optionKey: 'aws',
        key: 'environment.wind.speedApparent',
        toDisplayValue: toKnots
     },
     {
        title: 'True Wind Angle',
        optionKey: 'twa',
        key: 'environment.wind.angleTrue',
        toDisplayValue: toDegreesRelative
     },
     {
        title: 'True Wind Speed',
        optionKey: 'tws',
        key: 'environment.wind.speedTrue',
        toDisplayValue: toKnots 
     },
     {
        title: 'True Wind Direction',
        optionKey: 'twd',
        key: 'environment.wind.directionTrue',
        toDisplayValue: toDegreesDirection 
     },
     {
        title: 'Ground Wind Angle',
        optionKey: 'gwa',
        key: 'environment.wind.angleGround',
        toDisplayValue: toDegreesRelative 
     },
     {
        title: 'Ground Wind Speed',
        optionKey: 'gws',
        key: 'environment.wind.speedGround',
        toDisplayValue: toKnots 
     },
     {
        title: 'True Wind Direction',
        optionKey: 'gwd',
        key: 'environment.wind.directionGround',
        toDisplayValue: toDegreesDirection 
     },
     {
        title: 'Course over Ground',
        optionKey: 'cog',
        key: 'navigation.courseOverGround',
        toDisplayValue: toDegreesDirection 
     },
     {
        title: 'Speed over Ground',
        optionKey: 'sog',
        key: 'navigation.speedOverGround',
        toDisplayValue: toKnots 
     },
     {
        title: 'Latitide',
        optionKey: 'lat',
        key: 'environment.wind.speedApparent',
        toDisplayValue: toLattitude 
     },
     {
        title: 'Longitude',
        optionKey: 'lon',
        key: 'environment.wind.speedApparent',
        toDisplayValue: toLongitude 
     },
     {
        title: 'Depth',
        optionKey: 'dbt',
        key: 'environment.depth.belowTransducer',
        toDisplayValue: toMeters 
     },
     {
        title: 'Speed Through water',
        optionKey: 'stw',
        key: 'navigation.speedThroughWater',
        toDisplayValue: toKnots 
     },
     {
        title: 'Leeway',
        optionKey: 'lwy',
        key: 'avigation.leeway',
        toDisplayValue: toDegreesRelative
     },
     {
        title: 'Target Polar Speed',
        optionKey: 'tps',
        key: 'performance.polarSpeed',
        toDisplayValue: toKnots
     },
     {
        title: 'Polar performance ratio.',
        optionKey: 'ppr',
        key: 'performance.polarSpeedRatio',
        toDisplayValue: toPercentage
     },
     {
        title: 'Optimal Heading on next tack',
        optionKey: 'oph',
        key: 'performance.headingMagnetic',
        toDisplayValue: toDegreesDirection 
     },
     {
        title: 'Optimal True Wind Angle on this tack, for max VMG upwind or downwind',
        optionKey: 'otwa',
        key: 'performance.targetAngle',
        toDisplayValue: toDegreesRelative 
     },
     {
        title: 'Target speed through water at optimal True Wind Angle on this tack, for max VMG upwind or downwind',
        optionKey: 'ostw',
        key: 'performance.targetSpeed',
        toDisplayValue: toKnots
     },
     {
        title: 'VMG achievable at polar speed on current true wind angle. ',
        optionKey: 'pvmg',
        key: 'performance.polarVelocityMadeGood',
        toDisplayValue: toKnots 
     },
     {
        title: 'VMG achievable at polar speed on current true wind angle. ',
        optionKey: 'vmg',
        key: 'performance.velocityMadeGood',
        toDisplayValue: toKnots 
     },
     {
        title: 'VMG to Polar VM ratio ',
        optionKey: 'pvmgr',
        key: 'performance.polarVelocityMadeGoodRatio',
        toDisplayValue: toPercentage 
     },
     {
        title: 'Atmospheric Temperature ',
        optionKey: 't',
        key: 'environment.outside.temperature',
        toDisplayValue: toCelcius 
     },
     {
        title: 'Atmospheric Pressure ',
        optionKey: 'p',
        key: 'environment.outside.pressure',
        toDisplayValue: toMbar 
     },
     {
        title: 'Atmospheric Humidity ',
        optionKey: 'rh',
        key: 'environment.outside.humidity',
        toDisplayValue: toRelativeHumidity
     },
     {
        title: 'Inside Temperature ',
        optionKey: 'ti',
        key: 'environment.inside.temperature', 
        toDisplayValue: toCelcius 
     },
     {
        title: 'Rate of turn ',
        optionKey: 'rturn',
        key: 'environment.inside.temperature',
        toDisplayValue: toDegreesRelative
     },
     {
        title: 'Rate of roll ',
        optionKey: 'rroll',
        key: 'navigation.gyro.roll',
        toDisplayValue: toDegreesRelative
     },
     {
        title: 'Rate of pitch ',
        optionKey: 'rpitch',
        key: 'navigation.gyro.pitch', 
        toDisplayValue: toDegreesRelative
     },
     {
        title: 'Rate of yaw ',
        optionKey: 'rpitch',
        key: 'navigation.gyro.yaw',
        toDisplayValue: toDegreesRelative
     },
     {
        title: 'Accel x ',
        optionKey: 'accelx',
        key: 'navigation.accel.x', 
        toDisplayValue: toMeters
     },
     {
        title: 'Accel y ',
        optionKey: 'accely',
        key: 'navigation.accel.y' , 
        toDisplayValue: toMeters
     },
     {
        title: 'Accel z ',
        optionKey: 'accelz',
        key: 'navigation.accel.z', 
        toDisplayValue: toMeters
     },
     {
        title: 'Sensor Heading Magnetic ',
        optionKey: 'shdm',
        key: 'navigation.headingMagnetic',
        toDisplayValue: toDegreesDirection
     },
     {
        title: 'Roll ',
        optionKey: 'roll',
        key: 'navigation.attitude.roll',
        toDisplayValue: toDegreesRelative
     },
     {
        title: 'Pitch ',
        optionKey: 'pitch',
        key: 'navigation.attitude.pitch',
        toDisplayValue: toDegreesRelative
     }

  ];

  plugin.schema = {
    type: "object",
    title: "Emits SignalK Telemetry data",
    description: "Emits SignalK Data as telemety or the configured backend target.",
    properties: {
      sentences: {
        type: "object",
        title: "Sentences",
        description: "Select sentences to capture",
        properties: {
        }
      },
      backends: {
        type: "object",
        title: "Backends",
        description: "Enable and configure backends",
        properties: {
        }
      }

    }
  }

  plugin.uiSchema = {
    "ui:order": [
    'sentences',
    'backends'
    ]
  };


  plugin.backends = loadBackends();
  for (var i = 0; i < plugin.backends.length; ++i) {
    var backend = plugin.backends[i];
    plugin.schema.properties.backends.properties[backend.optionKey] =  {
      type: 'object',
      title: backend.title,
      properties : backend.schema
    }
  }

  //===========================================================================
  for (var i = plugin.sentences.length - 1; i >= 0; i--) {
    var sentence = plugin.sentences[i];
    plugin.schema.properties.sentences.properties[sentence.optionKey] = {
      title: sentence['title'],
      type: "boolean",
      default: false
    }
  };
  


  return plugin;
}








