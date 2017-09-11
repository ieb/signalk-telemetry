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

  var Logger = function(logBase, headerLine) {
    this.logFileHour = undefined;
    this._stream = undefined;
    this.headerLine = headerLine+"\n";
    this.logBase = logBase;
  }

  Logger.prototype.getLogFileName = function() {
    var d = new Date();
    return this.logBase + d.getUTCFullYear() + ("00"+(d.getUTCMonth()+1)).slice(-2)+("00"+d.getUTCDate()).slice(-2) + ("00"+ d.getUTCHours()).slice(-2) + ".csv";
  };

  Logger.prototype.log = function(message) {
    var currentHour = new Date().getUTCHours();
    if ( this.logFileHour !== currentHour) {
      if ( this._stream !== undefined) {
        this._stream.end();
      }
      var fname = this.getLogFileName();
      var writeheader = true;
      if ( fs.existsSync(fname) && fs.statSync(fname).size > 0) {
        writeheader = false;
      }
      this._stream = fs.createWriteStream(fname, { flags: 'a' });
      this.logFileHour = currentHour;
      if (writeheader) {
        this._stream.write(this.headerLine);
      }
    }
    this._stream.write(message);
    this._stream.write("\n")
  };

  Logger.prototype.close = function() {
    if ( this._stream !== undefined) {
        this._stream.end();
    }
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
      }
      return sobj;
    }).filter(backend => { return typeof backend !== 'undefined' && typeof backend.schema !== 'undefined' });
  }




  plugin.id = "sk-telemetry"
  plugin.name = "Signal K Telemetry"
  plugin.description = "Plugin Output SignalK data as metrics Telemetry"

  plugin.schema = {
    type: "object",
    title: "Emits SignalK Telemetry data",
    description: "Emits SignalK Data as telemety or the configured backend target.",
    properties: {
    }
  }
  
  plugin.start = function(options) {

    console.log("Opionts ",options);

    var activeBackends = [];
    for (var i = 0; i < plugin.backends.length; i++) {
      var backend = plugin.backends[i];
      if ( options[backend.optionKey].enabled !== undefined && options[backend.optionKey].enabled ) {
          activeBackends.push(new backend.Backend(options[backend.optionKey]));
      }
    }


    plugin.metrics = new Metrics(activeBackends);

    function combine(sentence) {
       plugin.unsubscribes.push(app.streambundle.getSelfStream(sentence.key).onValue(value => {
          plugin.metrics.updateGuage(sentence.optionKey, value);
        }));
    }


    // subscribe to each active stream to accumulate the current value.
    for (var i = plugin.sentences.length - 1; i >= 0; i--) {
        var sentence = plugin.sentences[i];
        if ( options[sentence.optionKey]) {
          combine(sentence);
        }
    };



    plugin.running = true;

    // create an event stream to emit the current value every 2s.
    var outputStream = Bacon.fromPoll(2000, function() {
      if ( plugin.running ) {
        console.log("tick");
        return Bacon.Next(new Date());
      } else {
        return Bacon.End();
      }
    });

    // subscribe to that stream to flush metrics periodically.
    plugin.unsubscribes.push(outputStream.subscribe(m => {
      console.log("toc");
      plugin.metrics.flush(2000);
    }));

  }

  plugin.stop = function() {
    plugin.running = false;
    plugin.unsubscribes.forEach(f => f());
    if ( plugin.metrics !== undefined ) {
       plugin.metrics.close();
    }
  }



  plugin.sentences = [
     {
        title: 'Aparent Wind Angle',
        optionKey: 'awa',
        key: 'environment.wind.angleApparent' 
     },
     {
        title: 'Aparent Wind Speed',
        optionKey: 'aws',
        key: 'environment.wind.speedApparent' 
     },
     {
        title: 'True Wind Angle',
        optionKey: 'twa',
        key: 'environment.wind.angleTrue' 
     },
     {
        title: 'True Wind Speed',
        optionKey: 'tws',
        key: 'environment.wind.speedTrue' 
     },
     {
        title: 'True Wind Direction',
        optionKey: 'twd',
        key: 'environment.wind.directionTrue' 
     },
     {
        title: 'Ground Wind Angle',
        optionKey: 'gwa',
        key: 'environment.wind.angleGroun' 
     },
     {
        title: 'Ground Wind Speed',
        optionKey: 'gws',
        key: 'environment.wind.speedGround' 
     },
     {
        title: 'True Wind Direction',
        optionKey: 'gwd',
        key: 'environment.wind.directionGround' 
     },
     {
        title: 'Course over Ground',
        optionKey: 'cog',
        key: 'navigation.courseOverGround' 
     },
     {
        title: 'Speed over Ground',
        optionKey: 'sog',
        key: 'navigation.speedOverGround' 
     },
     {
        title: 'Latitide',
        optionKey: 'lat',
        key: 'environment.wind.speedApparent' 
     },
     {
        title: 'Longitude',
        optionKey: 'lon',
        key: 'environment.wind.speedApparent' 
     },
     {
        title: 'Depth',
        optionKey: 'dbt',
        key: 'environment.depth.belowTransducer' 
     },
     {
        title: 'Speed Through water',
        optionKey: 'stw',
        key: 'navigation.speedThroughWater' 
     },
     {
        title: 'Leeway',
        optionKey: 'lwy',
        key: 'avigation.leeway' 
     },
     {
        title: 'Target Polar Speed',
        optionKey: 'tps',
        key: 'performance.polarSpeed' 
     },
     {
        title: 'Polar performance ratio.',
        optionKey: 'ppr',
        key: 'performance.polarSpeedRatio' 
     },
     {
        title: 'Optimal Heading on next tack',
        optionKey: 'oph',
        key: 'performance.headingMagnetic' 
     },
     {
        title: 'Optimal True Wind Angle on this tack, for max VMG upwind or downwind',
        optionKey: 'otwa',
        key: 'performance.targetAngle' 
     },
     {
        title: 'Target speed through water at optimal True Wind Angle on this tack, for max VMG upwind or downwind',
        optionKey: 'ostw',
        key: 'performance.targetSpeed' 
     },
     {
        title: 'VMG achievable at polar speed on current true wind angle. ',
        optionKey: 'pvmg',
        key: 'performance.polarVelocityMadeGood' 
     },
     {
        title: 'VMG achievable at polar speed on current true wind angle. ',
        optionKey: 'vmg',
        key: 'performance.velocityMadeGood' 
     },
     {
        title: 'VMG to Polar VM ratio ',
        optionKey: 'pvmgr',
        key: 'performance.polarVelocityMadeGoodRatio' 
     }

  ];

  plugin.backends = loadBackends();
  for (var i = 0; i < plugin.backends.length; ++i) {
    var backend = plugin.backends[i];
    plugin.schema.properties[backend.optionKey] =  {
      type: 'object',
      title: backend.title,
      properties : backend.schema
    }
  }

  //===========================================================================
  for (var i = plugin.sentences.length - 1; i >= 0; i--) {
    var sentence = plugin.sentences[i];
    plugin.schema.properties[sentence.optionKey] = {
      title: sentence['title'],
      type: "boolean",
      default: false
    }
  };
  

  return plugin;
}








