const Bacon = require('baconjs');
const path = require('path')
const fs = require('fs')

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







  plugin.id = "sk-to-csv"
  plugin.name = "Log Signal K to CSV"
  plugin.description = "Plugin to log Signal K to CSV"

  plugin.schema = {
    type: "object",
    title: "Conversions to CSV",
    description: "Save SignalK keys to a CSV file, one line every 2 seconds.",
    properties: {}
  }
  
  plugin.start = function(options) {
    const selfContext = 'vessels.' + app.selfId
    const selfMatcher = (delta) => delta.context && delta.context === selfContext

    function mapLogger(keys) {
      const selfStreams = keys.map(app.streambundle.getSelfStream, app.streambundle);
      const debounce = 2000;
      const ttl = 2000;
      var nextOutput = 0;
      console.log("Subscribing to ",keys, selfStreams);
      plugin.unsubscribes.push(Bacon.mergeAll(selfStreams)
        .subscribe(function sub(events) {
        console.log("Logger Got",events);
      }));
    }

    var current = [];




    function combine(sentence) {
      current[sentence.id] = 0;
       plugin.unsubscribes.push(app.streambundle.getSelfStream(sentence.key).onValue(value => {
            current[sentence.id] = value;
        }));
    }
    plugin.columns = [];
    plugin.columns[0] = 'ts';
    // subscribe to each active stream to accumulate the current value.
    var idx = 1;
    for (var i = plugin.sentences.length - 1; i >= 0; i--) {
        var sentence = plugin.sentences[i];
        if ( options[sentence.optionKey]) {
          sentence.id = idx;

          plugin.columns[sentence.id] = sentence.optionKey;
          idx++;
          combine(sentence);
        }
    };

    plugin.logger = new Logger("../signalklogs/lunalog-",plugin.columns.join(','));


    plugin.running = true;

    // create an event stream to emit the current value every 2s.
    var outputStream = Bacon.fromPoll(2000, function() {
      if ( plugin.running ) {
        return Bacon.Next(current);
      } else {
        return Bacon.End();
      }
    });

    // subscribe to that stream to perform the output.
    plugin.unsubscribes.push(outputStream.subscribe(values => {
      current[0] = new Date().getTime();
      var output = [];
      output[0] = current[0];
      for (var i = 1; i < current.length; i++) {
        output[i] = current[i].toPrecision(4);
      };
      plugin.logger.log(output.join(","));
    }));

  }

  plugin.stop = function() {
    plugin.running = false;
    plugin.unsubscribes.forEach(f => f());
    plugin.logger.close();
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








