/*jshint node:true */
"use strict";
/* based on https://github.com/etsy/statsd/blob/master/lib/process_metrics.js converted into a class and refactored a bit */

module.exports = (function(){


  function Metrics(backends){
    this.metrics = {};
    this.backends = backends;
    return this;
  }

  Metrics.prototype.close = function() {
    for (var i = 0; i < this.backends.length; i++) {
      this.backends[i].close();
    }
  };

  Metrics.prototype.update = function(key, value) {
    this.metrics[key] = value;
  };

  Metrics.prototype.flush = function(flushInterval) {
    var ts = Math.round(Date.now()/1000);
    for (var i = 0; i < this.backends.length; i++) {
      this.backends[i].flush(ts, this.metrics);
    }
  };

  return {
    Metrics : Metrics
  };
}());

